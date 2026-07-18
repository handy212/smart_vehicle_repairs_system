"""
Tests for branches app
"""
from django.test import TestCase
from unittest.mock import MagicMock, patch
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.template.loader import render_to_string
from types import SimpleNamespace
from rest_framework import status
from rest_framework.test import APIClient
from apps.accounts.admin_models import SystemSettings
from apps.accounts.settings_utils import clear_settings_cache
from apps.branches.models import Branch

User = get_user_model()


class BranchModelTest(TestCase):
    """Test cases for Branch model"""
    
    def setUp(self):
        """Set up test data"""
        self.admin = User.objects.create_user(
            email='admin@test.com',
            username='admin',
            password='testpass123',
            first_name='Admin',
            last_name='User',
            role='admin',
            is_staff=True
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            phone='555-0100',
            address='123 Main St',
            city='Springfield',
            region='IL',
            zip_code='62701',
            created_by=self.admin
        )
    
    def test_branch_creation(self):
        """Test creating a branch"""
        self.assertEqual(self.branch.name, 'Main Branch')
        self.assertEqual(self.branch.code, 'MAIN')
        self.assertTrue(self.branch.is_active)
    
    def test_branch_code_uppercase(self):
        """Test that branch code is converted to uppercase"""
        branch = Branch.objects.create(
            name='Test Branch',
            code='test',
            phone='555-0200',
            address='456 Test St',
            city='TestCity',
            region='TS',
            zip_code='12345',
            created_by=self.admin
        )
        self.assertEqual(branch.code, 'TEST')
    
    def test_get_next_workorder_number(self):
        """Test work order number generation"""
        wo_number = self.branch.get_next_workorder_number()
        self.assertEqual(wo_number, 'MAIN-WO000001')
        
        wo_number2 = self.branch.get_next_workorder_number()
        self.assertEqual(wo_number2, 'MAIN-WO000002')

    def test_allocate_sequence_uses_select_for_update(self):
        """Sequence allocation must lock the branch row."""
        from unittest.mock import MagicMock, patch

        locked_branch = Branch.objects.get(pk=self.branch.pk)
        locked_branch.next_workorder_number = self.branch.next_workorder_number

        with patch.object(Branch.objects, 'select_for_update') as mock_select:
            mock_qs = MagicMock()
            mock_select.return_value = mock_qs
            mock_qs.get.return_value = locked_branch

            number = self.branch.get_next_workorder_number()

        mock_select.assert_called_once()
        mock_qs.get.assert_called_once_with(pk=self.branch.pk)
        self.assertEqual(number, 'MAIN-WO000001')
        self.assertEqual(locked_branch.next_workorder_number, 2)

    def test_headquarters_enforcement(self):
        """Test that only one branch can be headquarters"""
        branch2 = Branch.objects.create(
            name='Secondary Branch',
            code='SEC',
            phone='555-0300',
            address='789 Second St',
            city='OtherCity',
            region='OC',
            zip_code='54321',
            is_headquarters=True,
            created_by=self.admin
        )
        
        # Refresh first branch
        self.branch.refresh_from_db()
        self.assertFalse(self.branch.is_headquarters)
        self.assertTrue(branch2.is_headquarters)


class BranchApiPermissionTest(TestCase):
    def setUp(self):
        call_command('init_permissions', verbosity=0)
        self.admin = User.objects.create_user(
            email='branch_admin@test.com',
            username='branch_admin',
            password='testpass123',
            role='admin',
            is_staff=True,
        )
        self.super_admin = User.objects.create_user(
            email='branch_owner@test.com',
            username='branch_owner',
            password='testpass123',
            role='super-admin',
            is_staff=True,
            is_superuser=True,
        )
        self.technician = User.objects.create_user(
            email='branch_tech@test.com',
            username='branch_tech',
            password='testpass123',
            role='technician',
            is_staff=True,
        )
        self.branch = Branch.objects.create(
            name='API Main Branch',
            code='APIMAIN',
            phone='555-0100',
            address='123 Main St',
            city='Springfield',
            region='IL',
            zip_code='62701',
            created_by=self.admin,
        )

    def test_manage_branches_permission_controls_branch_create(self):
        payload = {
            'name': 'Second Branch',
            'code': 'SECOND',
            'phone': '555-0200',
            'address': '456 Second St',
            'city': 'Accra',
            'region': 'Greater Accra',
            'area': 'Osu',
            'country': 'Ghana',
            'is_active': True,
        }

        tech_client = APIClient()
        tech_client.force_authenticate(self.technician)
        response = tech_client.post('/api/branches/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        owner_client = APIClient()
        owner_client.force_authenticate(self.super_admin)
        response = owner_client.post('/api/branches/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_super_admin_can_view_branch_detail_without_role_specific_bypass(self):
        client = APIClient()
        client.force_authenticate(self.super_admin)
        response = client.get(f'/api/branches/{self.branch.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.branch.id)

    @patch('apps.quickbooks_online.services.QuickBooksService.is_connected', return_value=False)
    def test_qbo_departments_requires_connection(self, _mock_connected):
        client = APIClient()
        client.force_authenticate(self.super_admin)
        response = client.get('/api/branches/qbo-departments/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('apps.quickbooks_online.services.QuickBooksService.is_connected', return_value=True)
    @patch('apps.quickbooks_online.services.QuickBooksService.list_departments')
    def test_qbo_departments_returns_locations(self, mock_list_departments, _mock_connected):
        mock_list_departments.return_value = (
            [{
                'id': '10',
                'name': 'Main (APIMAIN)',
                'active': True,
                'mapped_branch': {
                    'id': self.branch.id,
                    'name': self.branch.name,
                    'code': self.branch.code,
                },
                'sync_status': 'synced',
            }],
            None,
        )

        client = APIClient()
        client.force_authenticate(self.super_admin)
        response = client.get('/api/branches/qbo-departments/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['departments']), 1)

    @patch('apps.quickbooks_online.services.QuickBooksService.is_connected', return_value=True)
    @patch('apps.quickbooks_online.services.QuickBooksService.list_departments')
    def test_branch_list_includes_qbo_department_name(self, mock_list_departments, _mock_connected):
        from django.contrib.contenttypes.models import ContentType
        from django.core.cache import cache

        from apps.branches.views import QBO_DEPARTMENT_NAMES_CACHE_KEY
        from apps.quickbooks_online.models import QBOMapping

        cache.delete(QBO_DEPARTMENT_NAMES_CACHE_KEY)
        QBOMapping.objects.create(
            content_type=ContentType.objects.get_for_model(Branch),
            object_id=self.branch.id,
            qbo_id='10',
            status='synced',
        )
        mock_list_departments.return_value = (
            [{
                'id': '10',
                'name': 'Main (APIMAIN)',
                'active': True,
                'mapped_branch': None,
                'sync_status': 'synced',
            }],
            None,
        )

        client = APIClient()
        client.force_authenticate(self.super_admin)
        response = client.get(f'/api/branches/{self.branch.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('qbo_department_id'), '10')
        self.assertEqual(response.data.get('qbo_department_name'), 'Main (APIMAIN)')

    @patch('apps.quickbooks_online.services.QuickBooksService.is_connected', return_value=True)
    @patch('apps.quickbooks_online.services.QuickBooksService.map_branch_to_department')
    def test_qbo_mapping_links_department(self, mock_map_branch, _mock_connected):
        mock_map_branch.return_value = (True, None)

        client = APIClient()
        client.force_authenticate(self.super_admin)
        with patch('apps.quickbooks_online.services.QuickBooksService.list_departments', return_value=([], None)):
            response = client.post(
                f'/api/branches/{self.branch.id}/qbo-mapping/',
                {'department_id': '10'},
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_map_branch.assert_called_once()

    @patch('apps.quickbooks_online.branch_onboard_services.onboard_branch_quickbooks')
    @patch('apps.quickbooks_online.services.QuickBooksService.is_connected', return_value=True)
    def test_qbo_onboard_runs_wizard(self, _mock_connected, mock_onboard):
        mock_onboard.return_value = {
            'branch_id': self.branch.id,
            'branch_name': self.branch.name,
            'dry_run': False,
            'location': {'qbo_department_id': '99', 'qbo_department_name': 'Takoradi'},
            'settlement': {'created': ['1122 (cash_receipts)'], 'mapped': [], 'skipped': [], 'errors': []},
            'main_cash': {'created': ['1142 (main_cash)'], 'mapped': [], 'skipped': [], 'errors': []},
            'settlement_overview': {'assigned': [], 'available': [], 'shared': []},
            'errors': [],
            'warnings': [],
        }

        client = APIClient()
        client.force_authenticate(self.super_admin)
        response = client.post(
            f'/api/branches/{self.branch.id}/qbo-onboard/',
            {
                'location_action': 'auto_sync',
                'provision_settlement': True,
                'provision_main_cash': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_onboard.assert_called_once()
        self.assertEqual(response.data['location']['qbo_department_name'], 'Takoradi')

    @patch('apps.quickbooks_online.branch_onboard_services.onboard_branch_quickbooks')
    @patch('apps.quickbooks_online.services.QuickBooksService.is_connected', return_value=True)
    def test_qbo_onboard_returns_400_on_errors(self, _mock_connected, mock_onboard):
        mock_onboard.return_value = {
            'branch_id': self.branch.id,
            'branch_name': self.branch.name,
            'dry_run': False,
            'errors': ['QuickBooks location sync failed.'],
            'warnings': [],
        }

        client = APIClient()
        client.force_authenticate(self.super_admin)
        response = client.post(
            f'/api/branches/{self.branch.id}/qbo-onboard/',
            {'location_action': 'auto_sync'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('errors', response.data)

    @patch('apps.quickbooks_online.branch_onboard_services.onboard_branch_quickbooks')
    def test_qbo_onboard_requires_connection(self, mock_onboard):
        mock_onboard.return_value = {
            'branch_id': self.branch.id,
            'branch_name': self.branch.name,
            'dry_run': False,
            'errors': ['QuickBooks is not connected. Connect under Admin → Integrations first.'],
            'warnings': [],
        }

        client = APIClient()
        client.force_authenticate(self.super_admin)
        response = client.post(
            f'/api/branches/{self.branch.id}/qbo-onboard/',
            {},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('apps.quickbooks_online.services.QuickBooksService.get_client')
    @patch('apps.quickbooks_online.services.QuickBooksService.is_connected', return_value=True)
    def test_qbo_account_mappings_get_overview(self, _mock_connected, mock_get_client):
        mock_get_client.return_value = MagicMock()
        from apps.quickbooks_online.models import QBOAccountMapping

        QBOAccountMapping.objects.create(
            mapping_kind='control_account',
            mapping_key='accounts_receivable_account',
            qbo_account_id='100',
            qbo_account_name='Company AR',
            status='synced',
        )

        client = APIClient()
        client.force_authenticate(self.super_admin)
        response = client.get(f'/api/branches/{self.branch.id}/qbo-account-mappings/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['branch_id'], self.branch.id)
        self.assertTrue(
            any(row['mapping_key'] == 'accounts_receivable_account' for row in response.data['rows'])
        )

    @patch('apps.quickbooks_online.services.QuickBooksService.get_client')
    @patch('apps.quickbooks_online.services.QuickBooksService.is_connected', return_value=True)
    def test_qbo_account_mappings_rejects_invalid_slot(self, _mock_connected, mock_get_client):
        mock_get_client.return_value = MagicMock()

        client = APIClient()
        client.force_authenticate(self.super_admin)
        response = client.patch(
            f'/api/branches/{self.branch.id}/qbo-account-mappings/',
            {
                'mappings': [{
                    'mapping_kind': 'payment_method',
                    'mapping_key': 'cash',
                    'qbo_account_id': '55',
                }],
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_207_MULTI_STATUS)
        self.assertEqual(response.data['updated'], 0)
        self.assertIn('not configurable', response.data['errors'][0]['detail'])

    @patch('apps.quickbooks_online.branch_qbo_resync_services.queue_branch_sales_document_resync')
    @patch('apps.quickbooks_online.services.QuickBooksService.is_connected', return_value=True)
    def test_qbo_resync_documents(self, _mock_connected, mock_resync):
        mock_resync.return_value = {
            'branch_id': self.branch.id,
            'branch_name': self.branch.name,
            'queued_count': 3,
            'skipped_count': 0,
            'queued': [],
            'skipped': [],
        }
        client = APIClient()
        client.force_authenticate(self.super_admin)
        response = client.post(f'/api/branches/{self.branch.id}/qbo-resync-documents/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['queued_count'], 3)
        mock_resync.assert_called_once()

    @patch('apps.quickbooks_online.owner_coa_services.get_owner_coa_setup_service')
    @patch('apps.quickbooks_online.services.QuickBooksService.is_connected', return_value=True)
    def test_qbo_link_all_locations(self, _mock_connected, mock_service_factory):
        mock_service = MagicMock()
        mock_service.sync_branch_departments.return_value = {
            'linked': [{'branch': self.branch.name}],
            'skipped': [],
            'error': None,
        }
        mock_service_factory.return_value = mock_service

        client = APIClient()
        client.force_authenticate(self.super_admin)
        response = client.post('/api/branches/qbo-link-all-locations/', {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['linked']), 1)

    @patch('apps.quickbooks_online.mapping_services.get_account_mapping_service')
    @patch('apps.quickbooks_online.services.QuickBooksService.get_client')
    @patch('apps.quickbooks_online.services.QuickBooksService.is_connected', return_value=True)
    def test_qbo_suggest_mappings(self, _mock_connected, mock_get_client, mock_mapping_service):
        mock_get_client.return_value = MagicMock()
        service = MagicMock()
        service.suggest_branch_qbo_mappings.return_value = {
            'branch_id': self.branch.id,
            'branch_name': self.branch.name,
            'dry_run': True,
            'suggestions': [{'mapping_key': 'accounts_receivable_account'}],
            'applied': 0,
            'errors': [],
        }
        service.get_branch_mapping_overview.return_value = {
            'branch_id': self.branch.id,
            'branch_name': self.branch.name,
            'groups': [],
            'rows': [],
        }
        mock_mapping_service.return_value = service

        client = APIClient()
        client.force_authenticate(self.super_admin)
        response = client.post(
            f'/api/branches/{self.branch.id}/qbo-suggest-mappings/',
            {'dry_run': True},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['suggestions']), 1)

    def test_branch_delete_archives_without_removing_staff_assignment(self):
        second_branch = Branch.objects.create(
            name='Archive Target',
            code='ARCHIVE',
            phone='555-0300',
            address='789 Archive St',
            city='Springfield',
            region='IL',
            zip_code='62703',
            created_by=self.admin,
        )
        self.technician.branch = second_branch
        self.technician.save(update_fields=['branch'])

        client = APIClient()
        client.force_authenticate(self.admin)
        response = client.delete(f'/api/branches/{second_branch.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        second_branch.refresh_from_db()
        self.technician.refresh_from_db()
        self.assertFalse(second_branch.is_active)
        self.assertEqual(self.technician.branch_id, second_branch.id)

    def test_branch_permanent_delete_removes_empty_branch(self):
        second_branch = Branch.objects.create(
            name='Delete Me',
            code='DELME',
            phone='555-0400',
            address='100 Delete St',
            city='Tema',
            region='Greater Accra',
            zip_code='00233',
            created_by=self.admin,
        )

        client = APIClient()
        client.force_authenticate(self.admin)
        response = client.post(
            f'/api/branches/{second_branch.id}/permanent-delete/',
            {'confirmation': 'Delete Me'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Branch.objects.filter(pk=second_branch.id).exists())

    def test_branch_permanent_delete_blocks_when_records_exist(self):
        from apps.workorders.models import WorkOrder
        from apps.customers.models import Customer
        from apps.vehicles.models import Vehicle

        customer_user = User.objects.create_user(
            email='branch-delete@test.com',
            username='branch_delete_customer',
            password='testpass123',
            first_name='Test',
            last_name='Customer',
            phone='555-0001',
            role='customer',
        )
        customer = Customer.objects.create(
            customer_type='individual',
            user=customer_user,
        )
        vehicle = Vehicle.objects.create(
            owner=customer,
            make='Toyota',
            model='Corolla',
            year=2020,
            vin='1HGCM82633A004352',
            license_plate='BR-001',
            current_mileage=10000,
        )
        WorkOrder.objects.create(
            branch=self.branch,
            customer=customer,
            vehicle=vehicle,
            status='pending',
            customer_concerns='Branch delete blocker test',
            odometer_in=10000,
            created_by=self.admin,
        )

        client = APIClient()
        client.force_authenticate(self.admin)
        response = client.post(
            f'/api/branches/{self.branch.id}/permanent-delete/',
            {'confirmation': self.branch.name},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('work orders', response.data['detail'].lower())
        self.assertTrue(Branch.objects.filter(pk=self.branch.id).exists())


class PrintFooterTemplateTest(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='footer_admin@test.com',
            username='footer_admin',
            password='testpass123',
            role='admin',
            is_staff=True,
        )
        Branch.objects.create(
            name='Accra Branch',
            code='ACC',
            phone='555-1000',
            address='1 Ring Road',
            city='Accra',
            region='Greater Accra',
            zip_code='00233',
            created_by=self.admin,
        )
        Branch.objects.create(
            name='Archived Branch',
            code='ARC',
            phone='555-2000',
            address='2 Old Road',
            city='Tema',
            region='Greater Accra',
            zip_code='00234',
            is_active=False,
            created_by=self.admin,
        )
        Branch.objects.create(
            name='Kumasi Branch',
            code='KUM',
            phone='555-3000',
            address='3 Lake Road',
            city='Kumasi',
            region='Ashanti',
            zip_code='00235',
            created_by=self.admin,
        )

    def tearDown(self):
        clear_settings_cache()

    def test_print_footer_lists_active_branches_and_company_logos(self):
        html = render_to_string(
            'printing/base/components/footer.html',
            {'company_name': 'Smart Vehicle Repairs'},
        )

        # Footer display strips the trailing "Branch" word from stored names.
        self.assertIn('Accra', html)
        self.assertIn('Kumasi', html)
        self.assertNotIn('Accra Branch', html)
        self.assertNotIn('Kumasi Branch', html)
        self.assertIn(' | ', html)
        self.assertNotIn('Archived', html)
        self.assertNotIn('555-1000', html)
        self.assertNotIn('555-3000', html)
        self.assertNotIn('Greater Accra', html)
        self.assertNotIn('Ashanti', html)
        self.assertIn('images/logos/logo-1.jpeg', html)
        self.assertIn('images/logos/logo-2.jpeg', html)
        self.assertIn('images/logos/logo-3.jpeg', html)
        self.assertIn('—Part of AA MobilityGroup—', html)

    def test_branch_print_display_name_strips_trailing_branch(self):
        from apps.branches.utils import branch_print_display_name

        self.assertEqual(branch_print_display_name('Accra Branch'), 'Accra')
        self.assertEqual(branch_print_display_name('Kumasi branch'), 'Kumasi')
        self.assertEqual(branch_print_display_name('Downtown Location'), 'Downtown Location')
        self.assertEqual(branch_print_display_name('Branch'), 'Branch')
        self.assertEqual(branch_print_display_name(''), '')

    def test_default_watermark_covers_non_invoice_templates(self):
        from apps.core.services.print_service import _get_default_watermark

        clear_settings_cache()
        self.assertEqual(
            _get_default_watermark('work_order', SimpleNamespace()).get('text'),
            'WORK ORDER',
        )
        self.assertEqual(
            _get_default_watermark('receipt', SimpleNamespace()).get('text'),
            'RECEIPT',
        )
        self.assertEqual(
            _get_default_watermark('invoice', SimpleNamespace(status='paid')).get('text'),
            'PAID',
        )

    def test_document_watermark_can_be_disabled_from_settings(self):
        from apps.core.services.print_service import _get_default_watermark

        SystemSettings.objects.update_or_create(
            key='document_watermark_enabled',
            defaults={
                'category': 'branding',
                'value': 'false',
                'description': 'Show watermarks on printed and downloaded documents',
                'is_active': True,
            },
        )
        clear_settings_cache()

        self.assertIsNone(_get_default_watermark('work_order', SimpleNamespace()))


class BranchListApiTest(TestCase):
    """API list behaviour for portal and public branch pickers."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email='admin-branches@test.com',
            username='admin-branches',
            password='testpass123',
            role='admin',
            is_staff=True,
        )
        self.customer_user = User.objects.create_user(
            email='customer-branches@test.com',
            username='customer-branches',
            password='testpass123',
            role='customer',
        )
        self.branch = Branch.objects.create(
            name='Portal Branch',
            code='PORT',
            phone='555-0199',
            address='1 Portal Rd',
            city='Accra',
            region='GA',
            zip_code='00000',
            is_active=True,
            created_by=self.admin,
        )

    def test_customer_list_returns_active_branches(self):
        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get('/api/branches/', {'is_active': True})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data if isinstance(response.data, list) else response.data.get('results', [])
        self.assertGreaterEqual(len(results), 1)
        self.assertEqual(results[0]['id'], self.branch.id)
        self.assertEqual(results[0]['name'], 'Portal Branch')
        # Authenticated customers still receive contact fields
        self.assertEqual(results[0].get('phone'), '555-0199')
        self.assertEqual(results[0].get('address'), '1 Portal Rd')

    def test_anonymous_list_omits_contact_fields(self):
        response = self.client.get('/api/branches/', {'is_active': True})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data if isinstance(response.data, list) else response.data.get('results', [])
        self.assertGreaterEqual(len(results), 1)
        row = next(r for r in results if r['id'] == self.branch.id)
        self.assertEqual(row['name'], 'Portal Branch')
        self.assertNotIn('phone', row)
        self.assertNotIn('address', row)
        self.assertIn('city', row)

    @patch('apps.quickbooks_online.services.QuickBooksService.is_connected', side_effect=RuntimeError('QBO unavailable'))
    def test_staff_list_survives_qbo_failure(self, _mock_connected):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/branches/', {'ordering': 'name'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data if isinstance(response.data, list) else response.data.get('results', [])
        self.assertGreaterEqual(len(results), 1)

    @patch('apps.quickbooks_online.services.QuickBooksService.is_connected', side_effect=RuntimeError('QBO unavailable'))
    def test_accessible_survives_qbo_failure(self, _mock_connected):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/branches/accessible/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], self.branch.id)
