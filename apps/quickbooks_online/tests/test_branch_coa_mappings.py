"""Tests for per-branch QBO chart-of-accounts mapping overrides."""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.branches.models import Branch
from apps.quickbooks_online.mapping_services import QBOAccountMappingService
from apps.quickbooks_online.models import QBOAccountMapping

User = get_user_model()


class BranchCoaMappingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            email='qbo-branch-coa@test.com',
            username='qbo-branch-coa-admin',
            password='testpass123',
            role='admin',
            is_staff=True,
        )
        cls.branch_a = Branch.objects.create(
            name='Takoradi Branch',
            code='TKD',
            phone='0200000001',
            address='1 Main St',
            city='Takoradi',
            state='Western',
            zip_code='00000',
            country='Ghana',
            created_by=cls.admin,
        )
        cls.branch_b = Branch.objects.create(
            name='Accra Branch',
            code='ACC',
            phone='0200000002',
            address='2 Ring Rd',
            city='Accra',
            state='Greater Accra',
            zip_code='00000',
            country='Ghana',
            created_by=cls.admin,
        )

    def _service(self):
        qb = MagicMock()
        qb.get_client.return_value = MagicMock()
        return QBOAccountMappingService(qb)

    def test_company_default_mapping_used_when_no_branch_override(self):
        QBOAccountMapping.objects.create(
            mapping_kind='control_account',
            mapping_key='accounts_receivable_account',
            qbo_account_id='100',
            qbo_account_name='Accounts Receivable',
            status='synced',
        )
        service = self._service()
        account_id = service.resolve_control_account_qbo_id(
            'accounts_receivable_account',
            branch=self.branch_a,
        )
        self.assertEqual(account_id, '100')

    def test_branch_override_beats_company_default(self):
        QBOAccountMapping.objects.create(
            mapping_kind='control_account',
            mapping_key='accounts_receivable_account',
            qbo_account_id='100',
            qbo_account_name='Company AR',
            status='synced',
        )
        QBOAccountMapping.objects.create(
            mapping_kind='control_account',
            mapping_key='accounts_receivable_account',
            branch=self.branch_a,
            qbo_account_id='201',
            qbo_account_name='Takoradi AR',
            status='synced',
        )
        service = self._service()
        self.assertEqual(
            service.resolve_control_account_qbo_id('accounts_receivable_account', branch=self.branch_a),
            '201',
        )
        self.assertEqual(
            service.resolve_control_account_qbo_id('accounts_receivable_account', branch=self.branch_b),
            '100',
        )

    def test_branch_invoice_line_item_override(self):
        QBOAccountMapping.objects.create(
            mapping_kind='invoice_line_type',
            mapping_key='labor',
            qbo_item_id='10',
            qbo_item_name='Labor (company)',
            status='synced',
        )
        QBOAccountMapping.objects.create(
            mapping_kind='invoice_line_type',
            mapping_key='labor',
            branch=self.branch_a,
            qbo_item_id='20',
            qbo_item_name='Labor (Takoradi)',
            status='synced',
        )
        service = self._service()
        self.assertEqual(service.resolve_invoice_line_item_id('labor', branch=self.branch_a), '20')
        self.assertEqual(service.resolve_invoice_line_item_id('labor', branch=self.branch_b), '10')

    def test_clear_row_only_removes_branch_override(self):
        QBOAccountMapping.objects.create(
            mapping_kind='control_account',
            mapping_key='cost_of_goods_sold_account',
            qbo_account_id='500',
            qbo_account_name='Company COGS',
            status='synced',
        )
        QBOAccountMapping.objects.create(
            mapping_kind='control_account',
            mapping_key='cost_of_goods_sold_account',
            branch=self.branch_a,
            qbo_account_id='701',
            qbo_account_name='Takoradi COGS',
            status='synced',
        )
        service = self._service()
        cleared = service.clear_row(
            'control_account',
            'cost_of_goods_sold_account',
            branch=self.branch_a,
        )
        self.assertTrue(cleared)
        self.assertEqual(
            service.resolve_control_account_qbo_id('cost_of_goods_sold_account', branch=self.branch_a),
            '500',
        )

    def test_get_branch_mapping_overview_marks_inherit_status(self):
        QBOAccountMapping.objects.create(
            mapping_kind='control_account',
            mapping_key='sales_revenue_account',
            qbo_account_id='698',
            qbo_account_name='Sales Revenue',
            status='synced',
        )
        service = self._service()
        overview = service.get_branch_mapping_overview(self.branch_a)
        ar_row = next(
            row for row in overview['rows']
            if row['mapping_key'] == 'accounts_receivable_account'
        )
        self.assertEqual(ar_row['status'], 'inherit')
        revenue_row = next(
            row for row in overview['rows']
            if row['mapping_key'] == 'sales_revenue_account'
        )
        self.assertTrue(revenue_row['inherits_company_default'])
        self.assertEqual(revenue_row['effective_mapping']['source'], 'company')

    @patch('apps.quickbooks_online.mapping_services.extract_qbo_account_number', return_value='120')
    @patch.object(QBOAccountMappingService, '_fetch_qbo_account')
    def test_map_row_persists_branch_scoped_control_account(self, mock_fetch, _mock_extract):
        account = MagicMock()
        account.Id = '321'
        account.Name = 'Takoradi AR'
        account.AccountType = 'Accounts Receivable'
        mock_fetch.return_value = account

        service = self._service()
        ok, error = service.map_row(
            'control_account',
            'accounts_receivable_account',
            qbo_account_id='321',
            branch=self.branch_a,
            user=None,
        )
        self.assertTrue(ok, error)
        mapping = QBOAccountMapping.objects.get(
            mapping_kind='control_account',
            mapping_key='accounts_receivable_account',
            branch=self.branch_a,
        )
        self.assertEqual(mapping.qbo_account_id, '321')
        self.assertIsNone(mapping.svr_account_id)
