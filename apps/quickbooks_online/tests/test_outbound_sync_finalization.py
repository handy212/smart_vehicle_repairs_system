"""Tests for outbound sync mapping finalization and batch bill-payment behavior."""
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.billing.models import Bill, BillLineItem, BillPayment
from apps.branches.models import Branch
from apps.inventory.models import Supplier
from apps.quickbooks_online.models import QBOMapping
from apps.quickbooks_online.outbound_log import (
    finalize_mapping_after_failed_sync,
    run_outbound_entity_sync,
)
from apps.quickbooks_online.services import QuickBooksService
from apps.quickbooks_online.sync_guard import mark_mapping_pending

User = get_user_model()


class FinalizeMappingAfterFailedSyncTests(TestCase):
    def test_marks_stuck_pending_as_failed(self):
        supplier = Supplier.objects.create(
            name='Pending Vendor',
            supplier_code='PV001',
        )
        mark_mapping_pending(supplier)

        finalize_mapping_after_failed_sync(supplier, 'Sync returned no result from QuickBooks.')

        mapping = QBOMapping.objects.get(
            content_type=ContentType.objects.get_for_model(supplier),
            object_id=supplier.id,
        )
        self.assertEqual(mapping.status, 'failed')
        self.assertIn('no result', mapping.error_message)

    def test_does_not_overwrite_synced_mapping(self):
        supplier = Supplier.objects.create(
            name='Synced Vendor',
            supplier_code='SV001',
        )
        ct = ContentType.objects.get_for_model(supplier)
        QBOMapping.objects.create(
            content_type=ct,
            object_id=supplier.id,
            status='synced',
            qbo_id='123',
        )

        finalize_mapping_after_failed_sync(supplier, 'Should not apply')

        mapping = QBOMapping.objects.get(content_type=ct, object_id=supplier.id)
        self.assertEqual(mapping.status, 'synced')
        self.assertEqual(mapping.qbo_id, '123')


@override_settings(QUICKBOOKS_AUTO_SYNC_ENABLED=False)
class RunOutboundEntitySyncFinalizationTests(TestCase):
    @patch('apps.quickbooks_online.sync_guard.outbound_sync_lock')
    def test_exception_marks_mapping_failed(self, mock_lock):
        mock_lock.return_value.__enter__.return_value = True
        supplier = Supplier.objects.create(
            name='Exception Vendor',
            supplier_code='EV001',
        )

        with patch(
            'apps.quickbooks_online.sync_policy.outbound_eligibility_reason',
            return_value=(True, ''),
        ), patch.object(QuickBooksService, 'sync_supplier', side_effect=RuntimeError('QBO timeout')):
            result = run_outbound_entity_sync(
                'supplier',
                supplier.id,
                'inventory',
                'Supplier',
                'sync_supplier',
            )

        self.assertIsNone(result)
        mapping = QBOMapping.objects.get(
            content_type=ContentType.objects.get_for_model(supplier),
            object_id=supplier.id,
        )
        self.assertEqual(mapping.status, 'failed')
        self.assertIn('QBO timeout', mapping.error_message)

    @patch('apps.quickbooks_online.sync_guard.outbound_sync_lock')
    def test_none_result_marks_mapping_failed(self, mock_lock):
        mock_lock.return_value.__enter__.return_value = True
        supplier = Supplier.objects.create(
            name='None Result Vendor',
            supplier_code='NR001',
        )

        with patch(
            'apps.quickbooks_online.sync_policy.outbound_eligibility_reason',
            return_value=(True, ''),
        ), patch.object(QuickBooksService, 'sync_supplier', return_value=None):
            result = run_outbound_entity_sync(
                'supplier',
                supplier.id,
                'inventory',
                'Supplier',
                'sync_supplier',
            )

        self.assertIsNone(result)
        mapping = QBOMapping.objects.get(
            content_type=ContentType.objects.get_for_model(supplier),
            object_id=supplier.id,
        )
        self.assertEqual(mapping.status, 'failed')


class BillPaymentBatchSyncTests(TestCase):
    def setUp(self):
        from apps.accounting.models import AccountingControl
        from apps.accounting.services import AccountingService

        self.user = User.objects.create_superuser(
            username='qbo_bp',
            password='password123',
            email='qbo_bp@test.example.com',
            role='super-admin',
        )
        self.branch = Branch.objects.create(
            name='QBO Branch',
            code='QBOB',
            is_active=True,
            created_by=self.user,
        )
        self.vendor = Supplier.objects.create(name='Batch Vendor', supplier_code='BV001')
        self._wire_accounting_controls()
        self.bank_account = AccountingControl.get_settings().default_bank_account

    def _wire_accounting_controls(self):
        from apps.accounting.models import AccountingControl
        from apps.accounting.services import AccountingService

        controls = AccountingControl.get_settings()
        controls.accounts_receivable_account = AccountingService.get_or_create_account(
            '1200', 'Accounts Receivable', 'asset', 'debit'
        )
        controls.accounts_payable_account = AccountingService.get_or_create_account(
            '2000', 'Accounts Payable', 'liability', 'credit'
        )
        controls.sales_revenue_account = AccountingService.get_or_create_account(
            '4000', 'Sales Revenue', 'income', 'credit'
        )
        controls.sales_discount_account = AccountingService.get_or_create_account(
            '4100', 'Sales Returns', 'income', 'debit'
        )
        controls.sales_tax_payable_account = AccountingService.get_or_create_account(
            '2100', 'Sales Tax Payable', 'liability', 'credit'
        )
        controls.default_expense_account = AccountingService.get_or_create_account(
            '5000', 'Operating Expense', 'expense', 'debit'
        )
        controls.input_tax_account = AccountingService.get_or_create_account(
            '2200', 'Input Tax', 'asset', 'debit'
        )
        controls.inventory_asset_account = AccountingService.get_or_create_account(
            '1500', 'Inventory Asset', 'asset', 'debit'
        )
        bank = AccountingService.get_or_create_account('1100', 'Operating Bank', 'asset', 'debit')
        bank.account_subtype = 'bank'
        bank.save(update_fields=['account_subtype'])
        controls.default_bank_account = bank
        controls.shop_supplies_revenue_account = controls.sales_revenue_account
        controls.environmental_fee_revenue_account = controls.sales_revenue_account
        controls.cost_of_goods_sold_account = controls.default_expense_account
        controls.cash_over_short_account = controls.default_expense_account
        controls.till_counterparty_cash_account = bank
        controls.save()

    def _open_bill(self, number_suffix: str, total: str):
        bill = Bill.objects.create(
            vendor=self.vendor,
            branch=self.branch,
            bill_date=timezone.now().date(),
            due_date=timezone.now().date(),
            status='open',
            created_by=self.user,
        )
        BillLineItem.objects.create(
            bill=bill,
            description=f'Line {number_suffix}',
            quantity=Decimal('1'),
            unit_price=Decimal(total),
        )
        return bill

    @patch('apps.quickbooks_online.services.QuickBooksService.sync_bill_payment_batch')
    def test_non_leader_delegates_to_leader(self, mock_batch):
        from apps.quickbooks_online.services import QuickBooksService

        mock_batch.return_value = MagicMock(Id='99')
        bill1 = self._open_bill('1', '100.00')
        bill2 = self._open_bill('2', '50.00')
        batch_id = 'paybatch-test-1'
        BillPayment.objects.create(
            bill=bill1,
            amount=Decimal('100.00'),
            payment_method='check',
            payment_batch=batch_id,
            paid_by=self.user,
            bank_account=self.bank_account,
        )
        follower = BillPayment.objects.create(
            bill=bill2,
            amount=Decimal('50.00'),
            payment_method='check',
            payment_batch=batch_id,
            paid_by=self.user,
            bank_account=self.bank_account,
        )

        service = QuickBooksService()
        service.sync_bill_payment(follower)

        mock_batch.assert_called_once_with(batch_id)
