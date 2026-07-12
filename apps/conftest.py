import pytest


@pytest.fixture(scope='session', autouse=True)
def seed_rbac(django_db_setup, django_db_blocker):
    """Seed baseline roles, permissions, and accounting controls once per test session."""
    with django_db_blocker.unblock():
        from django.core.management import call_command
        from apps.accounting.models import Account, AccountingControl

        call_command('init_permissions', verbosity=0)

        from django.contrib.auth import get_user_model
        from apps.branches.models import Branch

        User = get_user_model()
        seed_admin, _ = User.objects.get_or_create(
            username='test-seed-admin',
            defaults={
                'email': 'test-seed-admin@test.com',
                'role': 'admin',
                'is_staff': True,
                'is_superuser': True,
                'is_active': True,
            },
        )
        if not seed_admin.has_usable_password():
            seed_admin.set_password('testpass123')
            seed_admin.save(update_fields=['password'])

        Branch.objects.get_or_create(
            code='SEEDHQ',
            defaults={
                'name': 'Test Headquarters',
                'phone': '0000000000',
                'address': '1 Test St',
                'city': 'Accra',
                'region': 'Greater Accra',
                'zip_code': '00000',
                'is_active': True,
                'is_headquarters': True,
                'created_by': seed_admin,
            },
        )

        accounts = {}
        for code, name, account_type, balance_type, subtype in [
            ('T1200', 'Test Accounts Receivable', 'asset', 'debit', 'accounts_receivable'),
            ('T2000', 'Test Accounts Payable', 'liability', 'credit', 'accounts_payable'),
            ('T4000', 'Test Sales Revenue', 'income', 'credit', 'revenue'),
            ('T4100', 'Test Sales Discounts', 'income', 'debit', 'revenue'),
            ('T2100', 'Test Sales Tax Payable', 'liability', 'credit', 'tax_payable'),
            ('T4050', 'Test Shop Supplies Revenue', 'income', 'credit', 'revenue'),
            ('T4060', 'Test Environmental Fee Revenue', 'income', 'credit', 'revenue'),
            ('T2200', 'Test Input Tax', 'asset', 'debit', 'current_asset'),
            ('T5000', 'Test Default Expense', 'expense', 'debit', 'expense'),
            ('T1500', 'Test Inventory Asset', 'asset', 'debit', 'inventory'),
            ('T5100', 'Test Cost of Goods Sold', 'expense', 'debit', 'expense'),
            ('T5950', 'Test Cash Over Short', 'expense', 'debit', 'expense'),
            ('T1010', 'Test Till Counterparty Cash', 'asset', 'debit', 'cash'),
            ('T1100', 'Test Operating Bank', 'asset', 'debit', 'bank'),
        ]:
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
        controls.accounts_receivable_account = accounts['T1200']
        controls.accounts_payable_account = accounts['T2000']
        controls.sales_revenue_account = accounts['T4000']
        controls.sales_discount_account = accounts['T4100']
        controls.sales_tax_payable_account = accounts['T2100']
        controls.shop_supplies_revenue_account = accounts['T4050']
        controls.environmental_fee_revenue_account = accounts['T4060']
        controls.input_tax_account = accounts['T2200']
        controls.default_expense_account = accounts['T5000']
        controls.inventory_asset_account = accounts['T1500']
        controls.cost_of_goods_sold_account = accounts['T5100']
        controls.cash_over_short_account = accounts['T5950']
        controls.till_counterparty_cash_account = accounts['T1010']
        controls.default_bank_account = accounts['T1100']
        controls.save()


@pytest.fixture
def api_client():
    """Expose a DRF API client to app-level test modules."""
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def admin_user(db):
    """Project-aware admin fixture for app-level API tests."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return User.objects.create_user(
        username='admin',
        email='admin@test.com',
        password='test123',
        first_name='Admin',
        last_name='User',
        role='admin',
        is_staff=True,
        is_superuser=True,
        is_active=True,
    )


@pytest.fixture
def manager_user(db):
    """Project-aware manager fixture for app-level API tests."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return User.objects.create_user(
        username='manager',
        email='manager@test.com',
        password='test123',
        first_name='Manager',
        last_name='User',
        role='manager',
        is_staff=True,
        is_active=True,
    )


@pytest.fixture
def technician_user(db):
    """Project-aware technician fixture for app-level API tests."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return User.objects.create_user(
        username='technician',
        email='technician@test.com',
        password='test123',
        first_name='Technician',
        last_name='User',
        role='technician',
        is_staff=True,
        is_active=True,
    )
