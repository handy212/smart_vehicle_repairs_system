from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from rest_framework import status
from django.core.management import call_command
from django.test import RequestFactory
from rolepermissions.roles import assign_role
from rest_framework_simplejwt.tokens import RefreshToken
from apps.inventory.models import PartCategory
from apps.accounts.permission_models import Permission, Role, UserPermissionOverride
from apps.accounts.admin_models import SystemBackup, SystemModule, SystemSettings
from apps.accounts.settings_utils import clear_settings_cache
from config.logging_filters import SkipMaintenanceMode503Filter
import tempfile
from pathlib import Path
import logging

User = get_user_model()


class SystemSettingsInitializationTests(TestCase):
    def test_supported_settings_hide_deprecated_and_include_paystack(self):
        deprecated_keys = [
            'customer_login_background',
            'staff_login_background',
            'stripe_public_key',
            'paypal_client_id',
        ]
        for key in deprecated_keys:
            SystemSettings.objects.create(category='branding', key=key, value='old', is_active=True)

        call_command('init_settings', verbosity=0)

        self.assertFalse(SystemSettings.objects.filter(key__in=deprecated_keys, is_active=True).exists())
        self.assertTrue(SystemSettings.objects.filter(key='paystack_public_key', category='payment', is_active=True).exists())
        self.assertTrue(SystemSettings.objects.filter(key='paystack_secret_key', category='payment', is_active=True).exists())
        self.assertFalse(SystemSettings.objects.filter(key='stripe_secret_key', is_active=True).exists())
        self.assertTrue(SystemSettings.objects.filter(key='self_registration_enabled', category='branding', is_active=True).exists())
        self.assertTrue(SystemSettings.objects.filter(key='document_watermark_enabled', category='branding', is_active=True).exists())


class PublicSettingsEndpointTests(TestCase):
    def test_public_integrations_ignores_invalid_authorization_header(self):
        SystemSettings.objects.create(
            category='integration',
            key='recaptcha_enabled',
            value='false',
            is_active=True,
            is_secret=False,
        )
        client = APIClient()

        response = client.get(
            '/api/accounts/admin/settings/public/integrations/',
            HTTP_AUTHORIZATION='Bearer invalid-token',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['recaptcha_enabled'], 'false')

    def test_public_branding_exposes_self_registration_toggle(self):
        SystemSettings.objects.create(
            category='branding',
            key='self_registration_enabled',
            value='false',
            is_active=True,
            is_secret=False,
        )

        response = APIClient().get('/api/accounts/admin/settings/public/branding/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        values = {item['key']: item['value'] for item in response.data}
        self.assertEqual(values['self_registration_enabled'], 'false')

    def test_public_branding_exposes_document_watermark_toggle(self):
        SystemSettings.objects.create(
            category='branding',
            key='document_watermark_enabled',
            value='false',
            is_active=True,
            is_secret=False,
        )

        response = APIClient().get('/api/accounts/admin/settings/public/branding/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        values = {item['key']: item['value'] for item in response.data}
        self.assertEqual(values['document_watermark_enabled'], 'false')


class SelfRegistrationSettingsTests(TestCase):
    def test_manual_registration_initiate_respects_disabled_setting(self):
        SystemSettings.objects.update_or_create(
            key='self_registration_enabled',
            defaults={
                'category': 'branding',
                'value': 'false',
                'description': 'Allow customers to create their own account from the login page',
                'is_active': True,
            },
        )

        response = APIClient().post('/api/accounts/register/initiate/', {})

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['detail'], 'Self registration is currently disabled.')


class MaintenanceModeMiddlewareTests(TestCase):
    def setUp(self):
        clear_settings_cache()
        SystemSettings.objects.update_or_create(
            key='maintenance_mode',
            defaults={
                'category': 'maintenance',
                'value': 'true',
                'description': 'Enable maintenance mode',
                'is_active': True,
            },
        )
        SystemSettings.objects.update_or_create(
            key='maintenance_message',
            defaults={
                'category': 'maintenance',
                'value': 'System is closed for maintenance.',
                'description': 'Maintenance message',
                'is_active': True,
            },
        )
        clear_settings_cache()
        self.staff_user = User.objects.create_user(
            username='staff_maintenance',
            email='staff_maintenance@example.com',
            password='password123',
            role='technician',
        )
        self.admin_user = User.objects.create_user(
            username='admin_maintenance',
            email='admin_maintenance@example.com',
            password='password123',
            role='admin',
        )

    def tearDown(self):
        clear_settings_cache()

    def _authenticated_client(self, user):
        client = APIClient()
        access_token = str(RefreshToken.for_user(user).access_token)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        return client

    def test_maintenance_mode_blocks_unauthenticated_api_requests(self):
        response = APIClient().get('/api/vehicles/vehicles/')

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertTrue(response.json()['maintenance_mode'])
        self.assertEqual(response.json()['detail'], 'System is closed for maintenance.')

    def test_maintenance_mode_blocks_non_admin_jwt_requests(self):
        response = self._authenticated_client(self.staff_user).get('/api/vehicles/vehicles/')

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertTrue(response.json()['maintenance_mode'])

    def test_maintenance_mode_allows_admin_jwt_requests(self):
        response = self._authenticated_client(self.admin_user).get('/api/accounts/users/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], self.admin_user.email)

    def test_maintenance_mode_keeps_current_user_available(self):
        response = self._authenticated_client(self.staff_user).get('/api/auth/users/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], self.staff_user.email)

    def test_maintenance_mode_keeps_public_settings_available(self):
        response = APIClient().get('/api/accounts/admin/settings/public/integrations/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)


class MaintenanceModeLoggingFilterTests(TestCase):
    def test_filter_skips_marked_maintenance_503_records_only(self):
        request = RequestFactory().get('/api/portal/dashboard/')
        request._maintenance_mode_response = True
        record = logging.LogRecord(
            'django.request',
            logging.ERROR,
            __file__,
            1,
            'Service Unavailable',
            args=(),
            exc_info=None,
        )
        record.status_code = 503
        record.request = request

        self.assertFalse(SkipMaintenanceMode503Filter().filter(record))

        record.status_code = 500
        self.assertTrue(SkipMaintenanceMode503Filter().filter(record))


class PermissionAuditTests(TestCase):
    def setUp(self):
        # Initialize permissions
        call_command('init_permissions', verbosity=0)

        # Create users
        self.technician_user = User.objects.create_user(
            username='tech_audit', email='tech_audit@example.com', password='password123', role='technician'
        )
        assign_role(self.technician_user, 'technician')

        self.accountant_user = User.objects.create_user(
            username='acct_audit', email='acct_audit@example.com', password='password123', role='accountant'
        )
        assign_role(self.accountant_user, 'accountant')
        
        self.manager_user = User.objects.create_user(
            username='manager_audit', email='manager_audit@example.com', password='password123', role='manager'
        )
        assign_role(self.manager_user, 'manager')

        # Setup Clients
        self.tech_client = APIClient()
        self.tech_client.force_authenticate(user=self.technician_user)

        self.acct_client = APIClient()
        self.acct_client.force_authenticate(user=self.accountant_user)
        
        self.manager_client = APIClient()
        self.manager_client.force_authenticate(user=self.manager_user)

    def test_technician_restrictions(self):
        """
        Verify Technician:
        - CANNOT create vehicles (view_vehicles=True, create_vehicles=False)
        - CANNOT create parts (view_inventory=True, create_parts=False)
        - CANNOT view other users (view_users=False)
        """
        # 1. Create Vehicle -> Should Fail (403)
        response = self.tech_client.post('/api/vehicles/vehicles/', {
            'vin': '1MB55555555555555', # Valid length/chars
            'make': 'Toyota',
            'model': 'Camry',
            'year': 2020,
            'status': 'active',
            'auto_decode_vin': False
        })
        print(f"Technician create vehicle response: {response.status_code}")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Create Part -> Should Fail (403)
        # Need a category first (Manager can create)
        cat = PartCategory.objects.create(name="Test Cat")
        response = self.tech_client.post('/api/inventory/parts/', {
            'part_number': 'TP-001',
            'name': 'Test Part',
            'category': cat.id,
            'cost_price': 10.00,
            'selling_price': 20.00
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 3. View Users (Technicians list) -> Should Fail (403)
        response = self.tech_client.get('/api/technicians/technicians/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_accountant_access(self):
        """
        Verify Accountant:
        - CANNOT view technicians/users (view_users=False)
        - CAN view billing/invoices (view_billing=True)
        - CAN create invoices (create_invoices=True)
        """
        # 1. View Technicians -> Should Fail (403)
        response = self.acct_client.get('/api/technicians/technicians/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 2. View Tax Rates (Billing Settings) -> Should Pass (view_settings=True)
        response = self.acct_client.get('/api/billing/tax-rates/')
        print(f"Accountant view tax rates response: {response.status_code}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
    def test_manager_access(self):
        """
        Verify Manager:
        - CAN create vehicles
        - CAN manage inventory
        - CAN manage staff
        """
        # 1. Create Vehicle -> Should Pass (201)
        # Create Customer first
        from apps.customers.models import Customer
        customer = Customer.objects.create(
            user=self.technician_user, # Using existing user
            billing_address='123 Test St',
            service_address='123 Test St'
        )
        
        # Note: Vehicle creation needs minimal fields.
        response = self.manager_client.post('/api/vehicles/vehicles/', {
            'vin': '1MB99999999999999',
            'make': 'Honda',
            'model': 'Civic',
            'year': 2021,
            'status': 'active',
            'vehicle_type': 'saloon',
            'owner': customer.id,
            'current_mileage': 0,
            'auto_decode_vin': False
        })
        if response.status_code != 201:
             print(f"Manager create vehicle failed: {response.data}")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class UserAndRolePermissionBoundaryTests(TestCase):
    def setUp(self):
        call_command('init_permissions', verbosity=0)

        self.admin_user = User.objects.create_user(
            username='admin_boundary',
            email='admin_boundary@example.com',
            password='password123',
            role='admin',
        )
        self.technician_user = User.objects.create_user(
            username='tech_boundary',
            email='tech_boundary@example.com',
            password='password123',
            role='technician',
        )
        self.super_admin_user = User.objects.create_user(
            username='super_admin_boundary',
            email='super_admin_boundary@example.com',
            password='password123',
            role='super-admin',
            is_staff=True,
            is_superuser=True,
        )
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin_user)
        self.tech_client = APIClient()
        self.tech_client.force_authenticate(user=self.technician_user)
        self.super_admin_client = APIClient()
        self.super_admin_client.force_authenticate(user=self.super_admin_user)

    def _staff_payload(self, email='new_staff@example.com'):
        return {
            'email': email,
            'username': email.split('@')[0],
            'password': 'StrongPass123!',
            'password2': 'StrongPass123!',
            'first_name': 'New',
            'last_name': 'Staff',
            'role': 'admin',
            'is_active': True,
        }

    def test_user_create_requires_create_users_permission(self):
        unauthenticated = APIClient()
        response = unauthenticated.post('/api/accounts/users/', self._staff_payload('public_staff@example.com'))
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        response = self.tech_client.post('/api/accounts/users/', self._staff_payload('tech_staff@example.com'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        response = self.admin_client.post('/api/accounts/users/', self._staff_payload('admin_staff@example.com'))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_user_permission_override_can_revoke_admin_action(self):
        create_users = Permission.objects.get(code='create_users')
        UserPermissionOverride.objects.create(
            user=self.admin_user,
            permission=create_users,
            granted=False,
            reason='Boundary test revoke',
            granted_by=self.admin_user,
        )

        response = self.admin_client.get('/api/accounts/users/permissions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('create_users', response.data['permissions'])

        response = self.admin_client.post('/api/accounts/users/', self._staff_payload('revoked_staff@example.com'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_role_permission_endpoints_require_dynamic_permissions(self):
        manage_permissions = Permission.objects.get(code='manage_permissions')
        UserPermissionOverride.objects.create(
            user=self.admin_user,
            permission=manage_permissions,
            granted=False,
            reason='Boundary test revoke',
            granted_by=self.admin_user,
        )

        response = self.admin_client.get('/api/accounts/admin/permissions/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        role = Role.objects.get(code='technician')
        view_inventory = Permission.objects.get(code='view_inventory')
        response = self.admin_client.post(
            f'/api/accounts/admin/roles/{role.id}/assign_permissions/',
            {'permission_ids': [view_inventory.id]},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_module_management_is_super_admin_controlled(self):
        module = SystemModule.objects.filter(slug='inventory').first()
        self.assertIsNotNone(module)

        response = self.admin_client.get('/api/accounts/admin/modules/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        response = self.admin_client.patch(
            f'/api/accounts/admin/modules/{module.id}/',
            {'is_enabled': module.is_enabled},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        response = self.super_admin_client.get('/api/accounts/admin/modules/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.super_admin_client.patch(
            f'/api/accounts/admin/modules/{module.id}/',
            {'is_enabled': module.is_enabled},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_super_admin_account_and_role_are_hidden_from_admin_surfaces(self):
        Role.objects.update_or_create(
            code='super-admin',
            defaults={
                'name': 'Super Admin',
                'description': 'Owner account',
                'is_system': True,
                'is_active': True,
                'priority': 1000,
            },
        )

        for client in (self.admin_client, self.super_admin_client):
            response = client.get('/api/accounts/users/')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            emails = {user['email'] for user in response.data['results']}
            self.assertNotIn(self.super_admin_user.email, emails)

            response = client.get(f'/api/accounts/users/{self.super_admin_user.id}/')
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

            response = client.get('/api/accounts/admin/roles/')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            role_codes = {role['code'] for role in response.data['results']}
            self.assertNotIn('super-admin', role_codes)

            response = client.get('/api/accounts/admin/dashboard-stats/')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            stats_roles = {role['role'] for role in response.data['user_by_role']}
            self.assertNotIn('super-admin', stats_roles)

        response = self.super_admin_client.get('/api/accounts/users/me/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], self.super_admin_user.email)

    def test_profile_update_cannot_change_role_or_status(self):
        response = self.super_admin_client.patch(
            '/api/accounts/users/me/',
            {
                'first_name': 'Owner',
                'role': 'admin',
                'is_active': False,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.super_admin_user.refresh_from_db()
        self.assertEqual(self.super_admin_user.first_name, 'Owner')
        self.assertEqual(self.super_admin_user.role, 'super-admin')
        self.assertTrue(self.super_admin_user.is_active)


class BackupPermissionAndDownloadTests(TestCase):
    def setUp(self):
        call_command('init_permissions', verbosity=0)
        self.admin_user = User.objects.create_user(
            username='backup_admin',
            email='backup_admin@example.com',
            password='password123',
            role='admin',
            is_staff=True,
        )
        self.technician_user = User.objects.create_user(
            username='backup_tech',
            email='backup_tech@example.com',
            password='password123',
            role='technician',
            is_staff=True,
        )
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(self.admin_user)
        self.tech_client = APIClient()
        self.tech_client.force_authenticate(self.technician_user)

    def test_backup_endpoints_require_manage_backups(self):
        response = self.tech_client.get('/api/accounts/admin/backups/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        response = self.admin_client.get('/api/accounts/admin/backups/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_completed_backup_download_streams_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            backup_path = Path(temp_dir) / 'backup.zip'
            backup_path.write_bytes(b'backup-bytes')
            backup = SystemBackup.objects.create(
                backup_type='database',
                status='completed',
                file_path=str(backup_path),
                file_size=backup_path.stat().st_size,
                created_by=self.admin_user,
            )

            response = self.admin_client.post(f'/api/accounts/admin/backups/{backup.id}/download/')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(b''.join(response.streaming_content), b'backup-bytes')

    def test_backup_create_runs_background_task_and_creates_archive(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with override_settings(MEDIA_ROOT=temp_dir):
                response = self.admin_client.post(
                    '/api/accounts/admin/backups/',
                    {'backup_type': 'database', 'notes': 'test backup'},
                    format='json',
                )
                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                backup = SystemBackup.objects.get(id=response.data['id'])
                from apps.accounts.tasks import create_system_backup
                create_system_backup(backup.id)
                backup.refresh_from_db()
                self.assertEqual(backup.status, 'completed')
                self.assertTrue(Path(backup.file_path).exists())
