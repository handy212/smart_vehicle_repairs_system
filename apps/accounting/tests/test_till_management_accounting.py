from decimal import Decimal

import pytest
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounting.models import Account, AccountingControl, JournalEntry
from apps.accounting.serializers import AccountSerializer
from apps.accounting.services import AccountingService, ReportingService
from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.accounts.permission_models import Permission
from apps.billing.models import CashierTill, Invoice, Payment
from apps.branches.models import Branch
from apps.customers.models import Customer


pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def modules_and_permissions():
    for slug, name in [('accounting', 'Accounting'), ('billing', 'Billing')]:
        SystemModule.objects.update_or_create(slug=slug, defaults={'name': name, 'is_enabled': True})
    for code, category in [
        ('view_accounting', 'accounting'),
        ('create_journal_entries', 'accounting'),
        ('process_payments', 'billing'),
        ('view_billing', 'billing'),
    ]:
        Permission.objects.update_or_create(
            code=code,
            defaults={'name': code.replace('_', ' ').title(), 'category': category, 'is_active': True},
        )


@pytest.fixture(autouse=True)
def accounting_controls():
    specs = {
        '1010': ('Cash in Safe', 'asset', 'debit', 'cash'),
        '1100': ('Operating Bank', 'asset', 'debit', 'bank'),
        '1200': ('Accounts Receivable', 'asset', 'debit', 'accounts_receivable'),
        '1500': ('Inventory Asset', 'asset', 'debit', 'inventory'),
        '2000': ('Accounts Payable', 'liability', 'credit', 'accounts_payable'),
        '2100': ('Sales Tax Payable', 'liability', 'credit', 'tax_payable'),
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
    for code, (name, account_type, balance_type, subtype) in specs.items():
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


@pytest.fixture
def branch():
    owner = User.objects.create_user(username='owner', email='owner@example.com', password='password', role='admin')
    return Branch.objects.create(name='Main Branch', code='MBR', created_by=owner)


@pytest.fixture
def staff_user(branch):
    user = User.objects.create_user(
        username='accounting_cashier',
        email='accounting-cashier@example.com',
        password='password',
        role='admin',
        branch=branch,
        first_name='Till',
        last_name='User',
    )
    user.managed_branches.add(branch)
    return user


@pytest.fixture
def customer(branch):
    user = User.objects.create_user(username='cash_customer', email='cash-customer@example.com', password='password', role='customer', branch=branch)
    return Customer.objects.create(user=user)


@pytest.fixture
def till_account():
    return Account.objects.create(
        code='1111',
        name='Main Cash',
        account_type='asset',
        balance_type='debit',
        account_subtype='cash',
        is_till_enabled=True,
    )


def create_invoice(customer, branch, user, total=Decimal('100.00')):
    return Invoice.objects.create(
        customer=customer,
        branch=branch,
        status='sent',
        subtotal=total,
        total=total,
        amount_due=total,
        invoice_date=timezone.now().date(),
        created_by=user,
    )


def test_only_leaf_cash_asset_can_be_till_enabled():
    parent = Account.objects.create(
        code='A110',
        name='Cash on Hand',
        account_type='asset',
        balance_type='debit',
        account_subtype='category',
    )
    cash = Account.objects.create(
        code='1112',
        name='Petty Cash',
        account_type='asset',
        balance_type='debit',
        account_subtype='cash',
        parent=parent,
        is_till_enabled=True,
    )
    ar = Account(
        code='1200',
        name='Accounts Receivable',
        account_type='asset',
        balance_type='debit',
        account_subtype='accounts_receivable',
        is_till_enabled=True,
    )

    assert cash.can_enable_till is True
    with pytest.raises(Exception):
        ar.full_clean()


def test_till_enabled_account_cannot_be_used_as_parent(till_account):
    serializer = AccountSerializer(data={
        'code': '1119',
        'name': 'Cash Sub Account',
        'account_type': 'asset',
        'balance_type': 'debit',
        'account_subtype': 'cash',
        'parent': till_account.id,
        'is_till_enabled': False,
        'is_active': True,
    })

    assert serializer.is_valid() is False
    assert 'parent' in serializer.errors


def test_account_hierarchy_rejects_cycles():
    parent = Account.objects.create(
        code='A100',
        name='Current Assets',
        account_type='asset',
        balance_type='debit',
        account_subtype='current_asset',
    )
    child = Account.objects.create(
        code='A110',
        name='Cash on Hand',
        account_type='asset',
        balance_type='debit',
        account_subtype='category',
        parent=parent,
    )

    serializer = AccountSerializer(
        parent,
        data={'parent': child.id},
        partial=True,
    )

    assert serializer.is_valid() is False
    assert 'parent' in serializer.errors


def test_one_open_till_per_cash_account_per_branch(branch, staff_user, till_account):
    client = APIClient()
    client.force_authenticate(user=staff_user)

    response = client.post(
        '/api/accounting/tills/open/',
        {'till_account': till_account.id, 'opening_balance': '200.00'},
        format='json',
    )
    assert response.status_code == 201, response.data

    duplicate = client.post(
        '/api/accounting/tills/open/',
        {'till_account': till_account.id, 'opening_balance': '50.00'},
        format='json',
    )
    assert duplicate.status_code == 400
    assert 'already has an open till' in str(duplicate.data)


def test_cash_payment_links_to_active_till_for_cash_account(branch, staff_user, customer, till_account):
    client = APIClient()
    client.force_authenticate(user=staff_user)
    till = CashierTill.objects.create(
        branch=branch,
        cashier=staff_user,
        till_account=till_account,
        opening_balance=Decimal('20.00'),
    )
    invoice = create_invoice(customer, branch, staff_user)

    response = client.post(
        '/api/billing/payments/',
        {
            'invoice': invoice.id,
            'payment_method': 'cash',
            'cash_account': till_account.id,
            'amount': '35.00',
        },
        format='json',
    )

    assert response.status_code == 201, response.data
    payment = Payment.objects.get(invoice=invoice)
    assert payment.till_id == till.id
    assert till.calculate_expected_balance() == Decimal('55.00')


def test_discounted_invoice_with_fees_posts_balanced_journal(branch, staff_user, customer):
    invoice = Invoice.objects.create(
        customer=customer,
        branch=branch,
        status='sent',
        subtotal=Decimal('100.00'),
        discount_amount=Decimal('10.00'),
        tax_amount=Decimal('15.00'),
        shop_supplies_fee=Decimal('5.00'),
        environmental_fee=Decimal('2.00'),
        total=Decimal('112.00'),
        amount_due=Decimal('112.00'),
        invoice_date=timezone.now().date(),
        created_by=staff_user,
    )

    entry = JournalEntry.objects.get(reference=invoice.invoice_number)
    assert entry.validate_balanced()
    debits = sum(line.amount for line in entry.transactions.filter(transaction_type='debit'))
    credits = sum(line.amount for line in entry.transactions.filter(transaction_type='credit'))
    assert debits == credits == Decimal('122.00')


def test_bank_payment_posts_to_selected_bank_account(branch, staff_user, customer):
    bank_account = Account.objects.get(code='1100')
    invoice = create_invoice(customer, branch, staff_user)
    payment = Payment.objects.create(
        invoice=invoice,
        customer=customer,
        payment_method='check',
        amount=Decimal('40.00'),
        bank_account=bank_account,
        processed_by=staff_user,
    )

    entry = JournalEntry.objects.get(
        content_type=ContentType.objects.get_for_model(payment),
        object_id=payment.id,
    )
    debit = entry.transactions.get(transaction_type='debit')
    assert debit.account_id == bank_account.id


def test_balance_sheet_rolls_child_balances_to_parent(branch, staff_user):
    parent = Account.objects.create(
        code='A199',
        name='Test Current Assets',
        account_type='asset',
        balance_type='debit',
        account_subtype='current_asset',
    )
    child_bank = Account.objects.create(
        code='1199',
        name='Test Bank',
        account_type='asset',
        balance_type='debit',
        account_subtype='bank',
        parent=parent,
    )
    equity = Account.objects.create(
        code='3999',
        name='Test Equity',
        account_type='equity',
        balance_type='credit',
    )
    AccountingService.create_journal_entry(
        user=staff_user,
        date=timezone.now().date(),
        description='Opening test bank balance',
        reference='ROLLUP-TEST',
        branch=branch,
        lines=[
            {'account_id': child_bank.id, 'type': 'debit', 'amount': Decimal('250.00')},
            {'account_id': equity.id, 'type': 'credit', 'amount': Decimal('250.00')},
        ],
    )

    report = ReportingService.get_balance_sheet(date=timezone.now().date(), branch_id=branch.id)
    parent_row = next(row for row in report['assets'] if row['code'] == 'A199')
    assert parent_row['balance'] == Decimal('250.00')


def test_till_close_requires_reason_for_variance_and_sets_approval_status(branch, staff_user, till_account):
    client = APIClient()
    client.force_authenticate(user=staff_user)
    till = CashierTill.objects.create(
        branch=branch,
        cashier=staff_user,
        till_account=till_account,
        opening_balance=Decimal('100.00'),
    )

    missing_reason = client.post(
        f'/api/accounting/tills/{till.id}/close/',
        {'counted_amount': '70.00'},
        format='json',
    )
    assert missing_reason.status_code == 400

    response = client.post(
        f'/api/accounting/tills/{till.id}/close/',
        {'counted_amount': '70.00', 'notes': 'Cash missing after manual recount'},
        format='json',
    )

    assert response.status_code == 200, response.data
    till.refresh_from_db()
    assert till.variance == Decimal('-30.00')
    assert till.variance_approval_status == 'supervisor_required'
