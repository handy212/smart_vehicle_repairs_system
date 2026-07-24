"""Regression tests for accounting audit remediation (Wave 3)."""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounting.account_validation import is_valid_settlement_account
from apps.accounting.document_numbering import DocumentNumberService
from apps.accounting.models import Account, DocumentNumberSequence, FundTransfer
from apps.accounting.services import AccountingService
from apps.accounts.models import User
from apps.billing.models import Bill, BillLineItem, CreditNote, Invoice, Payment
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inventory.models import Supplier


class Wave3RemediationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='wave3_admin',
            email='wave3@example.com',
            password='password',
            role='admin',
            first_name='Wave',
            last_name='Three',
        )
        self.approver = User.objects.create_user(
            username='wave3_approver',
            email='wave3appr@example.com',
            password='password',
            role='admin',
            first_name='Approver',
            last_name='User',
        )
        self.branch = Branch.objects.create(
            name='Wave 3 Branch',
            code='HQ',
            phone='555-4000',
            address='4 Wave St',
            city='Wave',
            region='WV',
            zip_code='40004',
            created_by=self.user,
        )
        self.bank_from = Account.objects.create(
            code='1101',
            name='Bank From',
            account_type='asset',
            balance_type='debit',
            account_subtype='bank',
            is_active=True,
        )
        self.bank_to = Account.objects.create(
            code='1102',
            name='Bank To',
            account_type='asset',
            balance_type='debit',
            account_subtype='bank',
            is_active=True,
        )
        self.inactive_bank = Account.objects.create(
            code='1103',
            name='Inactive Bank',
            account_type='asset',
            balance_type='debit',
            account_subtype='bank',
            is_active=False,
        )
        self.vendor = Supplier.objects.create(
            name='Wave Vendor',
            supplier_code='WAVE-VND',
            contact_person='Vendor Contact',
            phone='555-4001',
            email='vendor@example.com',
        )
        customer_user = User.objects.create_user(
            username='wave3_customer',
            email='wave3cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-W3')
        self._wire_accounting_controls()

    def _wire_accounting_controls(self):
        from apps.accounting.models import AccountingControl

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
        controls.shop_supplies_revenue_account = controls.sales_revenue_account
        controls.environmental_fee_revenue_account = controls.sales_revenue_account
        controls.cost_of_goods_sold_account = controls.default_expense_account
        controls.cash_over_short_account = controls.default_expense_account
        controls.till_counterparty_cash_account = self.bank_from
        controls.default_bank_account = self.bank_from
        controls.save()

    def test_bill_calculate_totals_uses_tax_service(self):
        bill = Bill.objects.create(
            vendor=self.vendor,
            branch=self.branch,
            due_date=timezone.now().date(),
            created_by=self.user,
        )
        BillLineItem.objects.create(
            bill=bill,
            description='Taxable service',
            quantity=Decimal('1'),
            unit_price=Decimal('100.00'),
            is_taxable=True,
        )
        bill.calculate_totals()
        bill.refresh_from_db()
        self.assertGreater(bill.tax_amount, Decimal('0'))
        self.assertEqual(bill.total, bill.subtotal + bill.tax_amount)

    def test_document_number_service_allocates_sequential_numbers(self):
        first = DocumentNumberService.allocate('invoice', self.branch)
        second = DocumentNumberService.allocate('invoice', self.branch)
        self.assertEqual(first, 'INV-HQ-000001')
        self.assertEqual(second, 'INV-HQ-000002')
        self.assertEqual(
            DocumentNumberSequence.objects.filter(
                document_type='invoice',
                branch=self.branch,
                fiscal_year=0,
            ).get().last_sequence,
            2,
        )

    def test_document_number_service_advances_stale_sequence_floor(self):
        Bill.objects.create(
            vendor=self.vendor,
            branch=self.branch,
            bill_number='BILL-HQ-000006',
            due_date=timezone.now().date(),
            status='open',
            subtotal=Decimal('10.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('10.00'),
            amount_due=Decimal('10.00'),
            created_by=self.user,
        )
        DocumentNumberSequence.objects.create(
            document_type='bill',
            branch=self.branch,
            fiscal_year=0,
            last_sequence=5,
        )

        self.assertEqual(DocumentNumberService.allocate('bill', self.branch), 'BILL-HQ-000007')

    def test_invoice_uses_document_number_service(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='draft',
            subtotal=Decimal('50.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('50.00'),
            invoice_date=timezone.now().date(),
            created_by=self.user,
        )
        self.assertTrue(invoice.invoice_number.startswith('INV-HQ-'))
        self.assertNotIn(str(timezone.now().year), invoice.invoice_number)

    def test_invoice_number_fits_long_branch_code(self):
        long_branch = Branch.objects.create(
            name='Long Code Branch',
            code='MAINBRANCH',
            phone='555-4001',
            address='5 Long St',
            city='Wave',
            region='WV',
            zip_code='40005',
            created_by=self.user,
        )
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=long_branch,
            status='draft',
            subtotal=Decimal('50.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('50.00'),
            invoice_date=timezone.now().date(),
            created_by=self.user,
        )
        self.assertEqual(invoice.invoice_number, 'INV-MAINBRANCH-000001')
        self.assertLessEqual(len(invoice.invoice_number), 32)

    def test_payment_and_bill_use_document_number_service(self):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='draft',
            subtotal=Decimal('50.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('50.00'),
            invoice_date=timezone.now().date(),
            created_by=self.user,
        )
        self.bank_from.account_subtype = 'bank'
        self.bank_from.save(update_fields=['account_subtype'])

        payment = Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method='check',
            amount=Decimal('50.00'),
            status='completed',
            processed_by=self.user,
            bank_account=self.bank_from,
        )
        year = timezone.now().year
        self.assertTrue(payment.payment_number.startswith('PAY-HQ-'))
        self.assertNotIn(str(year), payment.payment_number)

        bill = Bill.objects.create(
            vendor=self.vendor,
            branch=self.branch,
            due_date=timezone.now().date(),
            created_by=self.user,
        )
        self.assertTrue(bill.bill_number.startswith('BILL-HQ-'))
        self.assertNotIn(str(year), bill.bill_number)

        credit_note = CreditNote.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='draft',
            created_by=self.user,
        )
        credit_note.status = 'issued'
        credit_note.save()
        self.assertTrue(credit_note.credit_note_number.startswith('CN-HQ-'))
        self.assertNotIn(str(year), credit_note.credit_note_number)

    def test_transaction_blocks_inactive_account(self):
        expense = AccountingService.get_or_create_account('5001', 'Wave Expense', 'expense', 'debit')
        with self.assertRaises(ValidationError):
            AccountingService.create_journal_entry(
                user=self.user,
                date=timezone.now().date(),
                description='Inactive account test',
                lines=[
                    {
                        'account_id': self.inactive_bank.id,
                        'type': 'debit',
                        'amount': Decimal('10.00'),
                    },
                    {
                        'account_id': expense.id,
                        'type': 'credit',
                        'amount': Decimal('10.00'),
                    },
                ],
                posted=True,
            )

    @override_settings(SKIP_MODULE_PERMISSION_CHECKS=True)
    def test_fund_transfer_rejects_non_settlement_accounts(self):
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        expense = AccountingService.get_or_create_account('5002', 'Not Bank', 'expense', 'debit')

        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.post(
            '/api/accounting/fund-transfers/',
            {
                'from_account': expense.id,
                'to_account': self.bank_to.id,
                'amount': '25.00',
                'transfer_date': timezone.now().date().isoformat(),
                'description': 'Invalid account type',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    @override_settings(SKIP_MODULE_PERMISSION_CHECKS=True)
    def test_fund_transfer_creator_cannot_approve(self):
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        self.approver.is_superuser = True
        self.approver.save(update_fields=['is_superuser'])

        transfer = FundTransfer.objects.create(
            from_account=self.bank_from,
            to_account=self.bank_to,
            amount=Decimal('30.00'),
            transfer_date=timezone.now().date(),
            description='SOD test transfer',
            status='pending',
            created_by=self.user,
        )

        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.post(f'/api/accounting/fund-transfers/{transfer.id}/approve/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('other than the creator', response.data['error'])

        client.force_authenticate(user=self.approver)
        response = client.post(f'/api/accounting/fund-transfers/{transfer.id}/approve/')
        self.assertEqual(response.status_code, 200)
        transfer.refresh_from_db()
        self.assertEqual(transfer.status, 'approved')
        self.assertEqual(transfer.approved_by_id, self.approver.id)

    def test_settlement_account_validation_helper(self):
        self.assertTrue(is_valid_settlement_account(self.bank_from))
        self.assertFalse(is_valid_settlement_account(self.inactive_bank))
