"""Cross-customer isolation tests for the customer portal API."""
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.billing.models import Invoice
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle


class PortalCustomerIsolationTests(APITestCase):
    def setUp(self):
        SystemModule.objects.update_or_create(
            slug='customers',
            defaults={'name': 'Customers', 'is_enabled': True},
        )
        SystemModule.objects.update_or_create(
            slug='vehicles',
            defaults={'name': 'Vehicles', 'is_enabled': True},
        )
        SystemModule.objects.update_or_create(
            slug='billing',
            defaults={'name': 'Billing', 'is_enabled': True},
        )
        self.user_a = User.objects.create_user(
            username='customer-a',
            email='customer-a@example.com',
            password='testpass',
            role='customer',
        )
        self.user_b = User.objects.create_user(
            username='customer-b',
            email='customer-b@example.com',
            password='testpass',
            role='customer',
        )
        self.customer_a = Customer.objects.create(user=self.user_a)
        self.customer_b = Customer.objects.create(user=self.user_b)
        self.vehicle_a = Vehicle.objects.create(
            owner=self.customer_a,
            year=2022,
            make='Toyota',
            model='Corolla',
            vin='1A8BFAFP5RT000001',
            license_plate='A-001',
            current_mileage=10000,
        )
        self.vehicle_b = Vehicle.objects.create(
            owner=self.customer_b,
            year=2021,
            make='Honda',
            model='Fit',
            vin='1A8BFAFP5RT000002',
            license_plate='B-001',
            current_mileage=20000,
        )
        self.invoice_a = Invoice.objects.create(
            customer=self.customer_a,
            vehicle=self.vehicle_a,
            status='sent',
            due_date=timezone.now().date(),
            total=Decimal('100.00'),
            created_by=self.user_a,
        )
        self.invoice_b = Invoice.objects.create(
            customer=self.customer_b,
            vehicle=self.vehicle_b,
            status='sent',
            due_date=timezone.now().date(),
            total=Decimal('200.00'),
            created_by=self.user_b,
        )

    def test_portal_vehicles_only_returns_own(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get('/api/portal/vehicles/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item['id'] for item in response.data}
        self.assertEqual(ids, {self.vehicle_a.id})

    def test_portal_invoices_only_returns_own(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get('/api/portal/invoices/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item['id'] for item in response.data}
        self.assertEqual(ids, {self.invoice_a.id})

    def test_customer_cannot_list_other_customer_via_billing_api(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get('/api/billing/invoices/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        ids = {row['id'] for row in results}
        self.assertNotIn(self.invoice_b.id, ids)

    def test_customer_cannot_fetch_other_vehicle(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get(f'/api/vehicles/vehicles/{self.vehicle_b.id}/')
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))
