"""Tests for SVR ↔ QBO invoice delivery status mapping."""
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.billing.models import Invoice
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.quickbooks_online.invoice_status_sync_helpers import (
    _customer_bill_email,
    apply_invoice_communication_status,
)


class InvoiceStatusSyncHelperTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='inv-status@test.com',
            username='inv_status_admin',
            password='password',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN-IS', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='inv-status-cust',
            email='customer@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-IS')

    def test_sent_invoice_maps_to_qbo_email_sent(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            total=Decimal('100.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        qb_invoice = MagicMock()

        with patch(
            'apps.quickbooks_online.invoice_status_sync_helpers.EmailAddress',
            create=True,
        ) as mock_email_cls:
            mock_email = MagicMock()
            mock_email_cls.return_value = mock_email
            apply_invoice_communication_status(qb_invoice, invoice)

        self.assertEqual(qb_invoice.EmailStatus, 'EmailSent')
        self.assertEqual(qb_invoice.BillEmail, mock_email)
        self.assertEqual(mock_email.Address, 'customer@example.com')

    @patch('apps.quickbooks_online.tax_sync_helpers.uses_us_line_tax_codes', return_value=True)
    def test_sent_invoice_skips_email_status_for_us_company(self, _mock_us):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            total=Decimal('100.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        qb_invoice = MagicMock()
        apply_invoice_communication_status(qb_invoice, invoice, us_company=True)
        qb_invoice.EmailStatus = 'not-set'
        apply_invoice_communication_status(qb_invoice, invoice, us_company=True)
        self.assertEqual(qb_invoice.EmailStatus, 'not-set')

    def test_draft_invoice_maps_to_not_set(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='draft',
            total=Decimal('100.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        qb_invoice = MagicMock()
        apply_invoice_communication_status(qb_invoice, invoice)
        self.assertEqual(qb_invoice.EmailStatus, 'NotSet')

    def test_customer_bill_email_property(self):
        invoice = MagicMock(customer=self.customer)
        self.assertEqual(_customer_bill_email(invoice), 'customer@example.com')
