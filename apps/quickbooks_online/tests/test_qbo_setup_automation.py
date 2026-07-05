"""Tests for QBO setup automation (suggest, copy, resync, status)."""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.branches.models import Branch
from apps.quickbooks_online.mapping_services import QBOAccountMappingService
from apps.quickbooks_online.models import QBOAccountMapping
from apps.quickbooks_online.qbo_setup_status import get_qbo_setup_status

User = get_user_model()


class BranchQboSetupAutomationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            email='qbo-setup-auto@test.com',
            username='qbo-setup-auto',
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

    @patch.object(QBOAccountMappingService, '_pattern_resolve_branch_control_account_qbo_id', return_value='301')
    @patch.object(QBOAccountMappingService, '_fetch_qbo_account')
    def test_suggest_branch_mappings_dry_run(self, mock_fetch, _mock_pattern):
        account = MagicMock()
        account.Name = 'Takoradi AR'
        mock_fetch.return_value = account
        service = self._service()
        result = service.suggest_branch_qbo_mappings(self.branch_a, dry_run=True)
        self.assertTrue(result['dry_run'])
        self.assertGreaterEqual(len(result['suggestions']), 1)
        self.assertEqual(result['applied'], 0)
        self.assertFalse(
            QBOAccountMapping.objects.filter(
                branch=self.branch_a,
                mapping_key='accounts_receivable_account',
            ).exists()
        )

    @patch('apps.quickbooks_online.mapping_services.extract_qbo_account_number', return_value='120')
    @patch.object(QBOAccountMappingService, '_fetch_qbo_account')
    def test_copy_branch_mappings(self, mock_fetch, _mock_extract):
        account = MagicMock()
        account.Id = '201'
        account.Name = 'Takoradi AR'
        account.AccountType = 'Accounts Receivable'
        mock_fetch.return_value = account

        QBOAccountMapping.objects.create(
            mapping_kind='control_account',
            mapping_key='accounts_receivable_account',
            branch=self.branch_a,
            qbo_account_id='201',
            qbo_account_name='Takoradi AR',
            status='synced',
        )
        service = self._service()
        result = service.copy_branch_qbo_mappings(self.branch_b, self.branch_a)
        self.assertEqual(result['copied'], 1)
        copied = QBOAccountMapping.objects.get(
            branch=self.branch_b,
            mapping_key='accounts_receivable_account',
        )
        self.assertEqual(copied.qbo_account_id, '201')

    @patch('apps.quickbooks_online.services.QuickBooksService.is_connected', return_value=False)
    def test_setup_status_when_disconnected(self, _mock_connected):
        status = get_qbo_setup_status()
        self.assertFalse(status['is_connected'])
        self.assertEqual(status['next_steps'][0]['id'], 'connect')

    @patch('apps.quickbooks_online.branch_qbo_resync_services.schedule_entity_sync')
    @patch('apps.quickbooks_online.branch_qbo_resync_services.is_outbound_eligible', return_value=(True, ''))
    def test_queue_branch_resync(self, _mock_eligible, mock_schedule):
        from django.utils import timezone

        from apps.billing.models import Invoice
        from apps.customers.models import Customer
        from apps.quickbooks_online.branch_qbo_resync_services import queue_branch_sales_document_resync

        customer_user = User.objects.create_user(
            username='resync_cust',
            email='resync_cust@example.com',
            password='password',
            role='customer',
        )
        customer = Customer.objects.create(
            user=customer_user,
            customer_number='CUST-RESYNC-1',
            customer_type='individual',
        )
        Invoice.objects.create(
            customer=customer,
            branch=self.branch_a,
            invoice_number='INV-RESYNC-1',
            status='sent',
            created_by=self.admin,
            invoice_date=timezone.now().date(),
        )
        result = queue_branch_sales_document_resync(self.branch_a)
        self.assertGreaterEqual(result['queued_count'], 1)
        mock_schedule.assert_called()
