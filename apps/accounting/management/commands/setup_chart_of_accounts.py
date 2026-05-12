from django.core.management.base import BaseCommand

from apps.accounting.models import Account

# Codes aligned with AccountingService auto-posting helpers
DEFAULT_ACCOUNTS = [
    ('1000', 'Cash/Bank', 'asset', 'debit'),
    ('1010', 'Cash in Safe', 'asset', 'debit'),
    ('1020', 'Cash in Drawer', 'asset', 'debit'),
    ('1200', 'Accounts Receivable', 'asset', 'debit'),
    ('1500', 'Inventory Asset', 'asset', 'debit'),
    ('1900', 'Due From Other Branches', 'asset', 'debit'),
    ('2000', 'Accounts Payable', 'liability', 'credit'),
    ('2100', 'Sales Tax Payable', 'liability', 'credit'),
    ('2200', 'Input Sales Tax', 'asset', 'debit'),
    ('2300', 'PAYE Tax Payable', 'liability', 'credit'),
    ('2310', 'Payroll Deductions Payable', 'liability', 'credit'),
    ('2900', 'Due To Other Branches', 'liability', 'credit'),
    ('3100', 'Owner Equity (Common)', 'equity', 'credit'),
    ('3200', 'Retained Earnings', 'equity', 'credit'),
    ('4000', 'Sales Revenue', 'income', 'credit'),
    ('4100', 'Sales Returns & Allowances', 'income', 'debit'),
    ('5000', 'Purchases / Operating Expense', 'expense', 'debit'),
    ('5100', 'Cost of Goods Sold', 'expense', 'debit'),
    ('5900', 'Inventory Shrinkage Expense', 'expense', 'debit'),
    ('5950', 'Cash Over/Short Expense', 'expense', 'debit'),
    ('6000', 'Salary Expense', 'expense', 'debit'),
    ('6010', 'Overtime Expense', 'expense', 'debit'),
    ('6020', 'Allowances Expense', 'expense', 'debit'),
]


class Command(BaseCommand):
    help = (
        'Create default GL accounts referenced by AccountingService automation '
        '(idempotent via get-or-create per account code).'
    )

    def handle(self, *args, **options):
        created = 0
        for code, name, account_type, balance_type in DEFAULT_ACCOUNTS:
            account, was_created = Account.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'account_type': account_type,
                    'balance_type': balance_type,
                    'is_active': True,
                },
            )
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

        self.stdout.write(
            self.style.SUCCESS(f'Chart seeds processed. New accounts created: {created}.')
        )
