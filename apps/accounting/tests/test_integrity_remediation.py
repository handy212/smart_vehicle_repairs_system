"""Tests for production accounting integrity remediation commands."""
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.accounting.models import AccountingControl, Account, JournalEntry, Transaction
from apps.accounting.services import AccountingService
from apps.accounts.models import User
from apps.billing.models import Invoice, Payment
from apps.branches.models import Branch
from apps.customers.models import Customer


class IntegrityRemediationCommandTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='remediation_admin',
            email='remediation@example.com',
            password='password',
            role='admin',
        )
        self.branch = Branch.objects.create(
            name='Remediation Branch',
            code='RB',
            phone='555-9000',
            address='9 Remediation St',
            city='Rem',
            state='RM',
            zip_code='90009',
            created_by=self.user,
        )
        customer_user = User.objects.create_user(
            username='remediation_customer',
            email='remediationcust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-REM')

    def test_wire_accounting_controls_configures_missing_fields(self):
        controls = AccountingControl.get_settings()
        for field_name in AccountingControl.ACCOUNT_FIELD_NAMES:
            setattr(controls, field_name, None)
        controls.save()

        stdout = StringIO()
        call_command('wire_accounting_controls', stdout=stdout, settings='config.settings.testing')

        controls.refresh_from_db()
        for field_name in AccountingControl.ACCOUNT_FIELD_NAMES:
            account = getattr(controls, field_name)
            self.assertIsNotNone(account, field_name)
            self.assertTrue(account.is_active, field_name)
            self.assertFalse(account.children.exists(), field_name)

    def test_repair_settlement_accounts_backfills_missing_bank_account(self):
        call_command('wire_accounting_controls', settings='config.settings.testing')
        controls = AccountingControl.get_settings()

        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            subtotal=Decimal('50.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('50.00'),
            amount_due=Decimal('50.00'),
            created_by=self.user,
        )
        payment = Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            amount=Decimal('50.00'),
            status='pending',
            processed_by=self.user,
        )
        Payment.objects.filter(pk=payment.pk).update(status='completed')
        payment.refresh_from_db()
        self.assertIsNone(payment.bank_account_id)

        call_command('repair_settlement_accounts', settings='config.settings.testing')
        payment.refresh_from_db()
        self.assertEqual(payment.bank_account_id, controls.default_bank_account_id)

    def test_repair_settlement_accounts_replaces_invalid_bank_account(self):
        call_command('wire_accounting_controls', settings='config.settings.testing')
        controls = AccountingControl.get_settings()
        invalid_bank = Account.objects.get(code='5000')

        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            subtotal=Decimal('75.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('75.00'),
            amount_due=Decimal('75.00'),
            created_by=self.user,
        )
        payment = Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            amount=Decimal('75.00'),
            status='pending',
            bank_account=invalid_bank,
            processed_by=self.user,
        )
        Payment.objects.filter(pk=payment.pk).update(status='completed')

        call_command('repair_settlement_accounts', settings='config.settings.testing')
        payment.refresh_from_db()
        self.assertEqual(payment.bank_account_id, controls.default_bank_account_id)

    def test_repair_parent_journal_lines_remaps_parent_account(self):
        call_command('wire_accounting_controls', settings='config.settings.testing')
        parent = Account.objects.get(code='1000')
        leaf = Account.objects.get(code='1100')

        entry = JournalEntry.objects.create(
            date=timezone.now().date(),
            description='Parent account posting',
            reference='REM-PARENT-1',
            posted=True,
            created_by=self.user,
            branch=self.branch,
        )
        entry._allow_initial_posted_lines = True
        line = Transaction(
            journal_entry=entry,
            account=parent,
            amount=Decimal('10.00'),
            transaction_type='debit',
            description='Parent line',
        )
        line._allow_posted_edit = True
        line.save()
        credit = Transaction(
            journal_entry=entry,
            account=AccountingControl.get_settings().sales_revenue_account,
            amount=Decimal('10.00'),
            transaction_type='credit',
            description='Offset',
        )
        credit._allow_posted_edit = True
        credit.save()

        call_command('repair_parent_journal_lines', settings='config.settings.testing')
        line.refresh_from_db()
        self.assertEqual(line.account_id, leaf.id)

    def test_repair_duplicate_journal_entries_reverses_extra_postings(self):
        call_command('wire_accounting_controls', settings='config.settings.testing')
        revenue = AccountingControl.get_settings().sales_revenue_account
        bank = AccountingControl.get_settings().default_bank_account

        for index in range(2):
            entry = JournalEntry.objects.create(
                date=timezone.now().date(),
                description=f'Duplicate demo entry {index}',
                reference='CDINV00099',
                posted=True,
                created_by=self.user,
                branch=self.branch,
            )
            entry._allow_initial_posted_lines = True
            debit = Transaction(
                journal_entry=entry,
                account=bank,
                amount=Decimal('20.00'),
                transaction_type='debit',
                description='Cash',
            )
            debit._allow_posted_edit = True
            debit.save()
            credit = Transaction(
                journal_entry=entry,
                account=revenue,
                amount=Decimal('20.00'),
                transaction_type='credit',
                description='Revenue',
            )
            credit._allow_posted_edit = True
            credit.save()

        stdout = StringIO()
        call_command(
            'repair_duplicate_journal_entries',
            reference_prefix='CDINV',
            username='remediation_admin',
            stdout=stdout,
            settings='config.settings.testing',
        )
        self.assertIn('Reversed 1 duplicate', stdout.getvalue())
        self.assertEqual(
            JournalEntry.objects.filter(posted=True, reference='CDINV00099').count(),
            1,
        )
        self.assertTrue(
            JournalEntry.objects.filter(reference__startswith='REV-JE-').exists()
        )
