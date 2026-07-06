from decimal import Decimal

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounting.models import Account, AccountingControl
from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.accounts.permission_models import Permission
from apps.billing.models import CashierTill, Invoice, Payment
from apps.branches.models import Branch
from apps.customers.models import Customer


class PaymentSettlementBranchTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        SystemModule.objects.update_or_create(
            slug='billing',
            defaults={'name': 'Billing', 'is_enabled': True},
        )
        for code, name in [
            ('view_billing', 'View Billing'),
            ('process_payments', 'Process Payments'),
        ]:
            Permission.objects.update_or_create(
                code=code,
                defaults={
                    'name': name,
                    'category': 'billing',
                    'is_active': True,
                },
            )

        cls.admin = User.objects.create_user(
            username='settlement-pay-admin',
            email='settlement-pay-admin@test.com',
            password='password',
            role='admin',
            first_name='Settle',
            last_name='Admin',
        )
        cls.branch_a = Branch.objects.create(
            name='Kumasi HQ',
            code='KSI',
            phone='000',
            address='1 Main',
            city='Kumasi',
            state='Ashanti',
            zip_code='00000',
            created_by=cls.admin,
        )
        cls.branch_b = Branch.objects.create(
            name='Accra Branch',
            code='ACC',
            phone='000',
            address='2 Main',
            city='Accra',
            state='Greater Accra',
            zip_code='00001',
            created_by=cls.admin,
        )
        cls.admin.managed_branches.add(cls.branch_a, cls.branch_b)

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
        cls.shared_bank = accounts['1100']

        cls.kumasi_bank = Account.objects.create(
            code='1111',
            name='Kumasi Absa',
            account_type='asset',
            balance_type='debit',
            account_subtype='bank',
            branch=cls.branch_a,
            is_active=True,
        )
        cls.accra_bank = Account.objects.create(
            code='1114',
            name='Accra Absa',
            account_type='asset',
            balance_type='debit',
            account_subtype='bank',
            branch=cls.branch_b,
            is_active=True,
        )
        cls.kumasi_cash = Account.objects.create(
            code='1143',
            name='Kumasi Main Cash',
            account_type='asset',
            balance_type='debit',
            account_subtype='cash',
            branch=cls.branch_a,
            is_active=True,
            is_till_enabled=True,
        )
        cls.accra_cash = Account.objects.create(
            code='1141',
            name='Accra Main Cash',
            account_type='asset',
            balance_type='debit',
            account_subtype='cash',
            branch=cls.branch_b,
            is_active=True,
            is_till_enabled=True,
        )

        customer_user = User.objects.create_user(
            username='settlement-customer',
            email='settlement-customer@test.com',
            password='password',
            role='customer',
            first_name='Pay',
            last_name='Customer',
            branch=cls.branch_a,
        )
        cls.customer = Customer.objects.create(
            user=customer_user,
            customer_number='C-SETTLE',
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def _create_invoice(self, branch=None, total=Decimal('200.00')):
        branch = branch or self.branch_a
        return Invoice.objects.create(
            customer=self.customer,
            branch=branch,
            status='sent',
            subtotal=total,
            tax_amount=Decimal('0.00'),
            total=total,
            amount_due=total,
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )

    @override_settings(SETTLEMENT_ACCOUNT_BRANCH_ENFORCEMENT=True)
    def test_bank_payment_rejects_cross_branch_bank_account(self):
        invoice = self._create_invoice(self.branch_a)
        response = self.client.post(
            reverse('api_billing:payment-list'),
            {
                'invoice': invoice.id,
                'payment_method': 'check',
                'bank_account': self.accra_bank.id,
                'amount': '50.00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('bank_account', response.data)

    @override_settings(SETTLEMENT_ACCOUNT_BRANCH_ENFORCEMENT=True)
    def test_bank_payment_accepts_branch_bank_account(self):
        invoice = self._create_invoice(self.branch_a)
        response = self.client.post(
            reverse('api_billing:payment-list'),
            {
                'invoice': invoice.id,
                'payment_method': 'check',
                'bank_account': self.kumasi_bank.id,
                'amount': '50.00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['bank_account'], self.kumasi_bank.id)

    @override_settings(SETTLEMENT_ACCOUNT_BRANCH_ENFORCEMENT=True)
    def test_cash_payment_rejects_cross_branch_till_account(self):
        CashierTill.objects.create(
            branch=self.branch_b,
            cashier=self.admin,
            till_account=self.accra_cash,
            opening_balance=Decimal('100.00'),
        )
        invoice = self._create_invoice(self.branch_a)
        response = self.client.post(
            reverse('api_billing:payment-list'),
            {
                'invoice': invoice.id,
                'payment_method': 'cash',
                'cash_account': self.accra_cash.id,
                'amount': '25.00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue('cash_account' in response.data or 'payment_method' in response.data)

    @override_settings(SETTLEMENT_ACCOUNT_BRANCH_ENFORCEMENT=True)
    def test_cash_payment_accepts_branch_till_account(self):
        CashierTill.objects.create(
            branch=self.branch_a,
            cashier=self.admin,
            till_account=self.kumasi_cash,
            opening_balance=Decimal('100.00'),
        )
        invoice = self._create_invoice(self.branch_a)
        response = self.client.post(
            reverse('api_billing:payment-list'),
            {
                'invoice': invoice.id,
                'payment_method': 'cash',
                'cash_account': self.kumasi_cash.id,
                'amount': '25.00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        payment = Payment.objects.filter(invoice=invoice).order_by('-id').first()
        self.assertIsNotNone(payment)
        self.assertIsNotNone(payment.till_id)

    @override_settings(SETTLEMENT_ACCOUNT_BRANCH_ENFORCEMENT=False)
    def test_enforcement_disabled_allows_cross_branch_bank_payment(self):
        invoice = self._create_invoice(self.branch_a)
        response = self.client.post(
            reverse('api_billing:payment-list'),
            {
                'invoice': invoice.id,
                'payment_method': 'check',
                'bank_account': self.accra_bank.id,
                'amount': '50.00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
