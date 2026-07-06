from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounting.models import AccountingControl
from apps.accounting.services import AccountingService
from apps.accounts.models import User
from apps.billing.models import Invoice, Payment
from apps.branches.models import Branch
from apps.customers.models import Customer


class CustomerBalanceSyncTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='cust-bal-admin',
            email='cust-bal@example.com',
            password='password',
            role='admin',
            first_name='Bal',
            last_name='Admin',
        )
        self.branch = Branch.objects.create(
            name='Balance Branch',
            code='BAL',
            phone='555-9100',
            address='9 Balance St',
            city='Bal',
            state='PA',
            zip_code='91009',
            created_by=self.user,
        )
        customer_user = User.objects.create_user(
            username='cust-bal-customer',
            email='custbal@example.com',
            password='password',
            role='customer',
            first_name='Casey',
            last_name='Customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-BAL')
        self.bank_account = AccountingService.get_or_create_account(
            '1100', 'Operating Bank', 'asset', 'debit'
        )
        self.bank_account.account_subtype = 'bank'
        self.bank_account.save(update_fields=['account_subtype'])
        controls = AccountingControl.get_settings()
        controls.accounts_receivable_account = AccountingService.get_or_create_account(
            '1200', 'Accounts Receivable', 'asset', 'debit'
        )
        controls.customer_prepayment_account = AccountingService.get_or_create_account(
            '2150', 'Customer Prepayments', 'liability', 'credit'
        )
        controls.default_bank_account = self.bank_account
        controls.save()

    def _create_invoice(self, total='500.00', status='sent'):
        return Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status=status,
            subtotal=Decimal(total),
            tax_amount=Decimal('0.00'),
            total=Decimal(total),
            amount_due=Decimal(total),
            invoice_date=timezone.now().date(),
            created_by=self.user,
        )

    def test_sent_invoice_updates_customer_open_balance(self):
        self.assertEqual(self.customer.current_balance, Decimal('0.00'))

        self._create_invoice('500.00')

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.current_balance, Decimal('500.00'))

    def test_payment_reduces_customer_open_balance(self):
        invoice = self._create_invoice('500.00')
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.current_balance, Decimal('500.00'))

        Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            amount=Decimal('500.00'),
            status='completed',
            processed_by=self.user,
            bank_account=self.bank_account,
        )

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.current_balance, Decimal('0.00'))

    def test_draft_invoice_does_not_affect_open_balance(self):
        self._create_invoice('750.00', status='draft')

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.current_balance, Decimal('0.00'))
