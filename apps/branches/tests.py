"""
Tests for branches app
"""
from django.test import TestCase
from unittest.mock import patch
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
            state='IL',
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
            state='TS',
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
            state='OC',
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
            state='IL',
            zip_code='62701',
            created_by=self.admin,
        )

    def test_manage_branches_permission_controls_branch_create(self):
        payload = {
            'name': 'Second Branch',
            'code': 'SECOND',
            'phone': '555-0200',
            'address': '456 Second St',
            'city': 'Springfield',
            'state': 'IL',
            'zip_code': '62702',
            'country': 'USA',
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

    def test_branch_delete_archives_without_removing_staff_assignment(self):
        second_branch = Branch.objects.create(
            name='Archive Target',
            code='ARCHIVE',
            phone='555-0300',
            address='789 Archive St',
            city='Springfield',
            state='IL',
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
            state='Greater Accra',
            zip_code='00233',
            created_by=self.admin,
        )
        Branch.objects.create(
            name='Archived Branch',
            code='ARC',
            phone='555-2000',
            address='2 Old Road',
            city='Tema',
            state='Greater Accra',
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
            state='Ashanti',
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

        self.assertIn('Accra Branch', html)
        self.assertIn('Kumasi Branch', html)
        self.assertIn(' | ', html)
        self.assertNotIn('Archived Branch', html)
        self.assertNotIn('555-1000', html)
        self.assertNotIn('555-3000', html)
        self.assertNotIn('Greater Accra', html)
        self.assertNotIn('Ashanti', html)
        self.assertIn('images/logos/logo-1.jpeg', html)
        self.assertIn('images/logos/logo-2.jpeg', html)
        self.assertIn('images/logos/logo-3.jpeg', html)

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
            state='GA',
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
