"""Tests for invoice/payment alignment with QuickBooks."""
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.utils import timezone

from apps.accounting.models import Account
from apps.accounts.models import User
from apps.billing.models import Invoice, Payment
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.quickbooks_online.invoice_sync_helpers import (
    local_invoice_collected,
    qbo_payment_apply_amount,
    should_apply_qbo_payment_pull,
)
from apps.quickbooks_online.payment_helpers import build_qbo_payment_lines


class _MockPaymentLine:
    def __init__(self):
        self.Amount = None
        self.LinkedTxn = None


class _MockLinkedTxn:
    def __init__(self):
        self.TxnId = None
        self.TxnType = None


class InvoiceSyncHelperTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='inv-sync@test.com',
            username='inv_sync_admin',
            password='password',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN-IS', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='inv-sync-cust',
            email='inv-sync-cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-IS')
        self.bank_account = Account.objects.create(
            code='1100',
            name='Operating Bank',
            account_type='asset',
            account_subtype='bank',
            balance_type='debit',
            is_active=True,
        )

    def test_should_reject_qbo_paid_without_local_collections_when_totals_differ(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            subtotal=Decimal('636.00'),
            tax_amount=Decimal('106.00'),
            total=Decimal('636.00'),
            amount_paid=Decimal('0.00'),
            amount_due=Decimal('636.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        self.assertFalse(
            should_apply_qbo_payment_pull(
                invoice,
                qbo_total=Decimal('530.00'),
                qbo_paid=Decimal('254.00'),
                qbo_balance=Decimal('276.00'),
            )
        )

    def test_should_allow_qbo_paid_when_totals_match(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            total=Decimal('100.00'),
            amount_paid=Decimal('0.00'),
            amount_due=Decimal('100.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        self.assertTrue(
            should_apply_qbo_payment_pull(
                invoice,
                qbo_total=Decimal('100.00'),
                qbo_paid=Decimal('100.00'),
                qbo_balance=Decimal('0.00'),
            )
        )

    @patch('apps.quickbooks_online.invoice_sync_helpers.fetch_qbo_invoice_balance')
    def test_payment_line_capped_by_qbo_open_balance(self, mock_balance):
        mock_balance.return_value = Decimal('270.00')
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='partial',
            total=Decimal('1524.00'),
            amount_paid=Decimal('1270.00'),
            amount_due=Decimal('254.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        payment = Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            bank_account=self.bank_account,
            amount=Decimal('270.00'),
            status='completed',
            processed_by=self.admin,
        )
        service = MagicMock()
        with patch(
            'apps.quickbooks_online.payment_helpers.resolve_qbo_invoice_id',
            return_value='1001',
        ):
            lines = build_qbo_payment_lines(
                service,
                payment,
                PaymentLine=_MockPaymentLine,
                LinkedTxn=_MockLinkedTxn,
            )
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0].Amount, 270.0)
        self.assertEqual(local_invoice_collected(invoice), Decimal('270.00'))

    @patch('apps.quickbooks_online.invoice_sync_helpers.fetch_qbo_invoice_balance')
    def test_payment_apply_amount_zero_when_qbo_invoice_already_closed(self, mock_balance):
        mock_balance.return_value = Decimal('0.00')
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='partial',
            total=Decimal('1524.00'),
            amount_paid=Decimal('1000.00'),
            amount_due=Decimal('524.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        payment = Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            bank_account=self.bank_account,
            amount=Decimal('270.00'),
            status='completed',
            processed_by=self.admin,
        )
        service = MagicMock()
        self.assertEqual(
            qbo_payment_apply_amount(service, payment, invoice),
            Decimal('0.00'),
        )
