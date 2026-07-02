"""
Tests for custom role assignment and permission enforcement.
"""
from django.core.management import call_command
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.permission_models import Permission, Role
from apps.branches.models import Branch
from tests.rbac_test_utils import create_role_user, enable_system_modules


class CustomRoleTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('init_permissions', verbosity=0)
        enable_system_modules()
        cls.admin = create_role_user('admin', email='custom_role_admin@test.com', username='custom_role_admin')
        cls.branch = Branch.objects.create(name='Custom Role Branch', code='CRB', is_active=True, created_by=cls.admin)

        cls.custom_role = Role.objects.create(
            code='custom_viewer',
            name='Custom Viewer',
            description='Can only view customers',
            is_system=False,
            is_active=True,
            priority=30,
        )
        view_customers = Permission.objects.get(code='view_customers')
        cls.custom_role.permissions.set([view_customers])

        cls.custom_user = create_role_user(
            'custom_viewer',
            email='custom_viewer_user@test.com',
            username='custom_viewer_user',
            branch=cls.branch,
        )

    def test_custom_role_code_is_valid_for_user_creation(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.post('/api/auth/users/', {
            'email': 'another_custom@test.com',
            'username': 'another_custom',
            'password': 'SecurePass123!',
            'password2': 'SecurePass123!',
            'first_name': 'Another',
            'last_name': 'Custom',
            'role': 'custom_viewer',
            'branch': self.branch.id,
            'is_active': True,
            'send_welcome_email': False,
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['role'], 'custom_viewer')

    def test_custom_role_user_gets_assigned_permissions(self):
        client = APIClient()
        client.force_authenticate(user=self.custom_user)
        response = client.get('/api/auth/users/me/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('view_customers', response.data.get('permissions', []))

    def test_custom_role_user_can_view_customers(self):
        client = APIClient()
        client.force_authenticate(user=self.custom_user)
        response = client.get('/api/customers/customers/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_custom_role_user_cannot_view_workorders(self):
        client = APIClient()
        client.force_authenticate(user=self.custom_user)
        response = client.get('/api/workorders/work-orders/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_notes_require_customer_permissions(self):
        technician = create_role_user(
            'technician',
            email='tech_no_cust@test.com',
            username='tech_no_cust',
            branch=self.branch,
        )
        client = APIClient()
        client.force_authenticate(user=technician)
        response = client.get('/api/customers/customer-notes/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_edit_payments_permission_exists(self):
        self.assertTrue(Permission.objects.filter(code='edit_payments', is_active=True).exists())
