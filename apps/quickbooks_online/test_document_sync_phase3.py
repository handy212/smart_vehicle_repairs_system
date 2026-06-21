import base64
import hashlib
import hmac
import json
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import override_settings
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APITestCase

from apps.billing.models import CreditNote, CreditNoteLineItem, Estimate, Invoice, InvoiceLineItem
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.quickbooks_online.models import QBOMapping, QBOAccountMapping, QBOConfig, QBOSyncLog, QBOToken
from apps.quickbooks_online.services import QuickBooksService

User = get_user_model()


class TaxCodeResolutionTests(APITestCase):
    def setUp(self):
        self.service = QuickBooksService()
        self.mapping_service = MagicMock()
        self.invoice = MagicMock()
        self.invoice.tax_amount = Decimal('15.00')
        self.invoice.tax_vat_amount = Decimal('10.00')
        self.invoice.tax_nhil_amount = Decimal('5.00')
        self.invoice.tax_getfund_amount = Decimal('0')
        self.invoice.tax_hrl_amount = Decimal('0')

    def test_prefers_composite_tax_code(self):
        self.mapping_service.resolve_tax_code_id.side_effect = lambda key: {
            'composite': 'COMP-1',
            'vat': 'VAT-1',
        }.get(key)

        tax_code_id = self.service._resolve_tax_code_id(self.mapping_service, self.invoice)
        self.assertEqual(tax_code_id, 'COMP-1')

    def test_falls_back_to_mapped_levy(self):
        self.mapping_service.resolve_tax_code_id.side_effect = lambda key: {
            'vat': 'VAT-1',
        }.get(key)

        tax_code_id = self.service._resolve_tax_code_id(self.mapping_service, self.invoice)
        self.assertEqual(tax_code_id, 'VAT-1')

    @patch.object(QuickBooksService, '_get_mapping_service')
    def test_apply_mapped_tax_sets_total_tax(self, mock_get_mapping):
        mock_get_mapping.return_value = self.mapping_service
        self.mapping_service.resolve_tax_code_id.return_value = 'COMP-1'
        qb_invoice = MagicMock()

        with patch('apps.quickbooks_online.services.TxnTaxDetail', create=True), patch(
            'apps.quickbooks_online.services.Ref', create=True
        ):
            from apps.quickbooks_online.services import TxnTaxDetail, Ref

            txn_tax = MagicMock()
            TxnTaxDetail.return_value = txn_tax
            ref = MagicMock()
            Ref.return_value = ref

            self.service._apply_mapped_tax(qb_invoice, self.invoice)

        self.assertIsNotNone(qb_invoice.TxnTaxDetail)
        self.assertEqual(qb_invoice.TxnTaxDetail.TotalTax, 15.0)


class CreditMemoLineMappingTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='cm-lines@test.com',
            username='cm_lines_admin',
            password='password',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN-CM', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='cm-cust',
            email='cm-cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-CM')
        self.credit_note = CreditNote.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='issued',
            subtotal=Decimal('100.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('100.00'),
            created_by=self.admin,
        )
        CreditNoteLineItem.objects.create(
            credit_note=self.credit_note,
            description='Labor credit',
            quantity=Decimal('1'),
            unit_price=Decimal('100.00'),
        )
        QBOAccountMapping.objects.create(
            mapping_kind='invoice_line_type',
            mapping_key='other',
            qbo_item_id='ITEM-OTHER',
            qbo_item_name='Other Service',
        )

    @patch.object(QuickBooksService, 'get_client')
    @patch.object(QuickBooksService, 'sync_customer')
    @patch.object(QuickBooksService, '_save_qb')
    def test_credit_memo_lines_use_mapped_qbo_item(self, mock_save, mock_sync_customer, mock_client):
        mock_client.return_value = MagicMock()
        mock_customer = MagicMock()
        mock_customer.Id = '55'
        mock_sync_customer.return_value = mock_customer
        mock_save.side_effect = lambda qb_obj, _client: setattr(qb_obj, 'Id', 'CM-1') or setattr(
            qb_obj, 'SyncToken', '0'
        )

        service = QuickBooksService()
        with patch('apps.quickbooks_online.services.QBCreditMemo') as mock_cm_cls, patch(
            'apps.quickbooks_online.services.Ref', create=True
        ), patch('apps.quickbooks_online.services.DetailLine', create=True), patch(
            'apps.quickbooks_online.services.SalesItemLineDetail', create=True
        ):
            qb_cm = MagicMock()
            qb_cm.Line = []
            mock_cm_cls.return_value = qb_cm

            from apps.quickbooks_online.services import DetailLine, SalesItemLineDetail, Ref

            detail_line = MagicMock()
            sales_item = MagicMock()
            DetailLine.return_value = detail_line
            SalesItemLineDetail.return_value = sales_item
            Ref.return_value = MagicMock()

            result = service.sync_credit_note(self.credit_note)

        self.assertIsNotNone(result)
        self.assertTrue(sales_item.ItemRef is not None)
        self.assertEqual(sales_item.ItemRef.value, 'ITEM-OTHER')


class InboundEstimateCreditMemoPullTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='pull-ec@test.com',
            username='pull_ec_admin',
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
        self.branch = Branch.objects.create(name='Main', code='MAIN-EC', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='pull-ec-cust',
            email='pull-ec@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-EC')
        self.estimate = Estimate.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            estimate_date=timezone.now().date(),
            valid_until=timezone.now().date() + timedelta(days=30),
            created_by=self.admin,
        )
        self.credit_note = CreditNote.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='issued',
            subtotal=Decimal('50.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('50.00'),
            created_by=self.admin,
        )
        estimate_ct = ContentType.objects.get_for_model(self.estimate)
        credit_ct = ContentType.objects.get_for_model(self.credit_note)
        QBOMapping.objects.create(
            content_type=estimate_ct,
            object_id=self.estimate.id,
            qbo_id='EST-1',
            status='synced',
        )
        QBOMapping.objects.create(
            content_type=credit_ct,
            object_id=self.credit_note.id,
            qbo_id='CM-1',
            status='synced',
        )

    @patch.object(QuickBooksService, 'get_client')
    def test_pull_estimates_updates_local_status(self, mock_get_client):
        mock_get_client.return_value = MagicMock()
        qb_estimate = MagicMock()
        qb_estimate.Id = 'EST-1'
        qb_estimate.TxnStatus = 'Accepted'
        qb_estimate.SyncToken = '1'

        service = QuickBooksService()
        with patch('apps.quickbooks_online.services.QBEstimate') as mock_estimate_cls:
            mock_estimate_cls.all.return_value = [qb_estimate]
            log = service.pull_estimates()

        self.estimate.refresh_from_db()
        self.assertEqual(self.estimate.status, 'approved')
        self.assertEqual(log.records_updated, 1)

    @patch.object(QuickBooksService, 'get_client')
    def test_pull_credit_memos_marks_applied(self, mock_get_client):
        mock_get_client.return_value = MagicMock()
        qb_credit_memo = MagicMock()
        qb_credit_memo.Id = 'CM-1'
        qb_credit_memo.RemainingCredit = 0
        qb_credit_memo.SyncToken = '1'

        service = QuickBooksService()
        with patch('apps.quickbooks_online.services.QBCreditMemo') as mock_cm_cls:
            mock_cm_cls.all.return_value = [qb_credit_memo]
            log = service.pull_credit_memos()

        self.credit_note.refresh_from_db()
        self.assertEqual(self.credit_note.status, 'applied')
        self.assertEqual(log.records_updated, 1)


@override_settings(REQUIRE_WEBHOOK_SIGNATURES=False)
class QBOWebhookEstimateCreditMemoTests(APITestCase):
    def setUp(self):
        self.config = QBOConfig.objects.create(
            client_id='test_id',
            client_secret='test_secret',
            realm_id='realm-123',
            is_active=True,
        )

    @patch('apps.quickbooks_online.tasks.task_pull_estimates_from_qbo.delay')
    @patch('apps.quickbooks_online.tasks.task_pull_credit_memos_from_qbo.delay')
    def test_webhook_queues_estimate_and_credit_memo_pulls(self, mock_cm_delay, mock_est_delay):
        payload = {
            'eventNotifications': [
                {
                    'realmId': 'realm-123',
                    'dataChangeEvent': {
                        'entities': [
                            {'name': 'Estimate', 'operation': 'Update'},
                            {'name': 'CreditMemo', 'operation': 'Create'},
                        ],
                    },
                },
            ],
        }
        body = json.dumps(payload).encode('utf-8')
        signature = base64.b64encode(
            hmac.new(b'test-token', body, hashlib.sha256).digest()
        ).decode('utf-8')

        with patch('apps.accounts.admin_models.SystemSettings') as mock_settings:
            mock_settings.get_setting.return_value = 'test-token'
            response = self.client.post(
                '/api/quickbooks/webhook/',
                data=body,
                content_type='application/json',
                HTTP_INTUIT_SIGNATURE=signature,
            )

        self.assertEqual(response.status_code, 200)
        mock_est_delay.assert_called_once()
        mock_cm_delay.assert_called_once()
        self.assertIn('estimate', response.json()['queued'])
        self.assertIn('credit_memo', response.json()['queued'])
