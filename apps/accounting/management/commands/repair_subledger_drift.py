from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.accounting.gl_posting_checks import count_missing_settlement_gl
from apps.accounting.subledger_reconciliation import reconcile_subledgers


class Command(BaseCommand):
    help = (
        'One-shot repair for AR/AP subledger drift: settlement accounts, '
        'operational balances, and missing payment/bill-payment GL.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Run dependent commands in dry-run mode only.',
        )
        parser.add_argument(
            '--skip-settlement-repair',
            action='store_true',
            help='Skip repair_settlement_accounts.',
        )
        parser.add_argument(
            '--skip-balance-repair',
            action='store_true',
            help='Skip repair_operational_balances.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        dry_flag = ['--dry-run'] if dry_run else []

        self.stdout.write('Step 1/4: settlement account repair')
        if not options['skip_settlement_repair']:
            call_command('repair_settlement_accounts', *dry_flag)
        else:
            self.stdout.write('  skipped')

        self.stdout.write('Step 2/4: operational balance repair')
        if not options['skip_balance_repair']:
            call_command('repair_operational_balances', *dry_flag)
        else:
            self.stdout.write('  skipped')

        missing_before = count_missing_settlement_gl()
        self.stdout.write(
            f'Step 3/4: missing GL before backfill — '
            f'{missing_before[0]} customer payment(s), {missing_before[1]} vendor bill payment(s)'
        )

        self.stdout.write('Step 4/4: backfill missing GL postings')
        call_command('backfill_missing_gl_postings', *dry_flag)

        if dry_run:
            self.stdout.write(self.style.SUCCESS('repair_subledger_drift dry run complete.'))
            return

        missing_after = count_missing_settlement_gl()
        report = reconcile_subledgers()
        ar = report['accounts_receivable']
        ap = report['accounts_payable']
        self.stdout.write('')
        self.stdout.write('Subledger summary after repair:')
        self.stdout.write(
            f"  AR raw GL {ar['gl_balance']:.2f}, prepayment GL {ar.get('prepayment_gl_balance', 0):.2f}, "
            f"net GL {ar.get('net_gl_balance', ar['gl_balance']):.2f}"
        )
        self.stdout.write(
            f"  AR subledger {ar['subledger_net_of_credits']:.2f}, "
            f"operational prepayments {ar.get('operational_prepayments', 0):.2f}, "
            f"diff {ar['difference']:.2f}, in_balance={ar['in_balance']}"
        )
        self.stdout.write(
            f"  AP GL {ap['gl_balance']:.2f}, subledger {ap['subledger_net_of_credits']:.2f}, "
            f"diff {ap['difference']:.2f}, in_balance={ap['in_balance']}"
        )
        self.stdout.write(
            f"  Still missing GL: {missing_after[0]} customer payment(s), "
            f'{missing_after[1]} vendor bill payment(s)'
        )
        if missing_after[0] or missing_after[1]:
            self.stdout.write(
                self.style.WARNING(
                    'Some settlements could not be posted (cash without till, invalid bank account, etc.). '
                    'Run: python manage.py diagnose_subledger_drift'
                )
            )
        self.stdout.write(self.style.SUCCESS('repair_subledger_drift complete.'))
