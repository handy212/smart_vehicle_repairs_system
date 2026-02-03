from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from decimal import Decimal
import json

from apps.accounts.models import User
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.branches.models import Branch
from apps.roadside.models import RoadsideRequest
from apps.subscriptions.models import Package, Subscription, SubscriptionUsage

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
            'customer_phone': '1234567890'
        }
        
        response = self.client.post(self.url, data)
        # Should raise validation error
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Service 'battery_boost' is not available under your current subscription", str(response.data))

    def test_create_towing_request_distance_validation(self):
        """Test towing request requires distance and checks allowance"""
        data = {
            'customer': self.customer.id,
            'vehicle': self.vehicle.id,
            'service_type': 'towing',
            'breakdown_location': 'Highway 1',
            'customer_phone': '1234567890',
            # Missing tow_distance_km
        }
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Add distance but too much (120km > 100km allowance)
        data['tow_distance_km'] = 120
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not available under your current subscription", str(response.data))
        
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

