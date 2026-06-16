from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounting.demo_gl_cleanup import purge_demo_journal_entries
from apps.accounting.subledger_reconciliation import reconcile_subledgers


class Command(BaseCommand):
    help = (
        'Reset client-demo accounting data: purge demo GL entries (CDINV/CDPAY/CDJE), '
        'optionally purge and re-seed demo billing, then wire controls and report subledger status.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would be deleted without making changes.',
        )
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Required to perform destructive purge (omit for dry-run style summary only).',
        )
        parser.add_argument(
            '--reseed',
            action='store_true',
            help='After purge, refresh demo billing + accounting modules via seed_client_demo_data.',
        )
        parser.add_argument(
            '--count',
            type=int,
            default=100,
            help='Demo record count when using --reseed (default: 100).',
        )
        parser.add_argument(
            '--skip-wire',
            action='store_true',
            help='Skip wire_accounting_controls after reset.',
        )
        parser.add_argument(
            '--skip-billing',
            action='store_true',
            help='Only purge GL entries; do not touch demo billing invoices/payments.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        confirm = options['confirm']

        if not dry_run and not confirm:
            raise CommandError(
                'Refusing to purge without --confirm. Use --dry-run to preview first.'
            )

        from apps.accounting.demo_gl_cleanup import demo_journal_entry_queryset

        je_qs = demo_journal_entry_queryset()
        je_count = je_qs.count()
        sample_refs = list(je_qs.values_list('reference', flat=True)[:10])

        billing_note = ''
        if not options['skip_billing']:
            from apps.accounts.client_demo_data import DEMO_MARKER
            from apps.billing.models import Invoice

            inv_count = Invoice.objects.filter(description__contains=DEMO_MARKER).count()
            billing_note = f', {inv_count} demo billing invoice(s)'

        self.stdout.write(
            f'Demo GL journal entries to purge: {je_count}{billing_note}'
        )
        if sample_refs:
            self.stdout.write(f'  Sample references: {", ".join(sample_refs)}')

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run — no changes made.'))
            return

        with transaction.atomic():
            purged_gl = purge_demo_journal_entries()
            self.stdout.write(self.style.SUCCESS(f'Purged {purged_gl} demo journal entr{"y" if purged_gl == 1 else "ies"}.'))

            if not options['skip_billing']:
                from apps.accounts.client_demo_data import ClientDemoDataService

                service = ClientDemoDataService(count=options['count'])
                if options['reseed']:
                    service.refresh(modules=['billing', 'accounting'])
                    self.stdout.write(self.style.SUCCESS('Re-seeded demo billing and accounting modules.'))
                else:
                    from apps.accounts.client_demo_data import ModuleSummary

                    billing_summary = ModuleSummary(module='billing', target=options['count'])
                    service._purge_billing(billing_summary)
                    self.stdout.write(
                        self.style.SUCCESS(f'Purged {billing_summary.purged} demo billing invoice(s).')
                    )

        if not options['skip_wire']:
            call_command('wire_accounting_controls', force=True)
            self.stdout.write(self.style.SUCCESS('Wired accounting control accounts.'))

        report = reconcile_subledgers()
        ar = report['accounts_receivable']
        ap = report['accounts_payable']
        self.stdout.write(
            f"AR: GL {ar['net_gl_balance']:.2f} vs subledger {ar['subledger_net_of_credits_and_prepayments']:.2f} "
            f"(diff {ar['difference']:.2f}, {'OK' if ar['in_balance'] else 'OUT OF BALANCE'})"
        )
        self.stdout.write(
            f"AP: GL {ap['gl_balance']:.2f} vs subledger {ap['subledger_net_of_credits']:.2f} "
            f"(diff {ap['difference']:.2f}, {'OK' if ap['in_balance'] else 'OUT OF BALANCE'})"
        )

        if options['reseed']:
            self.stdout.write(
                'Tip: run validate_accounting_integrity --summary --no-fail to confirm full health.'
            )
