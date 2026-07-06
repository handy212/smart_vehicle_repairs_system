"""Regression tests for accounting audit remediation (Wave 6)."""
from datetime import datetime, timedelta
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from apps.accounting.models import AccountingControl, JournalEntry, Transaction
from apps.accounting.services import AccountingService
from apps.accounts.models import User
from apps.billing.balance_utils import operational_collection_balances
from apps.billing.models import Bill, Invoice, Payment
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inventory.models import Supplier


class Wave6RemediationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='wave6_admin',
            email='wave6@example.com',
            password='password',
            role='admin',
        )
        self.branch = Branch.objects.create(
            name='Wave 6 Branch',
            code='HQ',
            phone='555-7000',
            address='7 Wave St',
            city='Wave',
            state='WV',
            zip_code='70007',
            created_by=self.user,
        )
        customer_user = User.objects.create_user(
            username='wave6_customer',
            email='wave6cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-W6')
        self.vendor = Supplier.objects.create(name='Wave Vendor', supplier_code='W6-SUP')
        self._wire_accounting_controls()

    def _wire_accounting_controls(self):
        controls = AccountingControl.get_settings()
        for field_name in AccountingControl.ACCOUNT_FIELD_NAMES:
            code = field_name.replace('_account', '').replace('_', '-')[:12]
            account_type = 'asset'
            balance_type = 'debit'
            if 'payable' in field_name or 'prepayment' in field_name or 'tax_payable' in field_name:
                account_type = 'liability'
                balance_type = 'credit'
            elif 'revenue' in field_name or 'returns' in field_name:
                account_type = 'income'
                balance_type = 'credit' if 'revenue' in field_name else 'debit'
            elif 'expense' in field_name or 'cogs' in field_name or 'cash_over' in field_name:
                account_type = 'expense'
                balance_type = 'debit'
            elif field_name == 'purchase_returns_account':
                account_type = 'expense'
                balance_type = 'credit'
            setattr(
                controls,
                field_name,
                AccountingService.get_or_create_account(
                    f'6{AccountingControl.ACCOUNT_FIELD_NAMES.index(field_name):03d}',
                    field_name,
                    account_type,
                    balance_type,
                ),
            )
        bank = controls.default_bank_account
        bank.account_subtype = 'bank'
        bank.save(update_fields=['account_subtype'])
        controls.save()
        self.ar_account = controls.accounts_receivable_account
        self.prepayment_account = controls.customer_prepayment_account
        self.bank_account = controls.default_bank_account

    def test_operational_collection_balances_caps_overpayment(self):
        amount_paid, amount_due = operational_collection_balances(
            Decimal('100.00'),
            Decimal('130.00'),
        )
        self.assertEqual(amount_paid, Decimal('100.00'))
        self.assertEqual(amount_due, Decimal('0.00'))

    def test_invoice_overpayment_never_negative_amount_due(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            subtotal=Decimal('80.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('80.00'),
            amount_due=Decimal('80.00'),
            created_by=self.user,
        )
        Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            amount=Decimal('100.00'),
            status='completed',
            processed_by=self.user,
            bank_account=self.bank_account,
        )
        invoice.refresh_from_db()
        self.assertEqual(invoice.amount_paid, Decimal('80.00'))
        self.assertEqual(invoice.amount_due, Decimal('0.00'))
        self.assertGreaterEqual(invoice.amount_due, Decimal('0'))

    def test_validate_accounting_integrity_detects_negative_invoice_balance(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            subtotal=Decimal('50.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('50.00'),
            amount_paid=Decimal('50.00'),
            amount_due=Decimal('0.00'),
            created_by=self.user,
        )
        Invoice.objects.filter(pk=invoice.pk).update(amount_due=Decimal('-5.00'))

        with self.assertRaises(CommandError):
            call_command(
                'validate_accounting_integrity',
                settings='config.settings.testing',
            )

    def test_validate_accounting_integrity_detects_duplicate_reference(self):
        account = self.ar_account
        for _ in range(2):
            entry = JournalEntry.objects.create(
                date=timezone.now().date(),
                description='Duplicate ref test',
                reference='DUP-REF-W6',
                posted=True,
                created_by=self.user,
                branch=self.branch,
            )
            Transaction.objects.create(
                journal_entry=entry,
                account=account,
                transaction_type='debit',
                amount=Decimal('10.00'),
                description='debit',
            )
            Transaction.objects.create(
                journal_entry=entry,
                account=self.prepayment_account,
                transaction_type='credit',
                amount=Decimal('10.00'),
                description='credit',
            )

        with self.assertRaises(CommandError):
            call_command(
                'validate_accounting_integrity',
                settings='config.settings.testing',
            )

    def test_validate_accounting_integrity_detects_orphan_journal_entry(self):
        JournalEntry.objects.create(
            date=timezone.now().date(),
            description='Orphan JE',
            reference='ORPHAN-W6',
            posted=True,
            created_by=self.user,
            branch=self.branch,
        )
        with self.assertRaises(CommandError):
            call_command(
                'validate_accounting_integrity',
                settings='config.settings.testing',
            )

    def test_legacy_payments_rollup_instead_of_per_record_noise(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            subtotal=Decimal('25.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('25.00'),
            amount_due=Decimal('25.00'),
            created_by=self.user,
        )
        payment = Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            amount=Decimal('25.00'),
            status='pending',
            processed_by=self.user,
        )
        Payment.objects.filter(pk=payment.pk).update(
            created_at=timezone.make_aware(datetime(2020, 1, 1)),
            status='completed',
        )

        stdout = StringIO()
        call_command(
            'validate_accounting_integrity',
            stdout=stdout,
            settlement_since='2026-06-09',
            no_fail=True,
            settings='config.settings.testing',
        )
        output = stdout.getvalue()
        self.assertIn('legacy_customer_payment_bank_unverified', output)
        self.assertNotIn('bank_payment_missing_account', output)

    def test_validate_accounting_integrity_detects_unposted_locked_period_entry(self):
        locked_date = timezone.now().date()
        entry_date = locked_date - timedelta(days=3)
        JournalEntry.objects.create(
            date=entry_date,
            description='Locked period draft',
            reference='LOCK-W6',
            posted=False,
            created_by=self.user,
            branch=self.branch,
        )
        controls = AccountingControl.get_settings()
        controls.period_lock_date = locked_date
        controls.save(update_fields=['period_lock_date'])

        with self.assertRaises(CommandError):
            call_command(
                'validate_accounting_integrity',
                settings='config.settings.testing',
            )

    def test_validate_accounting_integrity_passes_on_clean_data(self):
        stdout = StringIO()
        call_command(
            'validate_accounting_integrity',
            stdout=stdout,
            settings='config.settings.testing',
        )
        self.assertIn('PASS', stdout.getvalue().upper())

    def test_bill_operational_balance_never_negative(self):
        bill = Bill.objects.create(
            vendor=self.vendor,
            branch=self.branch,
            due_date=timezone.now().date(),
            status='open',
            subtotal=Decimal('60.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('60.00'),
            amount_paid=Decimal('75.00'),
            created_by=self.user,
        )
        bill.refresh_from_db()
        self.assertEqual(bill.amount_paid, Decimal('60.00'))
        self.assertEqual(bill.amount_due, Decimal('0.00'))
