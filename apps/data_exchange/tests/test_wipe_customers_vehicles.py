"""Tests for migration wipe of customers/vehicles + related ops."""
from decimal import Decimal
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.permission_models import Permission, Role
from apps.billing.models import Invoice, Payment
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.data_exchange.cleanup import (
    CONFIRM_PHRASE,
    preview_customer_vehicle_wipe,
    run_customer_vehicle_wipe,
)
from apps.data_exchange.models import ImportBatch
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder

User = get_user_model()


class WipeCustomersVehiclesTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(
            username='wipe-admin@example.com',
            email='wipe-admin@example.com',
            password='pass12345',
            role='admin',
            is_staff=True,
        )
        self.branch = Branch.objects.create(
            name='Wipe HQ',
            code='WIPE',
            is_active=True,
            is_headquarters=True,
            created_by=self.admin,
        )
        self.customer_user = User.objects.create_user(
            username='wipe-cust@example.com',
            email='wipe-cust@example.com',
            password='pass12345',
            role='customer',
            first_name='Wipe',
            last_name='Customer',
        )
        self.customer = Customer.objects.create(
            user=self.customer_user,
            customer_number='CUS-WIPE-0001',
            customer_type='individual',
            status='active',
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            vin='1HGBH41JXMN109186',
            make='Honda',
            model='Civic',
            year=2020,
            license_plate='WIPE-001',
            current_mileage=1000,
            engine_type='gasoline',
            transmission_type='automatic',
        )
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='closed',
            created_by=self.admin,
            odometer_in=1000,
        )
        self.invoice = Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            work_order=self.work_order,
            branch=self.branch,
            status='sent',
            total=Decimal('100.00'),
            amount_paid=Decimal('0'),
            amount_due=Decimal('100.00'),
            created_by=self.admin,
        )
        ImportBatch.objects.create(
            uuid=uuid4(),
            module_key='customers_vehicles',
            status=ImportBatch.STATUS_COMPLETED,
            original_filename='test.xlsx',
            created_by=self.admin,
        )

    def test_preview_dry_run_counts(self):
        preview = preview_customer_vehicle_wipe()
        self.assertTrue(preview['dry_run'])
        self.assertEqual(preview['confirm_phrase'], CONFIRM_PHRASE)
        self.assertGreaterEqual(preview['counts']['customers'], 1)
        self.assertGreaterEqual(preview['counts']['vehicles'], 1)
        self.assertGreaterEqual(preview['counts']['work_orders'], 1)
        self.assertGreaterEqual(preview['counts']['invoices'], 1)
        # Dry-run must not delete
        self.assertEqual(Customer.objects.count(), 1)
        self.assertEqual(Vehicle.objects.count(), 1)

    def test_wrong_confirm_rejected(self):
        with self.assertRaises(ValueError):
            run_customer_vehicle_wipe(confirm='wrong')
        self.assertEqual(Customer.objects.count(), 1)

    def test_wipe_clears_ops_customers_vehicles_keeps_staff_branch(self):
        result = run_customer_vehicle_wipe(
            confirm=CONFIRM_PHRASE,
            user=self.admin,
        )
        self.assertTrue(result['ok'])
        self.assertEqual(Customer.objects.count(), 0)
        self.assertEqual(Vehicle.objects.count(), 0)
        self.assertEqual(WorkOrder.objects.count(), 0)
        self.assertEqual(Invoice.objects.count(), 0)
        self.assertEqual(Payment.objects.count(), 0)
        self.assertEqual(ImportBatch.objects.count(), 0)
        self.assertFalse(User.objects.filter(role='customer').exists())
        self.assertTrue(User.objects.filter(id=self.admin.id).exists())
        self.assertTrue(Branch.objects.filter(id=self.branch.id).exists())


class WipeCustomersVehiclesAPITests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        perm, _ = Permission.objects.update_or_create(
            code='manage_data_exchange',
            defaults={
                'name': 'Manage Data Import/Export',
                'category': 'system',
                'is_active': True,
                'is_system': True,
            },
        )
        role, _ = Role.objects.update_or_create(
            code='wipe_admin',
            defaults={'name': 'Wipe Admin', 'is_active': True},
        )
        role.permissions.add(perm)
        self.user = User.objects.create_user(
            username='wipe-api@example.com',
            email='wipe-api@example.com',
            password='pass12345',
            role='wipe_admin',
            is_staff=True,
        )
        self.client.force_authenticate(user=self.user)

        self.branch = Branch.objects.create(
            name='API Wipe HQ',
            code='APIW',
            is_active=True,
            created_by=self.user,
        )
        cust_user = User.objects.create_user(
            username='wipe-api-cust@example.com',
            email='wipe-api-cust@example.com',
            password='pass12345',
            role='customer',
        )
        customer = Customer.objects.create(
            user=cust_user,
            customer_number='CUS-API-WIPE-1',
            customer_type='individual',
            status='active',
        )
        Vehicle.objects.create(
            owner=customer,
            vin='1HGBH41JXMN109199',
            make='Toyota',
            model='Corolla',
            year=2019,
            license_plate='API-WIPE-1',
            current_mileage=500,
            engine_type='gasoline',
            transmission_type='automatic',
        )

    def test_wipe_dry_run_api(self):
        response = self.client.post('/api/data-exchange/wipe/', {'dry_run': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['dry_run'])
        self.assertGreaterEqual(response.data['counts']['customers'], 1)
        self.assertEqual(Customer.objects.count(), 1)

    @override_settings(DATA_EXCHANGE_WIPE_SYNC=True)
    def test_wipe_execute_api_async(self):
        response = self.client.post(
            '/api/data-exchange/wipe/',
            {'dry_run': False, 'confirm': CONFIRM_PHRASE},
            format='json',
        )
        # Sync test mode completes inline but still uses the wipe endpoint contract.
        self.assertIn(response.status_code, (status.HTTP_200_OK, status.HTTP_202_ACCEPTED))
        self.assertTrue(response.data.get('ok'))
        self.assertEqual(Customer.objects.count(), 0)
        self.assertEqual(Vehicle.objects.count(), 0)

        status_response = self.client.get('/api/data-exchange/wipe/')
        self.assertEqual(status_response.status_code, status.HTTP_200_OK)
        self.assertIn(status_response.data['status'], ('completed', 'completed_with_leftovers'))
        self.assertTrue(status_response.data['job']['ok'])
        self.assertTrue(User.objects.filter(id=self.user.id).exists())
        self.assertTrue(Branch.objects.filter(id=self.branch.id).exists())
