from django.core.management.base import BaseCommand

from apps.accounting.control_accounts import CONTROL_ACCOUNT_SPECS
from apps.accounting.models import Account, AccountingControl

# Codes aligned with AccountingService auto-posting helpers
DEFAULT_ACCOUNTS = [
    # code, name, type, balance, subtype, parent_code, till_enabled
    ('A000', 'Assets', 'asset', 'debit', 'category', None, False),
    ('A100', 'Current Assets', 'asset', 'debit', 'current_asset', 'A000', False),
    ('A110', 'Cash on Hand', 'asset', 'debit', 'category', 'A100', False),
    ('1000', 'Cash/Bank Clearing', 'asset', 'debit', 'cash_equivalent', 'A110', False),
    ('1010', 'Cash in Safe', 'asset', 'debit', 'cash', 'A110', False),
    ('1020', 'Cash in Drawer (Legacy)', 'asset', 'debit', 'cash', 'A110', False),
    ('1111', 'Main Cash', 'asset', 'debit', 'cash', 'A110', True),
    ('1112', 'Petty Cash', 'asset', 'debit', 'cash', 'A110', True),
    ('1113', 'LPO Cash', 'asset', 'debit', 'cash', 'A110', True),
    ('A120', 'Bank Accounts', 'asset', 'debit', 'bank', 'A100', False),
    ('1100', 'Operating Bank Account', 'asset', 'debit', 'bank', 'A120', False),
    ('1200', 'Accounts Receivable', 'asset', 'debit', 'accounts_receivable', 'A100', False),
    ('1500', 'Inventory Asset', 'asset', 'debit', 'inventory', 'A100', False),
    ('A170', 'Fixed Assets', 'asset', 'debit', 'fixed_asset', 'A000', False),
    ('1710', 'Vehicles', 'asset', 'debit', 'fixed_asset', 'A170', False),
    ('1720', 'Equipment', 'asset', 'debit', 'fixed_asset', 'A170', False),
    ('1900', 'Due From Other Branches', 'asset', 'debit', 'current_asset', 'A100', False),
    ('L000', 'Liabilities', 'liability', 'credit', 'category', None, False),
    ('L100', 'Current Liabilities', 'liability', 'credit', 'current_liability', 'L000', False),
    ('2000', 'Accounts Payable', 'liability', 'credit', 'accounts_payable', 'L100', False),
    ('2150', 'Customer Prepayments', 'liability', 'credit', 'current_liability', 'L100', False),
    ('2100', 'Sales Tax Payable', 'liability', 'credit', 'tax_payable', 'L100', False),
    ('2200', 'Input Sales Tax', 'asset', 'debit', 'current_asset', 'A100', False),
    ('2300', 'PAYE Tax Payable', 'liability', 'credit', 'tax_payable', 'L100', False),
    ('2310', 'Payroll Deductions Payable', 'liability', 'credit', 'current_liability', 'L100', False),
    ('2315', 'Employer Statutory Payable', 'liability', 'credit', 'current_liability', 'L100', False),
    ('2320', 'Withholding Tax Payable', 'liability', 'credit', 'tax_payable', 'L100', False),
    ('1250', 'Accrued Revenue', 'asset', 'debit', 'current_asset', 'A100', False),
    ('2050', 'Accrued Liabilities', 'liability', 'credit', 'current_liability', 'L100', False),
    ('2900', 'Due To Other Branches', 'liability', 'credit', 'current_liability', 'L100', False),
    ('Q000', 'Equity', 'equity', 'credit', 'category', None, False),
    ('3100', 'Owner Equity (Common)', 'equity', 'credit', 'category', 'Q000', False),
    ('3200', 'Retained Earnings', 'equity', 'credit', 'category', 'Q000', False),
    ('I000', 'Income', 'income', 'credit', 'category', None, False),
    ('4000', 'Sales Revenue', 'income', 'credit', 'revenue', 'I000', False),
    ('4010', 'Service Revenue', 'income', 'credit', 'revenue', 'I000', False),
    ('4020', 'Product Sales', 'income', 'credit', 'revenue', 'I000', False),
    ('4050', 'Shop Supplies Revenue', 'income', 'credit', 'revenue', 'I000', False),
    ('4060', 'Environmental Fee Revenue', 'income', 'credit', 'revenue', 'I000', False),
    ('4100', 'Sales Returns & Allowances', 'income', 'debit', 'revenue', 'I000', False),
    ('E000', 'Expenses', 'expense', 'debit', 'category', None, False),
    ('5000', 'Purchases / Operating Expense', 'expense', 'debit', 'expense', 'E000', False),
    ('5050', 'Purchase Returns', 'expense', 'credit', 'expense', 'E000', False),
    ('5100', 'Cost of Goods Sold', 'expense', 'debit', 'expense', 'E000', False),
    ('5900', 'Inventory Shrinkage Expense', 'expense', 'debit', 'expense', 'E000', False),
    ('5950', 'Cash Over/Short Expense', 'expense', 'debit', 'expense', 'E000', False),
    ('6000', 'Salary Expense', 'expense', 'debit', 'expense', 'E000', False),
    ('6010', 'Overtime Expense', 'expense', 'debit', 'expense', 'E000', False),
    ('6020', 'Allowances Expense', 'expense', 'debit', 'expense', 'E000', False),
    ('6030', 'Employer Statutory Expense', 'expense', 'debit', 'expense', 'E000', False),
    ('6100', 'Fuel', 'expense', 'debit', 'expense', 'E000', False),
    ('6200', 'Office Expenses', 'expense', 'debit', 'expense', 'E000', False),
]


class Command(BaseCommand):
    help = (
        'Create default GL accounts referenced by AccountingService automation '
        '(idempotent via get-or-create per account code).'
    )

    def handle(self, *args, **options):
        created = 0
        by_code = {}
        for code, name, account_type, balance_type, account_subtype, parent_code, till_enabled in DEFAULT_ACCOUNTS:
            parent = by_code.get(parent_code) if parent_code else None
            account, was_created = Account.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'account_type': account_type,
                    'balance_type': balance_type,
                    'account_subtype': account_subtype,
                    'parent': parent,
                    'is_till_enabled': till_enabled,
                    'is_active': True,
                },
            )
            by_code[code] = account
            if was_created:
                created += 1
            elif (
                account.name != name
                or account.account_type != account_type
                or account.balance_type != balance_type
            ):
                self.stdout.write(
                    self.style.WARNING(
                        f'Account {code} exists with different metadata; skipping update.'
                    )
                )
            else:
                changed = False
                if account.account_subtype != account_subtype:
                    account.account_subtype = account_subtype
                    changed = True
                if parent and account.parent_id != parent.id:
                    account.parent = parent
                    changed = True
                if account.children.exists():
                    till_enabled = False
                if account.is_till_enabled != till_enabled:
                    account.is_till_enabled = till_enabled
                    changed = True
                if changed:
                    account.save(update_fields=['account_subtype', 'parent', 'is_till_enabled', 'updated_at'])

        self.stdout.write(
            self.style.SUCCESS(f'Chart seeds processed. New accounts created: {created}.')
        )
        controls = AccountingControl.get_settings()
        changed_fields = []
        for field_name, spec in CONTROL_ACCOUNT_SPECS.items():
            code = spec[0]
            if getattr(controls, f'{field_name}_id') is None and code in by_code:
                setattr(controls, field_name, by_code[code])
                changed_fields.append(field_name)
        if changed_fields:
            controls.save(update_fields=changed_fields + ['updated_at'])
            self.stdout.write(self.style.SUCCESS('Accounting controls configured from chart seeds.'))
