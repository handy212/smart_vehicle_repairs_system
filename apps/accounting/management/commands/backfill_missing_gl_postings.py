from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand

from apps.accounting.models import JournalEntry
from apps.accounting.services import AccountingService
from apps.billing.models import Bill, Invoice


class Command(BaseCommand):
    help = (
        'Backfill missing posted GL entries for finalized invoices and open/paid bills. '
        'Idempotent via AccountingService posting guards.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report records that would be posted without creating journal entries.',
        )
        parser.add_argument(
            '--invoices-only',
            action='store_true',
            help='Only backfill customer invoice revenue/COGS entries.',
        )
        parser.add_argument(
            '--bills-only',
            action='store_true',
            help='Only backfill vendor bill AP entries.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        invoices_only = options['invoices_only']
        bills_only = options['bills_only']
        if invoices_only and bills_only:
            self.stdout.write(self.style.ERROR('Use only one of --invoices-only or --bills-only.'))
            return

        invoice_posts = 0
        cogs_posts = 0
        bill_posts = 0

        if not bills_only:
            for invoice in Invoice.objects.filter(
                status__in=AccountingService.FINALIZED_INVOICE_STATUSES,
                total__gt=0,
            ).iterator():
                reference = invoice.invoice_number or f'INV-{invoice.id}'
                needs_revenue = not JournalEntry.objects.filter(
                    posted=True,
                    reference=reference,
                ).exists()
                cogs_reference = f'{reference}-COGS'
                needs_cogs = not JournalEntry.objects.filter(
                    posted=True,
                    reference=cogs_reference,
                ).exists()
                if not needs_revenue and not needs_cogs:
                    continue
                if dry_run:
                    if needs_revenue:
                        invoice_posts += 1
                    if needs_cogs:
                        cogs_posts += 1
                    continue
                if needs_revenue:
                    if AccountingService.post_invoice(invoice):
                        invoice_posts += 1
                if needs_cogs:
                    if AccountingService.post_cogs(invoice):
                        cogs_posts += 1

        if not invoices_only:
            bill_type = ContentType.objects.get_for_model(Bill)
            for bill in Bill.objects.filter(status__in=['open', 'paid'], total__gt=0).iterator():
                reference = bill.reference_number or bill.bill_number
                has_gl = JournalEntry.objects.filter(
                    content_type=bill_type,
                    object_id=bill.id,
                    posted=True,
                ).exists() or JournalEntry.objects.filter(posted=True, reference=reference).exists()
                if has_gl:
                    continue
                if dry_run:
                    bill_posts += 1
                    continue
                if AccountingService.post_bill(bill):
                    bill_posts += 1

        mode = 'Would post' if dry_run else 'Posted'
        self.stdout.write(
            self.style.SUCCESS(
                f'{mode} {invoice_posts} invoice revenue entr{"y" if invoice_posts == 1 else "ies"}, '
                f'{cogs_posts} COGS entr{"y" if cogs_posts == 1 else "ies"}, '
                f'and {bill_posts} bill entr{"y" if bill_posts == 1 else "ies"}.'
            )
        )
