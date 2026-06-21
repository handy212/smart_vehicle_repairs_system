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
from apps.quickbooks_online.sync_policy import outbound_eligibility_reason
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
        PaymentAllocation.objects.filter(payment=payment, invoice=invoice_a).update(
            amount=Decimal('60.00'),
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

    def test_allocations_take_precedence_over_deposit_primary_invoice(self):
        """Multi-invoice allocations sync even when payment.invoice is deposit-stage."""
        proforma = self._invoice(status='proforma')
        finalized = self._invoice(status='sent')
        payment = self._payment(proforma, amount=Decimal('50.00'))
        PaymentAllocation.objects.filter(payment=payment, invoice=proforma).delete()
        PaymentAllocation.objects.create(
            payment=payment,
            invoice=finalized,
            amount=Decimal('50.00'),
            allocated_by=self.admin,
        )
        QBOMapping.objects.create(
            content_type=ContentType.objects.get_for_model(finalized),
            object_id=finalized.id,
            qbo_id='INV-FINAL',
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
        self.assertEqual(lines[0].LinkedTxn[0].TxnId, 'INV-FINAL')


class DepositStageInvoicePolicyTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='deposit-policy@test.com',
            username='deposit_policy_admin',
            password='password',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN-DEP', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='deposit-policy-cust',
            email='deposit-policy-cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-DEP')

    def test_proforma_invoice_not_outbound_eligible(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='proforma',
            total=Decimal('100.00'),
            amount_due=Decimal('100.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        eligible, reason = outbound_eligibility_reason('invoice', invoice)
        self.assertFalse(eligible)
        self.assertIn('deposit', reason.lower())

    def test_pro_numbered_partial_invoice_not_outbound_eligible(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='partial',
            total=Decimal('100.00'),
            amount_due=Decimal('50.00'),
            amount_paid=Decimal('50.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        invoice.invoice_number = f'{self.branch.code}-PRO000042'
        eligible, reason = outbound_eligibility_reason('invoice', invoice)
        self.assertFalse(eligible)
        self.assertIn('deposit', reason.lower())


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

    @patch('apps.quickbooks_online.account_requirements.validate_inventory_part_account_ids', return_value=None)
    @patch.object(QuickBooksService, 'get_client')
    @patch.object(QuickBooksService, '_save_qb')
    @patch('apps.quickbooks_online.item_sync.QBItem')
    @patch('apps.quickbooks_online.item_sync.Ref')
    def test_sync_part_creates_qbo_mapping(
        self, mock_ref, mock_qb_item_cls, mock_save, mock_client, _mock_validate
    ):
        mock_client.return_value = MagicMock()
        income_ref = MagicMock()
        expense_ref = MagicMock()
        asset_ref = MagicMock()
        mock_ref.side_effect = [income_ref, expense_ref, asset_ref]
        qb_item = MagicMock()
        qb_item.Id = '42'
        qb_item.SyncToken = '0'
        mock_qb_item_cls.return_value = qb_item
        mock_qb_item_cls.__name__ = 'Item'
        mock_save.side_effect = lambda obj, _client: setattr(obj, 'Id', '42') or setattr(
            obj, 'SyncToken', '0'
        )

        service = QuickBooksService()
        mock_mapping = MagicMock()
        mock_mapping.resolve_control_account_qbo_id.side_effect = lambda key: {
            'sales_revenue_account': 'INC-1',
            'default_expense_account': 'EXP-1',
            'cost_of_goods_sold_account': 'COGS-1',
            'inventory_asset_account': 'ASSET-1',
        }.get(key)
        with patch.object(service, '_get_mapping_service', return_value=mock_mapping):
            result = service.sync_part(self.part)

        self.assertIsNotNone(result)
        mapping = QBOMapping.objects.get(
            content_type=ContentType.objects.get_for_model(self.part),
            object_id=self.part.id,
        )
        self.assertEqual(mapping.qbo_id, '42')
        self.assertEqual(mapping.status, 'synced')
        self.assertEqual(qb_item.Type, 'Inventory')
        self.assertEqual(qb_item.Sku, 'OIL-001')
        self.assertEqual(qb_item.IncomeAccountRef, income_ref)
        self.assertEqual(qb_item.ExpenseAccountRef, expense_ref)
        self.assertEqual(qb_item.AssetAccountRef, asset_ref)
        self.assertEqual(income_ref.value, 'INC-1')
        self.assertEqual(expense_ref.value, 'COGS-1')
        self.assertEqual(asset_ref.value, 'ASSET-1')
        self.assertEqual(qb_item.QtyOnHand, 0.0)
        self.assertTrue(qb_item.TrackQtyOnHand)

    @patch('apps.quickbooks_online.account_requirements.validate_inventory_part_account_ids', return_value=None)
    @patch.object(QuickBooksService, 'get_client')
    @patch.object(QuickBooksService, '_save_qb')
    @patch('apps.quickbooks_online.item_sync.QBItem')
    @patch('apps.quickbooks_online.item_sync.Ref')
    def test_sync_part_converts_non_inventory_qbo_item(
        self, mock_ref, mock_qb_item_cls, mock_save, mock_client, _mock_validate
    ):
        mock_client.return_value = MagicMock()
        income_ref = MagicMock()
        expense_ref = MagicMock()
        asset_ref = MagicMock()
        mock_ref.side_effect = [income_ref, expense_ref, asset_ref]

        existing_qb_item = MagicMock()
        existing_qb_item.Id = '99'
        existing_qb_item.SyncToken = '2'
        existing_qb_item.Type = 'NonInventory'
        mock_qb_item_cls.get.return_value = existing_qb_item
        mock_qb_item_cls.__name__ = 'Item'
        mock_save.side_effect = lambda obj, _client: obj

        QBOMapping.objects.create(
            content_type=ContentType.objects.get_for_model(self.part),
            object_id=self.part.id,
            qbo_id='99',
            status='synced',
        )

        service = QuickBooksService()
        mock_mapping = MagicMock()
        mock_mapping.resolve_control_account_qbo_id.side_effect = lambda key: {
            'sales_revenue_account': 'INC-1',
            'cost_of_goods_sold_account': 'COGS-1',
            'inventory_asset_account': 'ASSET-1',
        }.get(key)
        with patch.object(service, '_get_mapping_service', return_value=mock_mapping):
            result = service.sync_part(self.part)

        self.assertIsNotNone(result)
        self.assertEqual(existing_qb_item.Type, 'Inventory')
        self.assertTrue(existing_qb_item.TrackQtyOnHand)
        self.assertIsNotNone(existing_qb_item.InvStartDate)
        self.assertEqual(
            existing_qb_item.InvStartDate,
            timezone.now().date().isoformat(),
        )

    @patch('apps.quickbooks_online.account_requirements.validate_inventory_part_account_ids', return_value=None)
    @patch.object(QuickBooksService, 'get_client')
    @patch.object(QuickBooksService, '_save_qb')
    @patch('apps.quickbooks_online.item_sync.QBItem')
    @patch('apps.quickbooks_online.item_sync.Ref')
    def test_sync_part_skips_inv_start_date_when_already_inventory(
        self, mock_ref, mock_qb_item_cls, mock_save, mock_client, _mock_validate
    ):
        mock_client.return_value = MagicMock()
        mock_ref.side_effect = [MagicMock(), MagicMock(), MagicMock()]

        existing_qb_item = MagicMock()
        existing_qb_item.Id = '100'
        existing_qb_item.SyncToken = '3'
        existing_qb_item.Type = 'Inventory'
        existing_qb_item.InvStartDate = '2024-01-01'
        mock_qb_item_cls.get.return_value = existing_qb_item
        mock_qb_item_cls.__name__ = 'Item'
        mock_save.side_effect = lambda obj, _client: obj

        QBOMapping.objects.create(
            content_type=ContentType.objects.get_for_model(self.part),
            object_id=self.part.id,
            qbo_id='100',
            status='synced',
        )

        service = QuickBooksService()
        mock_mapping = MagicMock()
        mock_mapping.resolve_control_account_qbo_id.side_effect = lambda key: {
            'sales_revenue_account': 'INC-1',
            'cost_of_goods_sold_account': 'COGS-1',
            'inventory_asset_account': 'ASSET-1',
        }.get(key)
        with patch.object(service, '_get_mapping_service', return_value=mock_mapping):
            result = service.sync_part(self.part)

        self.assertIsNotNone(result)
        self.assertEqual(existing_qb_item.InvStartDate, '2024-01-01')

    @patch.object(QuickBooksService, 'get_client')
    @patch('apps.quickbooks_online.item_sync.QBItem')
    def test_sync_part_fails_without_account_mappings(self, mock_qb_item_cls, mock_client):
        mock_client.return_value = MagicMock()
        mock_qb_item_cls.return_value = MagicMock()

        service = QuickBooksService()
        mock_mapping = MagicMock()
        mock_mapping.resolve_control_account_qbo_id.return_value = None
        mock_mapping.resolve_invoice_line_item_id.return_value = None

        with patch.object(service, '_get_mapping_service', return_value=mock_mapping):
            result = service.sync_part(self.part)

        self.assertIsNone(result)
        mapping = QBOMapping.objects.get(
            content_type=ContentType.objects.get_for_model(self.part),
            object_id=self.part.id,
        )
        self.assertEqual(mapping.status, 'failed')
        self.assertIn('Sales Revenue', mapping.error_message)


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


class Phase4PartSerializerTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='phase4-ser@test.com',
            username='phase4_ser_admin',
            password='password',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN-P4SER', created_by=self.admin)
        self.category = PartCategory.objects.create(name='Filters')
        self.part = Part.objects.create(
            part_number='FIL-001',
            name='Air Filter',
            category=self.category,
            branch=self.branch,
            cost_price=Decimal('8.00'),
            selling_price=Decimal('15.00'),
            created_by=self.admin,
        )

    @patch.object(QuickBooksService, 'is_connected', return_value=True)
    def test_part_detail_serializer_includes_qbo_fields(self, _mock_connected):
        from apps.inventory.serializers import PartDetailSerializer

        QBOMapping.objects.create(
            content_type=ContentType.objects.get_for_model(self.part),
            object_id=self.part.id,
            qbo_id='ITEM-1',
            status='synced',
        )
        data = PartDetailSerializer(self.part).data
        self.assertEqual(data['qbo_sync_status'], 'synced')

    @patch.object(QuickBooksService, 'is_connected', return_value=False)
    def test_part_detail_serializer_hides_qbo_fields_when_disconnected(self, _mock_connected):
        from apps.inventory.serializers import PartDetailSerializer

        data = PartDetailSerializer(self.part).data
        self.assertNotIn('qbo_sync_status', data)
        self.assertNotIn('qbo_sync_error', data)


class InvoiceFinalizationChainTests(TestCase):
    @patch('apps.quickbooks_online.tasks.run_outbound_entity_sync')
    def test_finalize_syncs_invoice_before_payments(self, mock_run):
        from apps.quickbooks_online.tasks import task_sync_invoice_then_resync_payments

        mock_run.side_effect = [MagicMock(Id='INV-1'), MagicMock(Id='PAY-1'), MagicMock(Id='PAY-2')]

        invoice = MagicMock()
        invoice.payments.filter.return_value.values_list.return_value = [10, 11]
        with patch('apps.billing.models.Invoice') as mock_invoice_model:
            mock_invoice_model.objects.get.return_value = invoice
            task_sync_invoice_then_resync_payments(5)

        self.assertEqual(mock_run.call_count, 3)
        self.assertEqual(mock_run.call_args_list[0][0][0], 'invoice')
        self.assertEqual(mock_run.call_args_list[1][0][0], 'payment')
        self.assertEqual(mock_run.call_args_list[2][0][0], 'payment')

    @patch('apps.quickbooks_online.tasks.run_outbound_entity_sync', return_value=None)
    def test_finalize_skips_payments_when_invoice_sync_fails(self, mock_run):
        from apps.quickbooks_online.tasks import task_sync_invoice_then_resync_payments

        task_sync_invoice_then_resync_payments(5)
        mock_run.assert_called_once()
