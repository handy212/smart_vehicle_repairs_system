from django.test import TestCase
from django.utils import timezone
from decimal import Decimal
import json
from dateutil.relativedelta import relativedelta
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.branches.models import Branch
from apps.subscriptions.models import Package, Subscription, SubscriptionUsage
from apps.subscriptions.services import SubscriptionService, SubscriptionUsageService
from apps.billing.models import Invoice, Payment

class SubscriptionTests(TestCase):
    def setUp(self):
        # Create Users
        self.admin = User.objects.create_user(
            username='admin', password='password', email='admin@example.com', role='admin', is_superuser=True, is_staff=True
        )
        self.customer_user = User.objects.create_user(
            username='user', password='password', email='user@example.com', role='customer'
        )

        # Create Branch
        self.branch = Branch.objects.create(name="Main Branch", code="MB01", created_by=self.admin)
        
        # Create Customer
        self.customer = Customer.objects.create(
            user=self.customer_user,
            customer_number="CUST001"
        )
        
        # Create Vehicle
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            license_plate="ABC-123",
            make="Toyota",
            model="Camry",
            year=2020,
            current_mileage=50000,
            vin="SUBSVIN123"
        )
        
        # Create Package
        self.package = Package.objects.create(
            name="Premium Roadside",
            code="RSA-PREM",
            price=Decimal("100.00"),
            created_by=self.admin,
            features={
                "towing_services_km": 100,
                "battery_boosts": 5,
                "flat_tyre_service": 5,
                "roadside_first_aid": 3
            },
            duration_months=12
        )

    def test_subscription_creation_and_activation(self):
        """Test creating a subscription and activating it via service"""
        # Create
        sub, invoice = SubscriptionService.create_subscription_with_invoice(
            customer=self.customer,
            package=self.package,
            vehicle=self.vehicle,
            created_by=self.admin
        )
        
        self.assertEqual(sub.status, 'pending')
        self.assertEqual(sub.payment_status, 'pending')
        self.assertIsNotNone(sub.metadata.get('invoice_id')) # Using metadata linking
        self.assertEqual(invoice.status, 'pending')
        selected_start = sub.start_date
        selected_end = sub.end_date
        
        # Activate
        SubscriptionService.activate_subscription(sub, invoice)
        
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'active')
        self.assertEqual(sub.payment_status, 'paid')
        self.assertEqual(sub.activation_date, selected_start)
        self.assertEqual(sub.start_date, selected_start)
        self.assertEqual(sub.end_date, selected_end)
        self.assertEqual(sub.end_date, selected_start + relativedelta(months=self.package.duration_months))
        
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, 'paid')

    def test_consume_allowance(self):
        """Test consuming allowance"""
        # Setup active subscription
        sub, _ = SubscriptionService.create_subscription_with_invoice(
            customer=self.customer,
            package=self.package,
            vehicle=self.vehicle,
            created_by=self.admin
        )
        SubscriptionService.activate_subscription(sub)
        sub.activation_date = timezone.now().date()
        sub.save(update_fields=['activation_date'])
        
        # Check initial allowance
        initial = sub.get_remaining_allowance('battery_boosts')
        self.assertEqual(initial, 5)
        
        # Consume
        usage = SubscriptionUsageService.consume_allowance(
            subscription=sub,
            usage_type='battery_boost',
            quantity_used=1,
            description="Test Usage",
            created_by=self.admin
        )
        
        self.assertEqual(usage.usage_type, 'battery_boosts') # Should be canonical key
        
        # Verify remaining
        remaining = sub.get_remaining_allowance('battery_boosts')
        self.assertEqual(remaining, 4)
        
    def test_consume_allowance_mapping(self):
        """Test that mapping from friendly names (battery_boost) to internal keys (battery_boosts) works"""
        sub, _ = SubscriptionService.create_subscription_with_invoice(
            customer=self.customer,
            package=self.package,
            vehicle=self.vehicle,
            created_by=self.admin
        )
        SubscriptionService.activate_subscription(sub)
        sub.activation_date = timezone.now().date()
        sub.save(update_fields=['activation_date'])
        
        # 'battery_boost' is the service type key, 'battery_boosts' is feature key in package
        usage = SubscriptionUsageService.consume_allowance(
            subscription=sub,
            usage_type='battery_boost', # Friendlier key
            quantity_used=1,
            created_by=self.admin
        )
        
        # Should record as what was passed, but decrement correctly
        # Wait, the service stores "usage_type" as passed.
        # But `get_remaining_allowance` on Subscription filters by usage_type matching the feature key?
        # Let's check `Subscription.get_remaining_allowance` logic in models.py
        # It filters usage_records by `usage_type=feature_type`.
        # So `consume_allowance` MUST store the Internal Feature Key, OR `get_remaining_allowance` must handle aliases.
        # Let's verify what `consume_allowance` does.
        # It currently allows passing `usage_type` and just stores it.
        # BUT `consume_allowance` logic does: `feature_key = usage_to_feature.get(usage_type, usage_type)`
        # It checks remaining using `feature_key`.
        # BUT it creates `SubscriptionUsage` with `usage_type=usage_type` (the passed one).
        
        # If `battery_boost` maps to `battery_boosts`.
        # And Package has `battery_boosts`.
        # `check_allowance` uses `battery_boosts`. OK.
        # `consume_allowance`:
        #   Calculates remaining using `battery_boosts`. OK.
        #   Creates Usage with `battery_boost`.
        # NEXT time `get_remaining_allowance('battery_boosts')` is called:
        #   It queries Usage where `usage_type='battery_boosts'`.
        #   It will MISS the `battery_boost` record!
        
        # THIS IS A POTENTIAL BUG. The usage record should probably be stored with the Canonical Feature Key, or `get_remaining_allowance` needs to know aliases.
        # I will test explicitly for this.
        
        remaining = sub.get_remaining_allowance('battery_boosts')
        # If the bug exists, this will still be 5 instead of 4
        self.assertEqual(remaining, 4)
        
    def test_refund_allowance(self):
        """Test refunding allowance"""
        sub, _ = SubscriptionService.create_subscription_with_invoice(
            customer=self.customer,
            package=self.package,
            vehicle=self.vehicle,
            created_by=self.admin
        )
        SubscriptionService.activate_subscription(sub)
        sub.activation_date = timezone.now().date()
        sub.save(update_fields=['activation_date'])
        
        # Consume
        SubscriptionUsageService.consume_allowance(sub, 'battery_boosts', 1, created_by=self.admin) # Use canonical name to be safe for now
        self.assertEqual(sub.get_remaining_allowance('battery_boosts'), 4)
        
        # Refund
        SubscriptionUsageService.refund_allowance(
            subscription=sub,
            usage_type='battery_boosts',
            quantity_to_refund=1,
            created_by=self.admin
        )
        
        # Verify restored
        self.assertEqual(sub.get_remaining_allowance('battery_boosts'), 5)

    def test_future_start_date_blocks_usage_until_start_date(self):
        sub, _ = SubscriptionService.create_subscription_with_invoice(
            customer=self.customer,
            package=self.package,
            vehicle=self.vehicle,
            start_date=timezone.now().date() + timezone.timedelta(days=7),
            created_by=self.admin
        )
        SubscriptionService.activate_subscription(sub)

        with self.assertRaises(Exception):
            SubscriptionUsageService.consume_allowance(
                sub,
                'battery_boost',
                1,
                created_by=self.admin,
            )

    def test_renewal_keeps_current_subscription_active_until_invoice_payment(self):
        sub, _ = SubscriptionService.create_subscription_with_invoice(
            customer=self.customer,
            package=self.package,
            vehicle=self.vehicle,
            created_by=self.admin
        )
        SubscriptionService.activate_subscription(sub)
        sub.activation_date = timezone.now().date()
        sub.payment_status = 'paid'
        sub.save(update_fields=['activation_date', 'payment_status'])
        original_start = sub.start_date
        original_end = sub.end_date

        renewed, invoice = SubscriptionService.renew_subscription(sub, created_by=self.admin)
        renewed.refresh_from_db()

        self.assertEqual(renewed.status, 'active')
        self.assertEqual(renewed.payment_status, 'paid')
        self.assertEqual(renewed.start_date, original_start)
        self.assertEqual(renewed.end_date, original_end)
        self.assertEqual(renewed.metadata['pending_renewal']['invoice_id'], invoice.id)

        SubscriptionService.activate_subscription(renewed, invoice)
        renewed.refresh_from_db()
        self.assertEqual(renewed.start_date, original_end + timezone.timedelta(days=1))
        self.assertNotIn('pending_renewal', renewed.metadata)

    def test_payment_activates_invoice_linked_subscription_only(self):
        vehicle_two = Vehicle.objects.create(
            owner=self.customer,
            license_plate="SUB-222",
            make="Toyota",
            model="RAV4",
            year=2021,
            current_mileage=25000,
            vin="SUBSVIN222"
        )
        sub_one, invoice_one = SubscriptionService.create_subscription_with_invoice(
            customer=self.customer,
            package=self.package,
            vehicle=self.vehicle,
            created_by=self.admin
        )
        sub_two, _invoice_two = SubscriptionService.create_subscription_with_invoice(
            customer=self.customer,
            package=self.package,
            vehicle=vehicle_two,
            created_by=self.admin
        )

        Payment.objects.create(
            invoice=invoice_one,
            customer=self.customer,
            payment_method='cash',
            amount=invoice_one.total,
            processed_by=self.admin,
        )

        sub_one.refresh_from_db()
        sub_two.refresh_from_db()
        self.assertEqual(sub_one.status, 'active')
        self.assertEqual(sub_one.payment_status, 'paid')
        self.assertEqual(sub_two.status, 'pending')
        self.assertEqual(sub_two.payment_status, 'pending')


class CustomerPortalPackageAPITest(TestCase):
    """Portal subscriptions page lists active packages for purchase."""

    def setUp(self):
        SystemModule.objects.get_or_create(
            slug='subscriptions',
            defaults={'name': 'Subscriptions', 'is_enabled': True},
        )
        self.admin = User.objects.create_user(
            username='pkg_admin',
            password='password',
            email='pkg_admin@example.com',
            role='admin',
            is_superuser=True,
            is_staff=True,
        )
        self.customer_user = User.objects.create_user(
            username='pkg_customer',
            password='password',
            email='pkg_customer@example.com',
            role='customer',
        )
        Customer.objects.create(user=self.customer_user, customer_number='PKG-CUST')
        self.active_package = Package.objects.create(
            name='Active Plan',
            code='ACTIVE-01',
            price=Decimal('50.00'),
            created_by=self.admin,
            is_active=True,
        )
        Package.objects.create(
            name='Inactive Plan',
            code='INACTIVE-01',
            price=Decimal('25.00'),
            created_by=self.admin,
            is_active=False,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.customer_user)

    def test_customer_can_list_active_packages(self):
        response = self.client.get('/api/subscriptions/packages/', {'is_active': 'true'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        ids = [row['id'] for row in results]
        self.assertIn(self.active_package.id, ids)
        self.assertEqual(len(ids), 1)

    def test_customer_cannot_create_packages(self):
        response = self.client.post(
            '/api/subscriptions/packages/',
            {'name': 'Hacker Plan', 'code': 'HACK', 'price': '1.00'},
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
