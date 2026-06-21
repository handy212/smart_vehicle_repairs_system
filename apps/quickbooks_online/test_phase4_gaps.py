"""Phase 4 QBO gaps: items, deposits, payment allocation, attachments."""
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta

from apps.accounting.models import Account
from apps.billing.models import Invoice, Payment, PaymentAllocation
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inventory.models import Part, PartCategory
from apps.quickbooks_online.models import QBOMapping, QBOConfig, QBOToken
from apps.quickbooks_online.payment_helpers import (
    PaymentSyncError,
    build_qbo_payment_lines,
    is_customer_deposit_payment,
    payment_private_note,
)
from apps.quickbooks_online.services import QuickBooksService

User = get_user_model()


class _MockPaymentLine:
    def __init__(self):
        self.Amount = None
        self.LinkedTxn = None


class _MockLinkedTxn:
    def __init__(self):
        self.TxnId = None
        self.TxnType = None


class Phase4PaymentHelperTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='phase4@test.com',
            username='phase4_admin',
            password='password',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN-P4', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='phase4-cust',
            email='phase4-cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-P4')
        self.bank_account = Account.objects.create(
            code='1100',
            name='Operating Bank',
            account_type='asset',
            account_subtype='bank',
            balance_type='debit',
            is_active=True,
        )

    def _invoice(self, *, status='sent'):
        return Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status=status,
            total=Decimal('100.00'),
            amount_due=Decimal('100.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )

    def _payment(self, invoice, amount=Decimal('50.00')):
        return Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            bank_account=self.bank_account,
            status='completed',
            amount=amount,
            processed_by=self.admin,
        )

    def test_proforma_payment_is_customer_deposit(self):
        invoice = self._invoice(status='proforma')
        payment = self._payment(invoice)
        self.assertTrue(is_customer_deposit_payment(payment))
        self.assertIn('deposit', payment_private_note(payment).lower())

    def test_proforma_payment_has_no_linked_lines(self):
        invoice = self._invoice(status='proforma')
        payment = self._payment(invoice)
        service = MagicMock()
        lines = build_qbo_payment_lines(
            service,
            payment,
            PaymentLine=_MockPaymentLine,
            LinkedTxn=_MockLinkedTxn,
        )
        self.assertEqual(lines, [])

    def test_finalized_payment_blocks_when_invoice_not_in_qbo(self):
        invoice = self._invoice(status='sent')
        payment = self._payment(invoice)
        service = MagicMock()
        service.sync_invoice.return_value = None

        with self.assertRaises(PaymentSyncError) as ctx:
            build_qbo_payment_lines(
                service,
                payment,
                PaymentLine=_MockPaymentLine,
                LinkedTxn=_MockLinkedTxn,
            )
        self.assertIn('not synced', str(ctx.exception).lower())

    def test_finalized_payment_links_to_qbo_invoice(self):
        invoice = self._invoice(status='sent')
        payment = self._payment(invoice, amount=Decimal('75.00'))
        invoice_ct = ContentType.objects.get_for_model(invoice)
        QBOMapping.objects.create(
            content_type=invoice_ct,
            object_id=invoice.id,
            qbo_id='INV-99',
            status='synced',
        )
        service = MagicMock()

        lines = build_qbo_payment_lines(
            service,
            payment,
            PaymentLine=_MockPaymentLine,
            LinkedTxn=_MockLinkedTxn,
        )
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0].Amount, 75.0)
        self.assertEqual(lines[0].LinkedTxn[0].TxnId, 'INV-99')
        self.assertEqual(lines[0].LinkedTxn[0].TxnType, 'Invoice')

    def test_payment_allocations_create_multiple_lines(self):
        invoice_a = self._invoice()
        invoice_b = self._invoice()
        payment = self._payment(invoice_a, amount=Decimal('100.00'))
        PaymentAllocation.objects.create(
            payment=payment,
            invoice=invoice_a,
            amount=Decimal('60.00'),
            allocated_by=self.admin,
        )
        PaymentAllocation.objects.create(
            payment=payment,
            invoice=invoice_b,
            amount=Decimal('40.00'),
            allocated_by=self.admin,
        )
        for inv, qbo_id in ((invoice_a, 'INV-A'), (invoice_b, 'INV-B')):
            QBOMapping.objects.create(
                content_type=ContentType.objects.get_for_model(inv),
                object_id=inv.id,
                qbo_id=qbo_id,
                status='synced',
            )

        service = MagicMock()
        lines = build_qbo_payment_lines(
            service,
            payment,
            PaymentLine=_MockPaymentLine,
            LinkedTxn=_MockLinkedTxn,
        )
        self.assertEqual(len(lines), 2)
        linked_ids = {line.LinkedTxn[0].TxnId for line in lines}
        self.assertEqual(linked_ids, {'INV-A', 'INV-B'})


class Phase4SyncPaymentIntegrationTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='phase4-sync@test.com',
            username='phase4_sync_admin',
            password='password',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN-P4S', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='phase4-sync-cust',
            email='phase4-sync-cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-P4S')
        self.bank_account = Account.objects.create(
            code='1100',
            name='Operating Bank',
            account_type='asset',
            account_subtype='bank',
            balance_type='debit',
            is_active=True,
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

    @patch.object(QuickBooksService, 'get_client')
    @patch.object(QuickBooksService, 'sync_customer')
    @patch('apps.quickbooks_online.services.QBPayment')
    def test_sync_payment_fails_when_invoice_not_linked(
        self, mock_payment_cls, mock_sync_customer, mock_client
    ):
        mock_client.return_value = MagicMock()
        mock_customer = MagicMock()
        mock_customer.Id = 'CUST-1'
        mock_sync_customer.return_value = mock_customer
        mock_payment_cls.return_value = MagicMock()

        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            total=Decimal('100.00'),
            amount_due=Decimal('100.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        payment = Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            bank_account=self.bank_account,
            status='completed',
            amount=Decimal('50.00'),
            processed_by=self.admin,
        )

        with patch.object(QuickBooksService, 'sync_invoice', return_value=None):
            result = QuickBooksService().sync_payment(payment)

        self.assertIsNone(result)
        mapping = QBOMapping.objects.get(
            content_type=ContentType.objects.get_for_model(payment),
            object_id=payment.id,
        )
        self.assertEqual(mapping.status, 'failed')
        self.assertIn('not synced', mapping.error_message.lower())


class Phase4PartSyncTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='phase4-part@test.com',
            username='phase4_part_admin',
            password='password',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN-P4P', created_by=self.admin)
        self.category = PartCategory.objects.create(name='Filters')
        self.part = Part.objects.create(
            part_number='OIL-001',
            name='Oil Filter',
            category=self.category,
            branch=self.branch,
            cost_price=Decimal('10.00'),
            selling_price=Decimal('20.00'),
            created_by=self.admin,
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

    @patch.object(QuickBooksService, 'get_client')
    @patch.object(QuickBooksService, '_save_qb')
    @patch('apps.quickbooks_online.item_sync.QBItem')
    @patch('apps.quickbooks_online.item_sync.Ref')
    def test_sync_part_creates_qbo_mapping(self, mock_ref, mock_qb_item_cls, mock_save, mock_client):
        mock_client.return_value = MagicMock()
        mock_ref.return_value = MagicMock()
        qb_item = MagicMock()
        qb_item.Id = 'ITEM-42'
        qb_item.SyncToken = '0'
        mock_qb_item_cls.return_value = qb_item
        mock_save.side_effect = lambda obj, _client: setattr(obj, 'Id', 'ITEM-42') or setattr(
            obj, 'SyncToken', '0'
        )

        service = QuickBooksService()
        with patch.object(service, '_get_mapping_service', return_value=None):
            result = service.sync_part(self.part)

        self.assertIsNotNone(result)
        mapping = QBOMapping.objects.get(
            content_type=ContentType.objects.get_for_model(self.part),
            object_id=self.part.id,
        )
        self.assertEqual(mapping.qbo_id, 'ITEM-42')
        self.assertEqual(mapping.status, 'synced')
        self.assertEqual(qb_item.Type, 'NonInventory')
        self.assertEqual(qb_item.Sku, 'OIL-001')


class Phase4AttachmentSyncTests(TestCase):
    @patch('apps.quickbooks_online.attachment_sync.Attachable')
    @patch('apps.quickbooks_online.attachment_sync.AttachableRef')
    @patch('apps.quickbooks_online.attachment_sync.Ref')
    @patch('apps.quickbooks_online.attachment_sync._pdf_bytes_for_invoice')
    def test_sync_invoice_attachment_uploads_pdf(
        self,
        mock_pdf,
        mock_ref,
        mock_attachable_ref,
        mock_attachable_cls,
    ):
        mock_pdf.return_value = (b'%PDF-1.4', 'invoice_INV-1.pdf')
        mock_ref.return_value = MagicMock()
        mock_attachable_ref.return_value = MagicMock()
        attachable = MagicMock()
        mock_attachable_cls.return_value = attachable

        service = MagicMock()
        service.get_client.return_value = MagicMock()
        invoice = MagicMock()
        invoice.invoice_number = 'INV-1'

        from apps.quickbooks_online.attachment_sync import sync_invoice_attachment

        sync_invoice_attachment(service, invoice, 'QBO-INV-1')

        self.assertEqual(attachable.FileName, 'invoice_INV-1.pdf')
        self.assertEqual(attachable.ContentType, 'application/pdf')
        self.assertEqual(attachable._FileBytes, b'%PDF-1.4')
        attachable.save.assert_called_once()
