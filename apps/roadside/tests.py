from django.test import TestCase
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from decimal import Decimal
import json

from apps.accounts.models import User
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.branches.models import Branch
from apps.roadside.models import RoadsideRequest, RoadsideNote, RoadsidePhoto
from apps.notifications_app.models import Notification
from apps.subscriptions.models import Package, Subscription, SubscriptionUsage
from apps.accounts.admin_models import SystemModule

class RoadsideRequestTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # Create users
        self.user = User.objects.create_user(
            username='user', password='password', email='user@example.com', role='customer'
        )
        self.technician = User.objects.create_user(
            username='tech', password='password', email='tech@example.com', role='technician'
        )
        self.manager = User.objects.create_user(
            username='manager', password='password', email='manager@example.com', role='admin', is_superuser=True, is_staff=True
        )
        
        # Create core data
        self.branch = Branch.objects.create(name="Main Branch", code="MB01", created_by=self.manager)
        SystemModule.objects.get_or_create(slug='roadside', defaults={'name': 'Roadside', 'is_enabled': True})
        self.manager.branch = self.branch
        self.manager.save(update_fields=['branch'])
        self.technician.branch = self.branch
        self.technician.save(update_fields=['branch'])
        self.customer = Customer.objects.create(
            user=self.user,
            customer_number="CUST001"
        )
        # Link user to customer manually if needed (signals might handle it but let's be safe)
        if not hasattr(self.user, 'customer_profile'):
             # Depends on how the OneToOne is set up, usually it's automatic or manual
             pass

        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            license_plate="ABC-123",
            make="Toyota",
            model="Camry",
            year=2020,
            current_mileage=50000,
            vin="VIN1234567890"
        )
        
        # Create Subscription Package
        self.package = Package.objects.create(
            name="Premium Roadside",
            code="RSA-PREM",
            price=Decimal("100.00"),
            created_by=self.manager,
            features={
                "towing_services_km": 100,
                "battery_boosts": 5,
                "flat_tyre_service": 5
            }
        )
        
        # Create Subscription
        self.subscription = Subscription.objects.create(
            customer=self.customer,
            package=self.package,
            vehicle=self.vehicle,
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timezone.timedelta(days=365),
            status='active',
            purchase_price=Decimal("100.00")
        )

        self.url = '/api/roadside/requests/'
        self.client.force_authenticate(user=self.user)

    def test_create_roadside_request_success(self):
        """Test successful creation of a roadside request"""
        data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'service_type': 'battery_boost',
            'breakdown_location': '123 Main St',
            'customer_phone': '1234567890',
            'description': 'Battery dead',
            'branch': self.branch.id # Explicitly passing branch if needed, view logic handles resolving
        }
        
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(RoadsideRequest.objects.count(), 1)
        
        request = RoadsideRequest.objects.get()
        self.assertEqual(request.status, 'requested')
        self.assertEqual(request.service_type, 'battery_boost')
        
        # Verify subscription usage
        self.assertTrue(request.is_covered_by_subscription)
        self.assertTrue(request.subscription_allowance_deducted)
        self.assertEqual(request.subscription_used, self.subscription)
        
        # Verify usage record
        usage = SubscriptionUsage.objects.get(reference_id=request.id)
        self.assertEqual(usage.usage_type, 'battery_boosts')
        self.assertEqual(usage.quantity_used, 1)

    def test_customer_create_binds_to_own_customer_profile(self):
        other_user = User.objects.create_user(
            username='other', password='password', email='other@example.com', role='customer'
        )
        other_customer = Customer.objects.create(user=other_user, customer_number="CUST002")
        other_vehicle = Vehicle.objects.create(
            owner=other_customer,
            license_plate="ZZZ-222",
            make="Nissan",
            model="Altima",
            year=2021,
            current_mileage=10000,
            vin="VINROAD2222"
        )

        response = self.client.post(self.url, {
            'customer': other_customer.id,
            'vehicle': other_vehicle.id,
            'service_type': 'battery_boost',
            'breakdown_location': '123 Main St',
            'customer_phone': '1234567890',
            'branch': self.branch.id
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Vehicle does not belong to this customer', str(response.data))

    def test_create_request_insufficient_allowance(self):
        """Test creation blocked when allowance is exceeded"""
        # Consume all allowance manually first
        SubscriptionUsage.objects.create(
            subscription=self.subscription,
            usage_type='battery_boosts',
            quantity_used=5, # Valid limit is 5
            service_date=timezone.now().date()
        )
        
        data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'service_type': 'battery_boost',
            'breakdown_location': '123 Main St',
            'customer_phone': '1234567890',
            'branch': self.branch.id,
        }
        
        response = self.client.post(self.url, data)
        # Should raise validation error
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Battery Boost allowance is finished", str(response.data))
        self.assertNotIn("service_type", response.data)
        self.assertTrue(response.data.get("pay_as_you_go_available"))

    def test_create_request_pay_as_you_go_when_allowance_finished(self):
        """A finished subscription allowance can be bypassed as pay-as-you-go"""
        SubscriptionUsage.objects.create(
            subscription=self.subscription,
            usage_type='battery_boosts',
            quantity_used=5,
            service_date=timezone.now().date()
        )

        data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'service_type': 'battery_boost',
            'breakdown_location': '123 Main St',
            'customer_phone': '1234567890',
            'pay_as_you_go': True,
            'charge_amount': '75.00',
            'branch': self.branch.id
        }

        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_obj = RoadsideRequest.objects.get(pk=response.data['id'])
        self.assertFalse(request_obj.is_covered_by_subscription)
        self.assertFalse(request_obj.subscription_allowance_deducted)
        self.assertIsNone(request_obj.subscription_used)
        self.assertEqual(request_obj.charge_amount, Decimal('75.00'))
        self.assertEqual(
            SubscriptionUsage.objects.filter(subscription=self.subscription, reference_id=request_obj.id).count(),
            0
        )

    def test_pay_as_you_go_requires_charge_amount(self):
        """Pay-as-you-go override must carry an amount for invoicing"""
        data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'service_type': 'battery_boost',
            'breakdown_location': '123 Main St',
            'customer_phone': '1234567890',
            'pay_as_you_go': True,
            'branch': self.branch.id
        }

        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('pay-as-you-go charge amount', str(response.data))

    def test_global_subscription_limit_message_names_service(self):
        """Global limit failures should be friendly and include the requested service"""
        self.package.features = {
            **self.package.features,
            "total_service_calls": 0,
        }
        self.package.save(update_fields=['features'])

        data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'service_type': 'battery_boost',
            'breakdown_location': '123 Main St',
            'customer_phone': '1234567890',
            'branch': self.branch.id,
        }

        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(
            "Service Calls limit is finished for Battery Boost. Remaining: 0.",
            str(response.data.get('detail'))
        )
        self.assertTrue(response.data.get("pay_as_you_go_available"))

    def test_call_out_charges_do_not_block_available_services(self):
        """Legacy call-out charges should not block services with their own allowance"""
        self.package.features = {
            **self.package.features,
            "emergency_fuel": 1,
            "call_out_charges": 0,
            "total_service_calls": 8,
        }
        self.package.save(update_fields=['features'])

        data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'service_type': 'emergency_fuel',
            'breakdown_location': '123 Main St',
            'customer_phone': '1234567890',
            'branch': self.branch.id,
        }

        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_obj = RoadsideRequest.objects.get(pk=response.data['id'])
        self.assertTrue(request_obj.is_covered_by_subscription)
        self.assertEqual(self.subscription.get_remaining_allowance('emergency_fuel'), Decimal('0'))
        self.assertEqual(self.subscription.get_remaining_allowance('total_service_calls'), Decimal('7'))
        self.assertEqual(SubscriptionUsage.objects.filter(subscription=self.subscription, usage_type='call_out_charges').count(), 0)

    def test_unavailable_service_message_takes_priority_over_global_limit(self):
        """Unavailable service failures should not be masked by package-wide limits"""
        self.package.features = {
            "battery_boosts": 5,
            "total_service_calls": 0,
        }
        self.package.save(update_fields=['features'])

        data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'service_type': 'emergency_fuel',
            'breakdown_location': '123 Main St',
            'customer_phone': '1234567890',
            'branch': self.branch.id,
        }

        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(
            "Emergency Fuel Delivery is not available under this subscription.",
            str(response.data.get('detail'))
        )
        self.assertNotIn("Service Calls", str(response.data))

    def test_create_towing_request_distance_validation(self):
        """Test towing request requires distance and checks allowance"""
        data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'service_type': 'towing',
            'breakdown_location': 'Highway 1',
            'customer_phone': '1234567890',
            'branch': self.branch.id,
        }
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Add distance but too much (120km > 100km allowance)
        data['tow_distance_km'] = 120
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Towing Service allowance is not enough", str(response.data))
        
        # Valid distance
        data['tow_distance_km'] = 50
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        request = RoadsideRequest.objects.get()
        self.assertTrue(request.is_covered_by_subscription)
        
        usage = SubscriptionUsage.objects.get(reference_id=request.id)
        self.assertEqual(usage.quantity_used, 50)

    def test_request_lifecycle_and_invoicing(self):
        """Test full lifecycle: Dispatch -> Complete -> Invoice"""
        
        # Create request that is NOT covered by subscription (no sub for this vehicle/type logic, or just manually set)
        # To force "not covered", we can create a request for a service type not in package or for a vehicle not in sub (if sub is per vehicle)
        # Or just create a new vehicle without sub
        vehicle_no_sub = Vehicle.objects.create(
            owner=self.customer, license_plate="XYZ-999", make="Honda", model="Civic", year=2019,
            current_mileage=30000,
            vin="VIN9876543210"
        )
        
        data = {
            'customer': self.customer.id,
            'vehicle': vehicle_no_sub.id,
            'service_type': 'flat_tyre',
            'breakdown_location': 'Home',
            'customer_phone': '1234567890',
            'branch': self.branch.id
        }
        
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_id = response.data['id']
        
        request_obj = RoadsideRequest.objects.get(pk=request_id)
        self.assertFalse(request_obj.is_covered_by_subscription)
        
        # Update charge amount (manager usually does this, or it's set logic)
        # Let's say manager updates it
        self.client.force_authenticate(user=self.manager)
        update_data = {'charge_amount': '50.00'}
        self.client.patch(f"{self.url}{request_id}/", update_data)
        
        # Dispatch
        assign_data = {'technician_id': self.technician.id}
        self.client.post(f"{self.url}{request_id}/assign_dispatch/", assign_data)
        request_obj.refresh_from_db()
        self.assertEqual(request_obj.status, 'dispatched')
        
        # En Route
        self.client.post(f"{self.url}{request_id}/en_route/")
        request_obj.refresh_from_db()
        self.assertEqual(request_obj.status, 'en_route')
        
        # Arrive
        self.client.post(f"{self.url}{request_id}/arrive/")
        request_obj.refresh_from_db()
        self.assertEqual(request_obj.status, 'on_site')

        # In Progress
        self.client.post(f"{self.url}{request_id}/in_progress/")
        request_obj.refresh_from_db()
        self.assertEqual(request_obj.status, 'in_progress')
        
        # Complete
        response = self.client.post(f"{self.url}{request_id}/complete/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        request_obj.refresh_from_db()
        self.assertEqual(request_obj.status, 'completed')
        
        # Verify Invoice Created
        self.assertIsNotNone(request_obj.invoice)
        self.assertEqual(request_obj.invoice.total, Decimal('50.00'))
        self.assertEqual(request_obj.invoice.customer, self.customer)

    def test_non_subscription_request_requires_charge_before_completion(self):
        """Pay-per-use requests cannot complete without a charge amount"""
        vehicle_no_sub = Vehicle.objects.create(
            owner=self.customer, license_plate="NOCHG-1", make="Honda", model="Civic", year=2019,
            current_mileage=30000,
            vin="VINNOCHARGE001"
        )

        response = self.client.post(self.url, {
            'customer': self.customer.id,
            'vehicle': vehicle_no_sub.id,
            'service_type': 'flat_tyre',
            'breakdown_location': 'Home',
            'customer_phone': '1234567890',
            'branch': self.branch.id
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_id = response.data['id']

        self.client.force_authenticate(user=self.manager)
        self.client.post(f"{self.url}{request_id}/assign_dispatch/", {'technician_id': self.technician.id})
        self.client.post(f"{self.url}{request_id}/en_route/")
        self.client.post(f"{self.url}{request_id}/arrive/")
        self.client.post(f"{self.url}{request_id}/in_progress/")

        response = self.client.post(f"{self.url}{request_id}/complete/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Enter a charge amount', str(response.data))
        request_obj = RoadsideRequest.objects.get(pk=request_id)
        self.assertEqual(request_obj.status, 'in_progress')

    def test_technician_can_add_site_notes_and_photos_when_working(self):
        """Assigned technicians can document roadside work on site"""
        vehicle_no_sub = Vehicle.objects.create(
            owner=self.customer,
            license_plate="DOC-123",
            make="Honda",
            model="Civic",
            year=2019,
            current_mileage=30000,
            vin="VINDOCSITE001"
        )

        response = self.client.post(self.url, {
            'customer': self.customer.id,
            'vehicle': vehicle_no_sub.id,
            'service_type': 'flat_tyre',
            'breakdown_location': 'Home',
            'customer_phone': '1234567890',
            'branch': self.branch.id,
            'pay_as_you_go': True,
            'charge_amount': '50.00',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_id = response.data['id']

        self.client.force_authenticate(user=self.manager)
        self.client.post(f"{self.url}{request_id}/assign_dispatch/", {'technician_id': self.technician.id})
        self.client.post(f"{self.url}{request_id}/en_route/")
        self.client.post(f"{self.url}{request_id}/arrive/")
        self.client.post(f"{self.url}{request_id}/in_progress/")

        self.client.force_authenticate(user=self.technician)
        response = self.client.post(
            f"{self.url}{request_id}/site-notes/",
            {'note': 'Replaced damaged tyre and checked pressure.'},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(RoadsideNote.objects.filter(request_id=request_id).count(), 1)
        self.assertEqual(response.data['created_by'], self.technician.id)

        image = SimpleUploadedFile(
            "roadside.gif",
            b"GIF87a\x01\x00\x01\x00\x80\x01\x00\x00\x00\x00ccc,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;",
            content_type="image/gif",
        )
        response = self.client.post(
            f"{self.url}{request_id}/site-photos/",
            {'image': image, 'photo_type': 'repair', 'caption': 'Tyre replaced'},
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(RoadsidePhoto.objects.filter(request_id=request_id).count(), 1)
        self.assertEqual(response.data['uploaded_by'], self.technician.id)

        response = self.client.get(f"{self.url}{request_id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['site_notes']), 1)
        self.assertEqual(len(response.data['photos']), 1)
        
    def test_cancellation(self):
        """Test cancellation logic"""
        # Create request
        data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'service_type': 'battery_boost',
            'breakdown_location': '123 Main St',
            'customer_phone': '1234567890',
            'branch': self.branch.id
        }
        response = self.client.post(self.url, data)
        request_id = response.data['id']
        
        # Cancel
        self.client.post(f"{self.url}{request_id}/cancel/")
        request_obj = RoadsideRequest.objects.get(pk=request_id)
        self.assertEqual(request_obj.status, 'cancelled')
        
        # Verify we cannot dispatch a cancelled request
        self.client.force_authenticate(user=self.manager)
        resp = self.client.post(f"{self.url}{request_id}/assign_dispatch/", {'technician_id': self.technician.id})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_requested_request_before_dispatch(self):
        """Managers can delete a request before it has been dispatched"""
        data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'service_type': 'battery_boost',
            'breakdown_location': '123 Main St',
            'customer_phone': '1234567890',
            'branch': self.branch.id
        }

        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_id = response.data['id']

        request_obj = RoadsideRequest.objects.get(pk=request_id)
        self.assertTrue(request_obj.subscription_allowance_deducted)

        self.client.force_authenticate(user=self.manager)
        response = self.client.delete(f"{self.url}{request_id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(RoadsideRequest.objects.filter(pk=request_id).exists())
        self.assertEqual(self.subscription.get_remaining_allowance('battery_boosts'), Decimal('5'))

    def test_delete_dispatched_request_is_blocked(self):
        """Requests with dispatch history cannot be deleted"""
        data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'service_type': 'battery_boost',
            'breakdown_location': '123 Main St',
            'customer_phone': '1234567890',
            'branch': self.branch.id
        }

        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_id = response.data['id']

        self.client.force_authenticate(user=self.manager)
        response = self.client.post(f"{self.url}{request_id}/assign_dispatch/", {'technician_id': self.technician.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.delete(f"{self.url}{request_id}/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(RoadsideRequest.objects.filter(pk=request_id).exists())

    def test_my_requests(self):
        """Test my_requests endpoint for customer"""
        self.client.force_authenticate(user=self.user)
        # Create a request first
        RoadsideRequest.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            service_type='battery_boost',
            breakdown_location='Test Loc',
            customer_phone='123',
            branch=self.branch,
            request_number='TEST-001'
        )
        
        response = self.client.get(f"{self.url}my_requests/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_customer_can_retrieve_own_request(self):
        """Customer portal detail page uses GET /requests/{id}/"""
        request = RoadsideRequest.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            service_type='battery_boost',
            breakdown_location='Test Loc',
            customer_phone='123',
            branch=self.branch,
            request_number='TEST-RETRIEVE',
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get(f"{self.url}{request.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], request.id)

    def test_customer_cannot_retrieve_other_customers_request(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        other_user = User.objects.create_user(
            username='other_retrieve',
            password='password',
            email='other_retrieve@example.com',
            role='customer',
        )
        other_customer = Customer.objects.create(user=other_user, customer_number='CUST-OTHER-R')
        other_request = RoadsideRequest.objects.create(
            customer=other_customer,
            vehicle=self.vehicle,
            service_type='battery_boost',
            breakdown_location='Elsewhere',
            customer_phone='999',
            branch=self.branch,
            request_number='TEST-OTHER',
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get(f"{self.url}{other_request.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cancellation_refunds_allowance(self):
        """Test that cancelling a request refunds the subscription allowance"""
        # Create request covered by subscription
        data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'service_type': 'battery_boost',
            'breakdown_location': '123 Main St',
            'customer_phone': '1234567890',
            'branch': self.branch.id
        }
        
        # Initial check
        # We need to calculate manually or rely on helper because get_remaining_allowance is dynamic
        initial_remaining = self.subscription.get_remaining_allowance('battery_boosts')
        
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_id = response.data['id']
        
        # Verify deducted
        # We might need to clear cached properties or similar if any
        # But get_remaining_allowance queries DB
        deducted_remaining = self.subscription.get_remaining_allowance('battery_boosts')
        self.assertEqual(deducted_remaining, initial_remaining - 1)
        
        # Verify request state
        request = RoadsideRequest.objects.get(pk=request_id)
        self.assertTrue(request.subscription_allowance_deducted)
        self.assertIsNotNone(request.subscription_usage_record)
        
        # Cancel
        self.client.post(f"{self.url}{request_id}/cancel/")
        
        # Verify refund
        request.refresh_from_db()
        self.assertEqual(request.status, 'cancelled')
        self.assertFalse(request.subscription_allowance_deducted)
        
        # Verify allowance restored
    def test_dashboard_stats(self):
        """Test dashboard stats endpoint"""
        # Create some requests
        RoadsideRequest.objects.create(
            customer=self.customer, vehicle=self.vehicle, service_type='battery_boost', branch=self.branch, status='requested', created_by=self.manager, request_number='REQ-001'
        )
        RoadsideRequest.objects.create(
            customer=self.customer, vehicle=self.vehicle, service_type='towing', branch=self.branch, status='completed', created_by=self.manager, request_number='REQ-002'
        )
        
        # Test as manager
        self.client.force_authenticate(user=self.manager)
        response = self.client.get(f"{self.url}dashboard_stats/")
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_requests'], 2)
        self.assertEqual(response.data['active_requests'], 1) # One requested
        self.assertEqual(response.data['completed_requests'], 1)

    def test_customer_requires_branch_on_create(self):
        """Customers must choose a branch; HQ fallback is not applied silently."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self.url, {
            'vehicle': self.vehicle.id,
            'service_type': 'battery_boost',
            'breakdown_location': '123 Main St',
            'customer_phone': '1234567890',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('branch', response.data)

    def test_branch_staff_receive_in_app_notification(self):
        """Branch coordinators and admins are notified when a request is created."""
        coordinator = User.objects.create_user(
            username='coord',
            password='password',
            email='coord@example.com',
            role='service_coordinator',
            branch=self.branch,
        )
        other_branch = Branch.objects.create(name='Other', code='OTH1', created_by=self.manager)
        other_coord = User.objects.create_user(
            username='coord2',
            password='password',
            email='coord2@example.com',
            role='service_coordinator',
            branch=other_branch,
        )

        self.client.force_authenticate(user=self.user)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.url, {
                'vehicle': self.vehicle.id,
                'service_type': 'battery_boost',
                'breakdown_location': '123 Main St',
                'customer_phone': '1234567890',
                'branch': self.branch.id,
            })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        request_id = response.data['id']
        staff_notifications = Notification.objects.filter(
            notification_type='roadside',
            channel='in_app',
            related_object_type='roadside',
            related_object_id=request_id,
        )
        recipient_ids = set(staff_notifications.values_list('recipient_id', flat=True))
        self.assertIn(coordinator.id, recipient_ids)
        self.assertIn(self.manager.id, recipient_ids)
        self.assertNotIn(other_coord.id, recipient_ids)
        coord_message = staff_notifications.filter(recipient=coordinator).first().message
        self.assertIn(self.branch.name, coord_message)

    def test_retrieve_includes_detail_fields(self):
        """Detail endpoint exposes branch, timeline, and dispatch metadata."""
        req = RoadsideRequest.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            service_type='battery_boost',
            breakdown_location='Highway 9',
            customer_phone='1234567890',
            branch=self.branch,
            status='requested',
            created_by=self.manager,
            request_number='REQ-DETAIL-01',
        )
        self.client.force_authenticate(user=self.manager)
        response = self.client.get(f'{self.url}{req.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['branch_detail']['name'], self.branch.name)
        self.assertEqual(response.data['customer_number'], self.customer.customer_number)
        self.assertIn('timeline', response.data)
        self.assertTrue(any(e['key'] == 'requested' for e in response.data['timeline']))
        self.assertIn('dispatch', response.data['available_actions'])
