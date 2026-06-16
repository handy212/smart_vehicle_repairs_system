"""Regression tests for accounting audit remediation (Wave 5)."""
from decimal import Decimal
from io import StringIO

from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from apps.accounting.models import AccountingControl, JournalEntry
from apps.accounting.services import AccountingService
from apps.accounting.subledger_reconciliation import reconcile_subledgers
from apps.accounts.models import User
from apps.billing.models import (
    Bill,
    BillLineItem,
    CreditNote,
    Invoice,
    VendorCredit,
    VendorCreditApplication,
    VendorCreditLineItem,
)
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inventory.models import Supplier


class Wave5RemediationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='wave5_admin',
            email='wave5@example.com',
            password='password',
            role='admin',
            first_name='Wave',
            last_name='Five',
        )
        self.branch = Branch.objects.create(
            name='Wave 5 Branch',
            code='HQ',
            phone='555-6000',
            address='6 Wave St',
            city='Wave',
            state='WV',
            zip_code='60006',
            created_by=self.user,
        )
        self.vendor = Supplier.objects.create(
            name='Wave Supplier',
            supplier_code='WAVE5-SUP',
        )
        customer_user = User.objects.create_user(
            username='wave5_customer',
            email='wave5cust@example.com',
            password='password',
            role='customer',
            first_name='Casey',
            last_name='Buyer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-W5')
        self._wire_accounting_controls()

    def _wire_accounting_controls(self):
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
        controls.purchase_returns_account = AccountingService.get_or_create_account(
            '5050', 'Purchase Returns', 'expense', 'credit'
        )
        controls.input_tax_account = AccountingService.get_or_create_account(
            '2200', 'Input Tax', 'asset', 'debit'
        )
        controls.inventory_asset_account = AccountingService.get_or_create_account(
            '1500', 'Inventory Asset', 'asset', 'debit'
        )
        controls.cost_of_goods_sold_account = AccountingService.get_or_create_account(
            '5100', 'COGS', 'expense', 'debit'
        )
        controls.cash_over_short_account = AccountingService.get_or_create_account(
            '5950', 'Cash Over Short', 'expense', 'debit'
        )
        controls.till_counterparty_cash_account = AccountingService.get_or_create_account(
            '1010', 'Till Counterparty', 'asset', 'debit'
        )
        controls.default_bank_account = AccountingService.get_or_create_account(
            '1100', 'Operating Bank', 'asset', 'debit'
        )
        controls.customer_prepayment_account = AccountingService.get_or_create_account(
            '2150', 'Customer Prepayments', 'liability', 'credit'
        )
        controls.shop_supplies_revenue_account = controls.sales_revenue_account
        controls.environmental_fee_revenue_account = controls.sales_revenue_account
        controls.save()
        self.returns_account = controls.purchase_returns_account
        self.ap_account = controls.accounts_payable_account

    def _posted_invoice(self, total=Decimal('200.00')):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            invoice_number=f'INV-W5-{timezone.now().timestamp()}',
            status='sent',
            subtotal=total,
            tax_amount=Decimal('0.00'),
            total=total,
            amount_due=total,
            created_by=self.user,
        )
        AccountingService.post_invoice(invoice)
        return invoice

    def _open_bill(self, total=Decimal('200.00')):
        bill = Bill.objects.create(
            vendor=self.vendor,
            branch=self.branch,
            due_date=timezone.now().date(),
            status='open',
            subtotal=total,
            tax_amount=Decimal('0.00'),
            total=total,
            amount_due=total,
            created_by=self.user,
        )
        BillLineItem.objects.create(
            bill=bill,
            description='Vendor service',
            quantity=Decimal('1'),
            unit_price=total,
            is_taxable=False,
        )
        return bill

    def test_vendor_credit_uses_purchase_returns_account(self):
        bill = self._open_bill(total=Decimal('150.00'))
        AccountingService.post_bill(bill)

        vendor_credit = VendorCredit.objects.create(
            vendor=self.vendor,
            branch=self.branch,
            status='issued',
            subtotal=Decimal('60.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('60.00'),
            unused_amount=Decimal('60.00'),
            created_by=self.user,
        )
        VendorCreditLineItem.objects.create(
            vendor_credit=vendor_credit,
            description='Freight return',
            quantity=Decimal('1'),
            unit_price=Decimal('60.00'),
            is_taxable=False,
        )

        application = VendorCreditApplication.objects.create(
            vendor_credit=vendor_credit,
            bill=bill,
            amount=Decimal('60.00'),
            applied_by=self.user,
        )
        entry = AccountingService.post_vendor_credit_application(application)
        self.assertIsNotNone(entry)
        self.assertTrue(
            entry.transactions.filter(
                account=self.returns_account,
                transaction_type='credit',
                amount=Decimal('60.00'),
            ).exists()
        )

    def test_ar_subledger_includes_unapplied_customer_credit_notes(self):
        invoice = self._posted_invoice(total=Decimal('300.00'))
        self.assertTrue(
            reconcile_subledgers(branch_id=self.branch.id)['accounts_receivable']['in_balance']
        )

        credit_note = CreditNote.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='issued',
            subtotal=Decimal('45.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('45.00'),
            unused_amount=Decimal('45.00'),
            created_by=self.user,
        )

        report = reconcile_subledgers(branch_id=self.branch.id)
        ar = report['accounts_receivable']
        self.assertEqual(ar['unapplied_customer_credit_notes'], 45.0)
        self.assertIn('subledger_net_of_credits', ar)
        self.assertEqual(ar['subledger_net_of_credits'], float(invoice.amount_due) - 45.0)

    def test_validate_accounting_integrity_flags_subledger_drift(self):
        invoice = self._posted_invoice(total=Decimal('120.00'))
        Invoice.objects.filter(pk=invoice.pk).update(amount_due=Decimal('40.00'))

        stdout = StringIO()
        with self.assertRaises(CommandError):
            call_command(
                'validate_accounting_integrity',
                stdout=stdout,
                settings='config.settings.testing',
            )

    def test_purchase_returns_account_in_control_fields(self):
        controls = AccountingControl.get_settings()
        self.assertIn('purchase_returns_account', AccountingControl.ACCOUNT_FIELD_NAMES)
        self.assertEqual(controls.purchase_returns_account_id, self.returns_account.id)
