from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand

from apps.accounting.models import JournalEntry
from apps.accounting.services import AccountingService
from apps.accounting.subledger_reconciliation import reconcile_subledgers
from apps.billing.models import Bill, BillPayment, Invoice, Payment


class Command(BaseCommand):
    help = (
        'Backfill missing posted GL entries for finalized invoices, bills, '
        'completed customer payments, and vendor bill payments.'
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
        parser.add_argument(
            '--payments-only',
            action='store_true',
            help='Only backfill completed customer payment GL entries.',
        )
        parser.add_argument(
            '--bill-payments-only',
            action='store_true',
            help='Only backfill vendor bill payment GL entries.',
        )
        parser.add_argument(
            '--skip-settlements',
            action='store_true',
            help='Skip customer/vendor payment GL backfill.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        only_flags = [
            options['invoices_only'],
            options['bills_only'],
            options['payments_only'],
            options['bill_payments_only'],
        ]
        if sum(only_flags) > 1:
            self.stdout.write(self.style.ERROR('Use at most one of the *-only flags.'))
            return

        post_invoices = options['invoices_only'] or not any(only_flags)
        post_bills = options['bills_only'] or not any(only_flags)
        post_payments = (options['payments_only'] or not any(only_flags)) and not options['skip_settlements']
        post_bill_payments = (options['bill_payments_only'] or not any(only_flags)) and not options['skip_settlements']

        invoice_posts = 0
        cogs_posts = 0
        bill_posts = 0
        payment_posts = 0
        bill_payment_posts = 0
        payment_errors = 0
        bill_payment_errors = 0

        payment_type = ContentType.objects.get_for_model(Payment)
        bill_payment_type = ContentType.objects.get_for_model(BillPayment)
        bill_type = ContentType.objects.get_for_model(Bill)

        if post_invoices:
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
                if needs_revenue and AccountingService.post_invoice(invoice):
                    invoice_posts += 1
                if needs_cogs and AccountingService.post_cogs(invoice):
                    cogs_posts += 1

        if post_bills:
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

        if post_payments:
            for payment in Payment.objects.filter(status='completed').iterator():
                if JournalEntry.objects.filter(
                    content_type=payment_type,
                    object_id=payment.id,
                    posted=True,
                ).exists():
                    continue
                if dry_run:
                    payment_posts += 1
                    continue
                try:
                    if AccountingService.post_payment(payment):
                        payment_posts += 1
                except Exception as exc:
                    payment_errors += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f'Payment {payment.payment_number} (id={payment.id}) skipped: {exc}'
                        )
                    )

        if post_bill_payments:
            for bill_payment in BillPayment.objects.select_related('bill').iterator():
                if JournalEntry.objects.filter(
                    content_type=bill_payment_type,
                    object_id=bill_payment.id,
                    posted=True,
                ).exists():
                    continue
                if dry_run:
                    bill_payment_posts += 1
                    continue
                try:
                    if AccountingService.post_bill_payment(bill_payment):
                        bill_payment_posts += 1
                except Exception as exc:
                    bill_payment_errors += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f'Bill payment {bill_payment.payment_number} (id={bill_payment.id}) skipped: {exc}'
                        )
                    )

        mode = 'Would post' if dry_run else 'Posted'
        self.stdout.write(
            self.style.SUCCESS(
                f'{mode} {invoice_posts} invoice revenue, {cogs_posts} COGS, {bill_posts} bill, '
                f'{payment_posts} customer payment, and {bill_payment_posts} vendor bill payment entr'
                f'{"y" if (payment_posts + bill_payment_posts) == 1 else "ies"}.'
            )
        )
        if payment_errors or bill_payment_errors:
            self.stdout.write(
                self.style.WARNING(
                    f'Skipped {payment_errors} customer payment(s) and '
                    f'{bill_payment_errors} vendor bill payment(s) due to validation errors.'
                )
            )

        if not dry_run and not any(only_flags):
            report = reconcile_subledgers()
            ar = report['accounts_receivable']
            ap = report['accounts_payable']
            self.stdout.write(
                f"Subledger after backfill — AR diff {ar['difference']:.2f}, AP diff {ap['difference']:.2f}"
            )
