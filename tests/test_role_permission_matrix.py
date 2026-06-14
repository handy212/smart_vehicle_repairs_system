"""
Permission matrix tests — verify critical API access aligns with role permissions.
"""
from django.core.management import call_command
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from tests.rbac_test_utils import (
    STAFF_ROLES,
    create_role_user,
    enable_system_modules,
    user_allowed,
)

API_ACCESS_CHECKS = [
    {
        'name': 'work orders',
        'url': '/api/workorders/work-orders/',
        'any_of': ['view_workorders', 'view_own_workorders'],
    },
    {
        'name': 'billing invoices',
        'url': '/api/billing/invoices/',
        'permission': 'view_billing',
    },
    {
        'name': 'inventory parts',
        'url': '/api/inventory/parts/',
        'permission': 'view_inventory',
    },
    {
        'name': 'customers',
        'url': '/api/customers/customers/',
        'permission': 'view_customers',
    },
    {
        'name': 'reports catalog',
        'url': '/api/reporting/catalog/',
        'permission': 'view_reports',
    },
    {
        'name': 'accounting accounts',
        'url': '/api/accounting/accounts/',
        'permission': 'view_accounting',
    },
    {
        'name': 'hr departments',
        'url': '/api/hr/departments/',
        'permission': 'view_departments',
    },
    {
        'name': 'gate passes',
        'url': '/api/gatepass/gate-passes/',
        'permission': 'view_gatepass',
    },
    {
        'name': 'fixed assets',
        'url': '/api/fixed-assets/assets/',
        'permission': 'view_assets',
    },
    {
        'name': 'subscription packages',
        'url': '/api/subscriptions/packages/',
        'permission': 'view_subscriptions',
    },
    {
        'name': 'staff users',
        'url': '/api/auth/users/',
        'permission': 'view_users',
    },
    {
        'name': 'diagnosis',
        'url': '/api/diagnosis/diagnoses/',
        'permission': 'view_diagnosis',
    },
    {
        'name': 'branches',
        'url': '/api/branches/branches/',
        'permission': 'view_branches',
    },
    {
        'name': 'appointments',
        'url': '/api/appointments/appointments/',
        'permission': 'view_appointments',
    },
]


class RolePermissionMatrixTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('init_permissions', verbosity=0)
        enable_system_modules()
        cls.users = {
            role: create_role_user(role, email=f'{role}_perm_matrix@test.com', username=f'{role}_perm_matrix')
            for role in STAFF_ROLES
        }

    def _request(self, client, url):
        return client.get(url)

    def test_matrix_matches_role_permissions(self):
        client = APIClient()

        for role, user in self.users.items():
            client.force_authenticate(user=user)
            for check in API_ACCESS_CHECKS:
                allowed = user_allowed(
                    user,
                    permission=check.get('permission'),
                    any_of=check.get('any_of'),
                )
                response = self._request(client, check['url'])
                with self.subTest(role=role, endpoint=check['name']):
                    if allowed:
                        self.assertIn(
                            response.status_code,
                            [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND],
                            msg=f'{role} expected access to {check["url"]}, got {response.status_code}',
                        )
                    else:
                        self.assertEqual(
                            response.status_code,
                            status.HTTP_403_FORBIDDEN,
                            msg=f'{role} should be denied for {check["url"]}, got {response.status_code}',
                        )

    def test_technician_cannot_create_vehicle_or_part(self):
        client = APIClient()
        client.force_authenticate(user=self.users['technician'])

        vehicle_response = client.post('/api/vehicles/vehicles/', {
            'vin': '1MB55555555555555',
            'make': 'Toyota',
            'model': 'Camry',
            'year': 2020,
            'status': 'active',
            'auto_decode_vin': False,
        })
        self.assertEqual(vehicle_response.status_code, status.HTTP_403_FORBIDDEN)

        from apps.inventory.models import PartCategory

        category = PartCategory.objects.create(name='Matrix Cat')
        part_response = client.post('/api/inventory/parts/', {
            'part_number': 'MX-001',
            'name': 'Matrix Part',
            'category': category.id,
            'cost_price': '10.00',
            'selling_price': '20.00',
        })
        self.assertEqual(part_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_accountant_can_view_billing_but_not_users(self):
        client = APIClient()
        client.force_authenticate(user=self.users['accountant'])

        self.assertEqual(client.get('/api/billing/invoices/').status_code, status.HTTP_200_OK)
        self.assertEqual(client.get('/api/auth/users/').status_code, status.HTTP_403_FORBIDDEN)

    def test_receptionist_cannot_access_diagnosis(self):
        client = APIClient()
        client.force_authenticate(user=self.users['receptionist'])
        self.assertEqual(client.get('/api/diagnosis/diagnoses/').status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_access_reports_and_work_orders(self):
        client = APIClient()
        client.force_authenticate(user=self.users['manager'])

        self.assertEqual(client.get('/api/reporting/catalog/').status_code, status.HTTP_200_OK)
        self.assertIn(
            client.get('/api/workorders/work-orders/').status_code,
            [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND],
        )
