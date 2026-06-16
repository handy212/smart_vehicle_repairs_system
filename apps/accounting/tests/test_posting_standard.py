"""
Conformance tests for docs/ACCOUNTING-POSTING-STANDARD.md (§17).

Each test maps to a posting pattern defined in the authoritative standard.
"""
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from django.utils import timezone

from apps.accounting.models import AccountingControl, JournalEntry
from apps.accounting.services import AccountingService
from apps.accounts.models import User
from apps.billing.models import (
    CreditNote,
    CreditNoteApplication,
    CreditNoteLineItem,
    Invoice,
    Payment,
)
from apps.branches.models import Branch
from apps.customers.models import Customer


class PostingStandardTests(TestCase):
    """Verify automated GL paths match the posting standard."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='posting_std_admin',
            email='posting@example.com',
            password='password',
            role='admin',
        )
        self.branch = Branch.objects.create(
            name='Posting Std Branch',
            code='PSB',
            phone='555-6000',
            address='6 Standard St',
            city='Std',
            state='ST',
            zip_code='60006',
            created_by=self.user,
        )
        customer_user = User.objects.create_user(
            username='posting_std_customer',
            email='postingcust@example.com',
            password='password',
            role='customer',
            first_name='Pat',
            last_name='Customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-PS')

        self.ar = AccountingService.get_or_create_account('1200', 'AR', 'asset', 'debit')
        self.revenue = AccountingService.get_or_create_account('4000', 'Revenue', 'income', 'credit')
        self.returns = AccountingService.get_or_create_account('4100', 'Returns', 'income', 'debit')
        self.tax = AccountingService.get_or_create_account('2100', 'Tax Payable', 'liability', 'credit')
        self.cogs = AccountingService.get_or_create_account('5100', 'COGS', 'expense', 'debit')
        self.inventory = AccountingService.get_or_create_account('1500', 'Inventory', 'asset', 'debit')
        self.bank = AccountingService.get_or_create_account('1100', 'Bank', 'asset', 'debit')
        self.bank.account_subtype = 'bank'
        self.bank.save(update_fields=['account_subtype'])
        self.prepay = AccountingService.get_or_create_account('2150', 'Prepayments', 'liability', 'credit')

        controls = AccountingControl.get_settings()
        controls.accounts_receivable_account = self.ar
        controls.sales_revenue_account = self.revenue
        controls.sales_discount_account = self.returns
        controls.sales_tax_payable_account = self.tax
        controls.cost_of_goods_sold_account = self.cogs
        controls.inventory_asset_account = self.inventory
        controls.customer_prepayment_account = self.prepay
        controls.default_bank_account = self.bank
        controls.shop_supplies_revenue_account = self.revenue
        controls.environmental_fee_revenue_account = self.revenue
        controls.save()

    def _balanced(self, entry):
        debits = sum(
            line.amount for line in entry.transactions.all() if line.transaction_type == 'debit'
        )
        credits = sum(
            line.amount for line in entry.transactions.all() if line.transaction_type == 'credit'
        )
        self.assertEqual(debits.quantize(Decimal('0.01')), credits.quantize(Decimal('0.01')))

    def test_section_1_invoice_entry_balances(self):
        """§1 Customer Invoice — Dr AR, Cr Revenue."""
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            invoice_number='INV-STD-001',
            status='sent',
            subtotal=Decimal('100.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('100.00'),
            amount_due=Decimal('100.00'),
            created_by=self.user,
        )
        invoice_type = ContentType.objects.get_for_model(invoice)
        entry = JournalEntry.objects.filter(
            content_type=invoice_type,
            object_id=invoice.id,
            reference=invoice.invoice_number,
        ).first()
        self.assertIsNotNone(entry)
        self._balanced(entry)
        self.assertTrue(
            entry.transactions.filter(account=self.ar, transaction_type='debit').exists()
        )
        self.assertTrue(
            entry.transactions.filter(account=self.revenue, transaction_type='credit').exists()
        )

    def test_section_2_overpayment_routes_to_prepayment(self):
        """§2 Customer Payment — excess credits customer prepayment liability."""
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            invoice_number='INV-STD-002',
            status='sent',
            subtotal=Decimal('50.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('50.00'),
            amount_due=Decimal('50.00'),
            created_by=self.user,
        )
        AccountingService.post_invoice(invoice)
        payment = Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            amount=Decimal('70.00'),
            status='completed',
            processed_by=self.user,
            bank_account=self.bank,
        )
        payment_type = ContentType.objects.get_for_model(payment)
        entry = JournalEntry.objects.filter(
            content_type=payment_type,
            object_id=payment.id,
        ).first()
        self.assertIsNotNone(entry)
        prepay_line = entry.transactions.filter(
            account=self.prepay, transaction_type='credit'
        ).first()
        self.assertIsNotNone(prepay_line)
        self.assertEqual(prepay_line.amount, Decimal('20.00'))

    def test_section_3_credit_note_gl_only_on_apply(self):
        """§3 Credit Note — GL posts on application, not issue."""
        credit_note = CreditNote.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='draft',
            created_by=self.user,
        )
        CreditNoteLineItem.objects.create(
            credit_note=credit_note,
            description='Return labor',
            quantity=Decimal('1'),
            unit_price=Decimal('40.00'),
            is_taxable=False,
        )
        credit_note.calculate_totals()
        credit_note.status = 'issued'
        credit_note.save()

        cn_type = ContentType.objects.get_for_model(credit_note)
        self.assertFalse(
            JournalEntry.objects.filter(content_type=cn_type, object_id=credit_note.id).exists()
        )

        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            invoice_number='INV-STD-003',
            status='sent',
            subtotal=Decimal('100.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('100.00'),
            amount_due=Decimal('100.00'),
            created_by=self.user,
        )
        application = CreditNoteApplication.objects.create(
            credit_note=credit_note,
            invoice=invoice,
            amount=Decimal('40.00'),
            applied_by=self.user,
        )
        entry = AccountingService.post_credit_note_application(application)
        self._balanced(entry)
        self.assertTrue(
            entry.transactions.filter(account=self.ar, transaction_type='credit').exists()
        )

    def test_section_3_deprecated_issue_posting_is_noop(self):
        """§3 — post_credit_note() must not create journal entries."""
        credit_note = CreditNote.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='issued',
            subtotal=Decimal('25.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('25.00'),
            created_by=self.user,
        )
        result = AccountingService.post_credit_note(credit_note)
        self.assertIsNone(result)
        cn_type = ContentType.objects.get_for_model(credit_note)
        self.assertFalse(
            JournalEntry.objects.filter(content_type=cn_type, object_id=credit_note.id).exists()
        )
