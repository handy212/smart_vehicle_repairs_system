from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.accounting.models import Account, AccountingControl
from apps.billing.models import Invoice, Payment, PaymentAllocation
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.quickbooks_online.payment_helpers import resolve_payment_branch
from apps.quickbooks_online.services import QuickBooksService

User = get_user_model()


def configure_billing_accounting_controls():
    account_specs = {
        '1010': ('Cash in Safe', 'asset', 'debit', 'cash'),
        '1100': ('Operating Bank', 'asset', 'debit', 'bank'),
        '1200': ('Accounts Receivable', 'asset', 'debit', 'accounts_receivable'),
        '1500': ('Inventory Asset', 'asset', 'debit', 'inventory'),
        '2000': ('Accounts Payable', 'liability', 'credit', 'accounts_payable'),
        '2100': ('Sales Tax Payable', 'liability', 'credit', 'tax_payable'),
        '2150': ('Customer Prepayments', 'liability', 'credit', 'current_liability'),
        '2200': ('Input Tax', 'asset', 'debit', 'current_asset'),
        '4000': ('Sales Revenue', 'income', 'credit', 'revenue'),
        '4050': ('Shop Supplies Revenue', 'income', 'credit', 'revenue'),
        '4060': ('Environmental Fee Revenue', 'income', 'credit', 'revenue'),
        '4100': ('Sales Returns', 'income', 'debit', 'revenue'),
        '5000': ('Default Expense', 'expense', 'debit', 'expense'),
        '5100': ('Cost of Goods Sold', 'expense', 'debit', 'expense'),
        '5950': ('Cash Over Short', 'expense', 'debit', 'expense'),
    }
    accounts = {}
    for code, (name, account_type, balance_type, subtype) in account_specs.items():
        accounts[code], _ = Account.objects.get_or_create(
            code=code,
            defaults={
                'name': name,
                'account_type': account_type,
                'balance_type': balance_type,
                'account_subtype': subtype,
                'is_active': True,
            },
        )
    controls = AccountingControl.get_settings()
    controls.accounts_receivable_account = accounts['1200']
    controls.accounts_payable_account = accounts['2000']
    controls.sales_revenue_account = accounts['4000']
    controls.sales_discount_account = accounts['4100']
    controls.sales_tax_payable_account = accounts['2100']
    controls.customer_prepayment_account = accounts['2150']
    controls.shop_supplies_revenue_account = accounts['4050']
    controls.environmental_fee_revenue_account = accounts['4060']
    controls.input_tax_account = accounts['2200']
    controls.default_expense_account = accounts['5000']
    controls.inventory_asset_account = accounts['1500']
    controls.cost_of_goods_sold_account = accounts['5100']
    controls.cash_over_short_account = accounts['5950']
    controls.till_counterparty_cash_account = accounts['1010']
    controls.default_bank_account = accounts['1100']
    controls.save()
    return accounts['1100']


class ResolvePaymentBranchTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            username='qbo-pay-branch-admin',
            email='qbo-pay-branch-admin@test.com',
            password='password',
            role='admin',
        )
        cls.branch_a = Branch.objects.create(
            name='Kumasi HQ',
            code='KSI',
            phone='000',
            address='1 Main',
            city='Kumasi',
            region='Ashanti',
            zip_code='00000',
            created_by=cls.admin,
        )
        cls.branch_b = Branch.objects.create(
            name='Accra Branch',
            code='ACC',
            phone='000',
            address='2 Main',
            city='Accra',
            region='Greater Accra',
            zip_code='00001',
            created_by=cls.admin,
        )
        customer_user = User.objects.create_user(
            username='qbo-pay-customer',
            email='qbo-pay-customer@test.com',
            password='password',
            role='customer',
        )
        cls.customer = Customer.objects.create(user=customer_user, customer_number='C-QBO-PAY')
        cls.bank = configure_billing_accounting_controls()

    def _invoice(self, branch, total='200.00'):
        return Invoice.objects.create(
            customer=self.customer,
            branch=branch,
            status='sent',
            subtotal=Decimal(total),
            tax_amount=Decimal('0.00'),
            total=Decimal(total),
            amount_due=Decimal(total),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )

    def _payment(self, invoice, **kwargs):
        return Payment.objects.create(
            invoice=invoice,
            customer=self.customer,
            payment_method=kwargs.pop('payment_method', 'check'),
            amount=kwargs.pop('amount', Decimal('50.00')),
            status='completed',
            processed_by=self.admin,
            bank_account=kwargs.pop('bank_account', self.bank),
            **kwargs,
        )

    def test_resolve_from_invoice_branch(self):
        invoice = self._invoice(self.branch_a)
        payment = self._payment(invoice)
        branch = resolve_payment_branch(payment)
        self.assertEqual(branch, self.branch_a)

    def test_resolve_from_single_allocation_branch(self):
        invoice = self._invoice(self.branch_b)
        payment = self._payment(invoice, amount=Decimal('100.00'))
        branch = resolve_payment_branch(payment)
        self.assertEqual(branch, self.branch_b)

    def test_resolve_multi_branch_allocations_prefers_primary_invoice(self):
        invoice_a = self._invoice(self.branch_a)
        invoice_b = self._invoice(self.branch_b)
        payment = self._payment(invoice_a, amount=Decimal('150.00'))
        payment.allocations.all().delete()
        PaymentAllocation.objects.create(
            payment=payment, invoice=invoice_a, amount=Decimal('50.00'), allocated_by=self.admin,
        )
        PaymentAllocation.objects.create(
            payment=payment, invoice=invoice_b, amount=Decimal('100.00'), allocated_by=self.admin,
        )
        branch = resolve_payment_branch(payment)
        self.assertEqual(branch, self.branch_a)


class SyncPaymentDepartmentRefTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            username='qbo-sync-pay-admin',
            email='qbo-sync-pay-admin@test.com',
            password='password',
            role='admin',
        )
        cls.branch = Branch.objects.create(
            name='Kumasi HQ',
            code='KSI',
            phone='000',
            address='1 Main',
            city='Kumasi',
            region='Ashanti',
            zip_code='00000',
            created_by=cls.admin,
        )
        customer_user = User.objects.create_user(
            username='qbo-sync-customer',
            email='qbo-sync-customer@test.com',
            password='password',
            role='customer',
        )
        cls.customer = Customer.objects.create(user=customer_user, customer_number='C-QBO-SYNC')
        cls.bank = configure_billing_accounting_controls()

    def setUp(self):
        self.invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            subtotal=Decimal('200.00'),
            tax_amount=Decimal('0.00'),
            total=Decimal('200.00'),
            amount_due=Decimal('200.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        self.payment = Payment.objects.create(
            invoice=self.invoice,
            customer=self.customer,
            payment_method='check',
            amount=Decimal('50.00'),
            status='completed',
            processed_by=self.admin,
            bank_account=self.bank,
        )

    @patch.object(QuickBooksService, '_save_qb')
    @patch.object(QuickBooksService, '_apply_department_ref')
    @patch('apps.quickbooks_online.mapping_services.get_account_mapping_service')
    @patch('apps.quickbooks_online.payment_helpers.build_qbo_payment_lines')
    @patch.object(QuickBooksService, '_load_qbo_entity')
    @patch.object(QuickBooksService, 'sync_customer')
    @patch.object(QuickBooksService, 'get_client')
    def test_sync_payment_applies_department_ref(
        self,
        mock_get_client,
        mock_sync_customer,
        mock_load_entity,
        mock_build_lines,
        mock_mapping_service,
        mock_apply_department,
        mock_save_qb,
    ):
        mock_get_client.return_value = MagicMock()
        mock_sync_customer.return_value = MagicMock(Id='cust-1')
        qb_payment = MagicMock()
        qb_payment.Id = 'pay-1'
        qb_payment.SyncToken = '0'
        mock_load_entity.return_value = (qb_payment, True, None)
        mock_build_lines.return_value = []

        mapping = MagicMock()
        mapping.resolve_payment_deposit_account_id.return_value = 'bank-qbo-1'
        mock_mapping_service.return_value = mapping

        mock_save_qb.side_effect = lambda obj, client: obj

        service = QuickBooksService()
        result = service.sync_payment(self.payment)

        self.assertIsNotNone(result)
        mock_apply_department.assert_called_once()
        called_txn, called_branch = mock_apply_department.call_args[0]
        self.assertIs(called_txn, qb_payment)
        self.assertEqual(called_branch, self.branch)

    @patch.object(QuickBooksService, '_save_qb')
    @patch.object(QuickBooksService, '_apply_department_ref')
    @patch('apps.quickbooks_online.mapping_services.get_account_mapping_service')
    @patch('apps.quickbooks_online.payment_helpers.build_qbo_payment_lines')
    @patch.object(QuickBooksService, '_load_qbo_entity')
    @patch.object(QuickBooksService, 'sync_customer')
    @patch.object(QuickBooksService, 'get_client')
    def test_sync_payment_skips_department_when_branch_unresolved(
        self,
        mock_get_client,
        mock_sync_customer,
        mock_load_entity,
        mock_build_lines,
        mock_mapping_service,
        mock_apply_department,
        mock_save_qb,
    ):
        self.invoice.branch = None
        self.invoice.save(update_fields=['branch'])

        mock_get_client.return_value = MagicMock()
        mock_sync_customer.return_value = MagicMock(Id='cust-1')
        qb_payment = MagicMock()
        qb_payment.Id = 'pay-2'
        qb_payment.SyncToken = '0'
        mock_load_entity.return_value = (qb_payment, True, None)
        mock_build_lines.return_value = []

        mapping = MagicMock()
        mapping.resolve_payment_deposit_account_id.return_value = 'bank-qbo-1'
        mock_mapping_service.return_value = mapping
        mock_save_qb.side_effect = lambda obj, client: obj

        service = QuickBooksService()
        service.sync_payment(self.payment)

        mock_apply_department.assert_not_called()
