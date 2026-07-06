"""Tests for SVR vs QBO owner COA separation."""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.accounting.control_accounts import CONTROL_ACCOUNT_SPECS
from apps.accounting.models import Account, AccountingControl
from apps.accounting.wire_controls import wire_accounting_controls
from apps.branches.models import Branch
from apps.quickbooks_online.models import QBOAccountMapping, QBOConfig, QBOToken
from apps.quickbooks_online.owner_coa_services import (
    OwnerCOASetupService,
    _is_excluded_account,
    find_best_qbo_account,
    find_best_qbo_department,
)
from apps.quickbooks_online.owner_coa_specs import (
    CONTROL_ACCOUNT_QBO_PATTERNS,
    QBO_ACCOUNT_EXCLUDE_PATTERNS,
)
from apps.quickbooks_online.services import QuickBooksService

User = get_user_model()


def _mock_qbo_account(name, account_id='1', account_type='Income', acct_num=''):
    account = MagicMock()
    account.Id = account_id
    account.Name = name
    account.AccountType = account_type
    account.Active = True
    account.AcctNum = acct_num
    return account


class QboAccountNumberTests(TestCase):
    def test_extract_prefers_acctnum(self):
        from apps.quickbooks_online.qbo_account_utils import extract_qbo_account_number

        account = _mock_qbo_account('118.4 · Accra Absa', account_id='5', acct_num='1112')
        self.assertEqual(extract_qbo_account_number(account), '1112')

    def test_extract_falls_back_to_name_prefix(self):
        from apps.quickbooks_online.qbo_account_utils import extract_qbo_account_number

        account = _mock_qbo_account('650 · Operating Service/Sales Revenue', account_id='2')
        self.assertEqual(extract_qbo_account_number(account), '650')


class OwnerCOASpecTests(TestCase):
    def test_subcontractor_income_accounts_are_excluded(self):
        self.assertTrue(_is_excluded_account('685 · Sub-Contractors'))
        self.assertTrue(_is_excluded_account('698K · Kumasi Sales'))

    def test_control_patterns_cover_all_control_fields(self):
        for field_name in AccountingControl.ACCOUNT_FIELD_NAMES:
            self.assertIn(
                field_name,
                CONTROL_ACCOUNT_QBO_PATTERNS,
                f'Missing owner QBO pattern for {field_name}',
            )

    def test_find_best_qbo_account_matches_owner_revenue_code(self):
        accounts = [
            _mock_qbo_account('698K · Kumasi Sales', '1'),
            _mock_qbo_account('650 · Operating Service/Sales Revenue', '2'),
            _mock_qbo_account('685 · Sub-Contractors', '3'),
        ]
        best, score = find_best_qbo_account(accounts, CONTROL_ACCOUNT_QBO_PATTERNS['sales_revenue_account'])
        self.assertEqual(best.Id, '2')
        self.assertGreater(score, 0)

    def test_branch_sales_accounts_not_selected_for_revenue(self):
        accounts = [_mock_qbo_account('698T · Takoradi Sales', '1')]
        best, score = find_best_qbo_account(accounts, CONTROL_ACCOUNT_QBO_PATTERNS['sales_revenue_account'])
        self.assertIsNone(best)
        self.assertLessEqual(score, 0)

    def test_find_best_qbo_account_prefers_inventory_asset_over_category_stock(self):
        accounts = [
            _mock_qbo_account('Tires Inventory', '1440', 'Other Current Asset'),
            _mock_qbo_account('Inventory Asset', '84', 'Other Current Asset'),
            _mock_qbo_account('Inventory Assets', '1400', 'Income'),
        ]
        accounts[0].AccountSubType = 'Inventory'
        accounts[1].AccountSubType = 'Inventory'
        accounts[2].AccountSubType = 'DiscountsRefundsGiven'
        best, score = find_best_qbo_account(
            accounts,
            CONTROL_ACCOUNT_QBO_PATTERNS['inventory_asset_account'],
        )
        self.assertEqual(best.Id, '84')
        self.assertGreater(score, 0)

    @patch.object(QuickBooksService, 'get_client')
    def test_resolve_control_account_pattern_fallback_persists_mapping(self, mock_get_client):
        from apps.quickbooks_online.mapping_services import QBOAccountMappingService

        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        inventory = _mock_qbo_account('Inventory Asset', '84', 'Other Current Asset')
        inventory.AccountSubType = 'Inventory'
        service = QBOAccountMappingService(QuickBooksService())

        with patch.object(service, 'list_accounts', return_value=([
            {
                'id': '84',
                'name': 'Inventory Asset',
                'account_number': '',
                'account_type': 'Other Current Asset',
                'account_sub_type': 'Inventory',
                'active': True,
                'mapped_row': None,
            },
        ], None)):
            with patch.object(service, '_fetch_qbo_account', return_value=inventory):
                account_id = service.resolve_control_account_qbo_id('inventory_asset_account')

        self.assertEqual(account_id, '84')
        mapping = QBOAccountMapping.objects.filter(
            mapping_kind='control_account',
            mapping_key='inventory_asset_account',
        ).first()
        self.assertIsNotNone(mapping)
        self.assertEqual(mapping.qbo_account_id, '84')

    @patch.object(QuickBooksService, 'get_client')
    def test_resolve_control_account_pattern_fallback_without_persist_for_ar(self, mock_get_client):
        from apps.quickbooks_online.mapping_services import QBOAccountMappingService

        mock_get_client.return_value = MagicMock()
        service = QBOAccountMappingService(QuickBooksService())
        ar = _mock_qbo_account('120 · Accounts Receivable', '120', 'Accounts Receivable')
        ar.AccountSubType = 'AccountsReceivable'

        with patch.object(service, 'list_accounts', return_value=([
            {
                'id': '120',
                'name': '120 · Accounts Receivable',
                'account_number': '120',
                'account_type': 'Accounts Receivable',
                'account_sub_type': 'AccountsReceivable',
                'active': True,
                'mapped_row': None,
            },
        ], None)):
            account_id = service.resolve_control_account_qbo_id('accounts_receivable_account')

        self.assertEqual(account_id, '120')
        self.assertFalse(
            QBOAccountMapping.objects.filter(
                mapping_kind='control_account',
                mapping_key='accounts_receivable_account',
            ).exists(),
        )


class SVRLeanChartTests(TestCase):
    def test_setup_chart_does_not_import_owner_revenue_tree(self):
        from django.core.management import call_command

        call_command('setup_chart_of_accounts')
        codes = set(Account.objects.values_list('code', flat=True))
        owner_revenue_codes = {'651', '656', '658', '661', '685', '698', '699'}
        self.assertFalse(codes & owner_revenue_codes)
        self.assertIn('4000', codes)
        self.assertIn('2320', codes)
        self.assertIn('6030', codes)

    def test_wire_controls_links_all_seventeen_fields(self):
        wire_accounting_controls(force=True)
        controls = AccountingControl.get_settings()
        for field_name in AccountingControl.ACCOUNT_FIELD_NAMES:
            account = getattr(controls, field_name, None)
            self.assertIsNotNone(account, f'{field_name} not wired')
            spec_code = CONTROL_ACCOUNT_SPECS[field_name][0]
            self.assertEqual(account.code, spec_code)


class OwnerCOASetupServiceTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='owner-coa@test.com',
            username='owner_coa_admin',
            password='password',
        )
        self.config = QBOConfig.objects.create(
            client_id='test_id',
            client_secret='test_secret',
            realm_id='12345',
            is_active=True,
        )
        QBOToken.objects.create(
            config=self.config,
            access_token='access',
            refresh_token='refresh',
            expires_at=timezone.now() + timedelta(days=1),
            refresh_token_expires_at=timezone.now() + timedelta(days=1),
        )
        from apps.quickbooks_online.mapping_services import QBOAccountMappingService

        self.service = OwnerCOASetupService(QBOAccountMappingService(QuickBooksService()))

    @patch('apps.quickbooks_online.mapping_services.QBAccount')
    @patch.object(QuickBooksService, 'get_client')
    def test_validate_owner_chart_warns_on_subcontractor_income(self, mock_get_client, mock_qb_account):
        mock_get_client.return_value = MagicMock()
        mock_qb_account.all.return_value = [
            _mock_qbo_account('685 · Sub-Contractors:692 · Mechanical Works', '10'),
        ]
        client, _ = self.service._require_client()
        accounts = self.service._load_qbo_accounts(client)
        warnings = self.service.validate_owner_chart(accounts)
        codes = {warning.get('code') for warning in warnings}
        self.assertIn('685', codes)

    @patch('apps.quickbooks_online.mapping_services.QBTaxCode')
    @patch('apps.quickbooks_online.mapping_services.QBAccount')
    @patch.object(QuickBooksService, 'get_client')
    def test_apply_mappings_maps_control_accounts(self, mock_get_client, mock_qb_account, mock_qb_tax):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        ar = _mock_qbo_account('120 · Accounts Receivable', '120', 'Accounts Receivable')
        revenue = _mock_qbo_account('650 · Operating Service/Sales Revenue', '650')
        revenue.AccountSubType = 'SalesOfProductIncome'
        ap = _mock_qbo_account('400 · Accounts Payable', '400', 'Accounts Payable')
        inventory = _mock_qbo_account('Stock:12100 · Inventory Asset', '12100', 'Other Current Asset')
        inventory.AccountSubType = 'Inventory'
        cogs = _mock_qbo_account('700 · Cost of Goods Sold', '700', 'Cost of Goods Sold')
        cogs.AccountSubType = 'SuppliesMaterialsCogs'
        bank = _mock_qbo_account('118.4 · Accra Absa- 1025924', '1184', 'Bank')
        mock_qb_account.all.return_value = [ar, revenue, ap, inventory, cogs, bank]

        accounts_by_id = {
            120: ar,
            400: ap,
            650: revenue,
            12100: inventory,
            700: cogs,
            1184: bank,
        }

        def get_account(account_id, qb=None):
            return accounts_by_id[int(account_id)]

        mock_qb_account.get.side_effect = get_account
        mock_qb_tax.all.return_value = []

        wire_accounting_controls(force=True)
        result = self.service.apply_control_and_payment_mappings(dry_run=False, user=self.admin)
        self.assertIsNone(result['error'])
        ar_mapping = QBOAccountMapping.objects.filter(
            mapping_kind='control_account',
            mapping_key='accounts_receivable_account',
        ).first()
        self.assertIsNotNone(
            ar_mapping,
            msg=f"AR not mapped; skipped={result.get('skipped')}, mapped={result.get('mapped')}",
        )
        self.assertEqual(ar_mapping.qbo_account_id, '120')

    @patch('apps.quickbooks_online.owner_coa_services.QBDepartment')
    @patch.object(QuickBooksService, 'map_branch_to_department')
    @patch.object(QuickBooksService, 'get_client')
    def test_sync_branch_departments_links_by_city(self, mock_get_client, mock_map_branch, mock_qb_dept):
        mock_get_client.return_value = MagicMock()
        dept = MagicMock()
        dept.Id = '55'
        dept.Name = 'Kumasi Workshop'
        mock_qb_dept.all.return_value = [dept]
        mock_map_branch.return_value = (True, None)

        branch = Branch.objects.create(
            name='Kumasi Main',
            code='KUM1',
            phone='1234567890',
            address='1 Test St',
            city='Kumasi',
            state='Ashanti',
            zip_code='00233',
            country='Ghana',
            created_by=self.admin,
        )
        result = self.service.sync_branch_departments(dry_run=False)
        self.assertIsNone(result['error'])
        self.assertEqual(len(result['linked']), 1)
        mock_map_branch.assert_called_once_with(branch, '55')

    def test_find_department_by_branch_city(self):
        branch = Branch(
            name='HQ',
            code='HQ',
            city='Tamale',
        )
        dept = MagicMock()
        dept.Name = 'Tamale Operations'
        match = find_best_qbo_department([dept], branch)
        self.assertEqual(match, dept)


class OwnerCOASetupApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='owner-coa-api@test.com',
            username='owner_coa_api_admin',
            password='password',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    @patch.object(QuickBooksService, 'is_connected', return_value=False)
    def test_apply_owner_template_requires_connection(self, _mock_connected):
        response = self.client.post(
            '/api/quickbooks/account-mappings/apply-owner-template/',
            {'dry_run': True},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch.object(QuickBooksService, 'get_client', return_value=MagicMock())
    @patch.object(QuickBooksService, 'is_connected', return_value=True)
    @patch.object(QuickBooksService, 'sdk_available', return_value=True)
    @patch('apps.quickbooks_online.owner_coa_services.get_owner_coa_setup_service')
    @patch('apps.quickbooks_online.api_views.get_account_mapping_service')
    def test_apply_owner_template_returns_setup_result(
        self, mock_mapping, mock_service_factory, *_mocks,
    ):
        mock_service = MagicMock()
        mock_service.run_full_setup.return_value = {
            'success': True,
            'dry_run': True,
            'warnings': [],
            'supplemental_accounts': {'created': [], 'skipped': []},
            'mappings': {'mapped': [], 'skipped': []},
            'invoice_line_items': {'items': []},
            'branch_departments': {'linked': [], 'skipped': []},
        }
        mock_service_factory.return_value = mock_service
        mock_mapping.return_value.get_mapping_overview.return_value = {
            'groups': [],
            'rows': [],
        }

        response = self.client.post(
            '/api/quickbooks/account-mappings/apply-owner-template/',
            {'dry_run': True},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        mock_service.run_full_setup.assert_called_once()
