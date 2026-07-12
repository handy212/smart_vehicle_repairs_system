from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounting.models import AccountingControl
from apps.accounting.services import AccountingService
from apps.accounts.models import User
from apps.billing.balance_utils import (
    payment_allocated_total,
    payment_unallocated_balance,
    sync_direct_invoice_allocation,
)
from apps.billing.models import Invoice, Payment
from apps.branches.models import Branch
from apps.customers.models import Customer


class PaymentAllocationBalanceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='pay-alloc-admin',
            email='pay-alloc@example.com',
            password='password',
            role='admin',
            first_name='Pay',
            last_name='Alloc',
        )
        self.branch = Branch.objects.create(
            name='Payment Branch',
            code='PAY',
            phone='555-9000',
            address='9 Pay St',
            city='Pay',
            region='PA',
            zip_code='90009',
            created_by=self.user,
        )
        customer_user = User.objects.create_user(
            username='pay-alloc-customer',
            email='paycust@example.com',
            password='password',
            role='customer',
            first_name='Pat',
            last_name='Customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-PAY')
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

    def _create_invoice(self, total='500.00'):
        return Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            subtotal=Decimal(total),
            tax_amount=Decimal('0.00'),
            total=Decimal(total),
            amount_due=Decimal(total),
            invoice_date=timezone.now().date(),
            created_by=self.user,
        )

    def test_direct_invoice_payment_creates_allocation_and_unallocated_excess(self):
        invoice = self._create_invoice('500.00')
        payment = Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            amount=Decimal('600.00'),
            status='completed',
            processed_by=self.user,
            bank_account=self.bank_account,
        )

        sync_direct_invoice_allocation(payment)
        payment.refresh_from_db()
        invoice.refresh_from_db()

        allocation = payment.allocations.get(invoice=invoice)
        self.assertEqual(allocation.amount, Decimal('500.00'))
        self.assertEqual(payment_allocated_total(payment), Decimal('500.00'))
        self.assertEqual(payment_unallocated_balance(payment, sync=False), Decimal('100.00'))
        self.assertEqual(invoice.amount_paid, Decimal('500.00'))
        self.assertEqual(invoice.amount_due, Decimal('0.00'))
        self.assertEqual(invoice.status, 'paid')

    def test_exact_payment_shows_zero_unallocated(self):
        invoice = self._create_invoice('500.00')
        payment = Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            amount=Decimal('500.00'),
            status='completed',
            processed_by=self.user,
            bank_account=self.bank_account,
        )

        sync_direct_invoice_allocation(payment)
        self.assertEqual(payment_unallocated_balance(payment, sync=False), Decimal('0.00'))
        self.assertEqual(payment.allocations.get(invoice=invoice).amount, Decimal('500.00'))
