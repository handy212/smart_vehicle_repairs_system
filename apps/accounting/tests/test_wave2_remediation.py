"""Regression tests for accounting audit remediation (Wave 2)."""
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounting.models import AccountingControl, JournalEntry
from apps.accounting.services import AccountingService
from apps.accounting.subledger_reconciliation import reconcile_subledgers
from apps.accounts.models import User
from apps.billing.models import (
    CreditNote,
    CreditNoteApplication,
    CreditNoteLineItem,
    Invoice,
    Payment,
)
from apps.billing.serializers import InvoiceUpdateSerializer
from apps.branches.models import Branch
from apps.customers.models import Customer


class Wave2RemediationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='wave2_admin',
            email='wave2@example.com',
            password='password',
            role='admin',
            first_name='Wave',
            last_name='Two',
        )
        self.branch = Branch.objects.create(
            name='Wave 2 Branch',
            code='W2B',
            phone='555-3000',
            address='3 Wave St',
            city='Wave',
            state='WV',
            zip_code='30003',
            created_by=self.user,
        )
        customer_user = User.objects.create_user(
            username='wave2_customer',
            email='wave2cust@example.com',
            password='password',
            role='customer',
            first_name='Casey',
            last_name='Buyer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-W2')

        self.ar_account = AccountingService.get_or_create_account(
            '1200', 'Accounts Receivable', 'asset', 'debit'
        )
        self.revenue = AccountingService.get_or_create_account(
            '4000', 'Sales Revenue', 'income', 'credit'
        )
        self.tax_account = AccountingService.get_or_create_account(
            '2100', 'Sales Tax Payable', 'liability', 'credit'
        )
        self.returns_account = AccountingService.get_or_create_account(
            '4100', 'Sales Returns', 'income', 'debit'
        )
        self.cash_account = AccountingService.get_or_create_account(
            '1100', 'Operating Bank', 'asset', 'debit'
        )
        self.cash_account.account_subtype = 'bank'
        self.cash_account.save(update_fields=['account_subtype'])
        self.prepayment_account = AccountingService.get_or_create_account(
            '2150', 'Customer Prepayments', 'liability', 'credit'
        )
        self.ap_account = AccountingService.get_or_create_account(
            '2000', 'Accounts Payable', 'liability', 'credit'
        )
        self._wire_accounting_controls()

    def _wire_accounting_controls(self):
        controls = AccountingControl.get_settings()
        controls.accounts_receivable_account = self.ar_account
        controls.accounts_payable_account = self.ap_account
        controls.customer_prepayment_account = self.prepayment_account
        controls.sales_revenue_account = self.revenue
        controls.sales_discount_account = self.returns_account
        controls.sales_tax_payable_account = self.tax_account
        controls.shop_supplies_revenue_account = self.revenue
        controls.environmental_fee_revenue_account = self.revenue
        controls.input_tax_account = self.cash_account
        controls.default_expense_account = self.revenue
        controls.inventory_asset_account = self.cash_account
        controls.cost_of_goods_sold_account = self.revenue
        controls.cash_over_short_account = self.revenue
        controls.till_counterparty_cash_account = self.cash_account
        controls.default_bank_account = self.cash_account
        controls.save()

    def _create_posted_invoice(self, total=Decimal('100.00')):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            subtotal=total,
            tax_amount=Decimal('0.00'),
            total=total,
            amount_due=total,
            invoice_date=timezone.now().date(),
            created_by=self.user,
        )
        invoice.refresh_from_db()
        return invoice

    @override_settings(SKIP_MODULE_PERMISSION_CHECKS=True)
    def test_invoice_void_reverses_posted_gl(self):
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        invoice = self._create_posted_invoice()
        invoice_type = ContentType.objects.get_for_model(invoice)
        self.assertEqual(
            JournalEntry.objects.filter(content_type=invoice_type, object_id=invoice.id).count(),
            1,
        )

        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.post(
            f'/api/billing/invoices/{invoice.id}/void/',
            {'reason': 'Customer cancelled'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, 'void')
        reversal_refs = JournalEntry.objects.filter(reference__startswith='REV-JE-')
        self.assertGreaterEqual(reversal_refs.count(), 1)

    @override_settings(SKIP_MODULE_PERMISSION_CHECKS=True)
    def test_invoice_void_blocked_when_payments_exist(self):
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        invoice = self._create_posted_invoice()
        Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            amount=Decimal('25.00'),
            status='completed',
            processed_by=self.user,
            bank_account=self.cash_account,
        )

        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.post(
            f'/api/billing/invoices/{invoice.id}/void/',
            {'reason': 'Should fail'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        invoice.refresh_from_db()
        self.assertNotEqual(invoice.status, 'void')

    def test_invoice_update_blocked_after_gl_post(self):
        invoice = self._create_posted_invoice()
        serializer = InvoiceUpdateSerializer(
            instance=invoice,
            data={'description': 'Changed after post'},
            partial=True,
            context={'request': type('Req', (), {'user': self.user})()},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('detail', serializer.errors)

    def test_credit_note_gl_posts_on_apply_not_issue(self):
        invoice = self._create_posted_invoice()
        credit_note = CreditNote.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='draft',
            created_by=self.user,
        )
        CreditNoteLineItem.objects.create(
            credit_note=credit_note,
            description='Returned labor',
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

        application = CreditNoteApplication.objects.create(
            credit_note=credit_note,
            invoice=invoice,
            amount=Decimal('40.00'),
            applied_by=self.user,
        )
        AccountingService.post_credit_note_application(application)

        app_type = ContentType.objects.get_for_model(application)
        entry = JournalEntry.objects.get(
            content_type=app_type,
            object_id=application.id,
            reference=f'CN-APP-{application.id}',
        )
        ar_credit = entry.transactions.get(account=self.ar_account, transaction_type='credit')
        self.assertEqual(ar_credit.amount, Decimal('40.00'))

    def test_credit_note_calculate_totals_uses_tax_service(self):
        credit_note = CreditNote.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='draft',
            created_by=self.user,
        )
        CreditNoteLineItem.objects.create(
            credit_note=credit_note,
            description='Taxable return',
            quantity=Decimal('1'),
            unit_price=Decimal('100.00'),
            is_taxable=True,
        )
        credit_note.calculate_totals()
        credit_note.refresh_from_db()
        self.assertGreater(credit_note.tax_amount, Decimal('0'))
        self.assertEqual(credit_note.total, credit_note.subtotal + credit_note.tax_amount)

    def test_payment_overpayment_credits_prepayment_liability(self):
        invoice = self._create_posted_invoice(total=Decimal('80.00'))
        payment = Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            amount=Decimal('100.00'),
            status='completed',
            processed_by=self.user,
            bank_account=self.cash_account,
        )
        AccountingService.post_payment(payment)

        payment_type = ContentType.objects.get_for_model(payment)
        entry = JournalEntry.objects.get(content_type=payment_type, object_id=payment.id)
        ar_credit = entry.transactions.filter(
            account=self.ar_account, transaction_type='credit'
        ).first()
        prepay_credit = entry.transactions.filter(
            account=self.prepayment_account, transaction_type='credit'
        ).first()

        self.assertEqual(ar_credit.amount, Decimal('80.00'))
        self.assertEqual(prepay_credit.amount, Decimal('20.00'))

    @override_settings(SKIP_MODULE_PERMISSION_CHECKS=True)
    def test_subledger_reconciliation_endpoint(self):
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        self._create_posted_invoice(total=Decimal('150.00'))

        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get('/api/accounting/reports/subledger-reconciliation/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('accounts_receivable', response.data)
        self.assertTrue(response.data['accounts_receivable']['in_balance'])

    def test_subledger_reconciliation_service_detects_difference(self):
        invoice = self._create_posted_invoice(total=Decimal('90.00'))
        report = reconcile_subledgers(branch_id=self.branch.id)
        self.assertTrue(report['accounts_receivable']['in_balance'])

        invoice.refresh_from_db()
        Invoice.objects.filter(pk=invoice.pk).update(amount_due=Decimal('50.00'))

        broken = reconcile_subledgers(branch_id=self.branch.id)
        self.assertFalse(broken['accounts_receivable']['in_balance'])
        self.assertNotEqual(
            broken['accounts_receivable']['difference'],
            0,
        )
