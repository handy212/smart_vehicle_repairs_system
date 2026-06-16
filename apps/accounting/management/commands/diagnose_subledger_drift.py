from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand

from apps.accounting.models import AccountingControl, JournalEntry
from apps.accounting.services import AccountingService
from apps.accounting.subledger_reconciliation import OPEN_INVOICE_STATUSES, reconcile_subledgers
from apps.billing.models import Bill, BillPayment, Invoice, Payment


class Command(BaseCommand):
    help = 'Diagnose AR/AP subledger drift against GL control balances.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit',
            type=int,
            default=10,
            help='Maximum sample rows per section.',
        )

    def handle(self, *args, **options):
        limit = max(1, options['limit'])
        report = reconcile_subledgers()
        self.stdout.write('Subledger reconciliation summary')
        self.stdout.write('=' * 40)

        ar = report['accounts_receivable']
        ap = report['accounts_payable']
        self.stdout.write(
            f"AR GL {ar['gl_balance']:.2f} vs subledger net {ar['subledger_net_of_credits']:.2f} "
            f"(diff {ar['difference']:.2f}, in_balance={ar['in_balance']})"
        )
        self.stdout.write(
            f"AP GL {ap['gl_balance']:.2f} vs subledger net {ap['subledger_net_of_credits']:.2f} "
            f"(diff {ap['difference']:.2f}, in_balance={ap['in_balance']})"
        )

        bill_type = ContentType.objects.get_for_model(Bill)
        payment_type = ContentType.objects.get_for_model(Payment)
        bill_payment_type = ContentType.objects.get_for_model(BillPayment)

        missing_payments = Payment.objects.filter(status='completed').exclude(
            id__in=JournalEntry.objects.filter(
                content_type=payment_type,
                posted=True,
            ).values_list('object_id', flat=True),
        ).count()
        missing_bill_payments = BillPayment.objects.exclude(
            id__in=JournalEntry.objects.filter(
                content_type=bill_payment_type,
                posted=True,
            ).values_list('object_id', flat=True),
        ).count()

        self.stdout.write('')
        self.stdout.write(
            f'Completed customer payments missing GL: {missing_payments}'
        )
        self.stdout.write(
            f'Vendor bill payments missing GL: {missing_bill_payments}'
        )
        prepay = report.get('customer_prepayments', {})
        if prepay.get('configured'):
            self.stdout.write(
                f"Customer prepayment GL ({prepay.get('control_account_code')}): {prepay.get('gl_balance'):.2f}"
            )

        missing_invoice_gl = []
        for invoice in Invoice.objects.filter(
            status__in=AccountingService.FINALIZED_INVOICE_STATUSES,
            total__gt=0,
        ).order_by('-total'):
            reference = invoice.invoice_number or f'INV-{invoice.id}'
            if not JournalEntry.objects.filter(
                posted=True,
                reference=reference,
            ).exists():
                missing_invoice_gl.append(invoice)
            if len(missing_invoice_gl) >= limit:
                break

        open_invoices = Invoice.objects.filter(
            status__in=OPEN_INVOICE_STATUSES,
            amount_due__gt=0,
        ).order_by('-amount_due')
        if open_invoices.exists():
            self.stdout.write('')
            self.stdout.write(f'Top open invoices (up to {limit}):')
        for invoice in open_invoices[:limit]:
            self.stdout.write(
                f"  {invoice.invoice_number}: amount_due={invoice.amount_due}, total={invoice.total}"
            )

        if missing_invoice_gl:
            self.stdout.write('')
            self.stdout.write(f'Finalized invoices missing revenue GL (sample up to {limit}):')
            for invoice in missing_invoice_gl:
                self.stdout.write(
                    f"  {invoice.invoice_number} status={invoice.status} total={invoice.total}"
                )
        else:
            self.stdout.write('')
            self.stdout.write('No finalized invoices missing revenue GL references.')

        missing_bill_gl = []
        for bill in Bill.objects.filter(status__in=['open', 'paid'], total__gt=0).order_by('-total'):
            reference = bill.reference_number or bill.bill_number
            if not JournalEntry.objects.filter(
                content_type=bill_type,
                object_id=bill.id,
                posted=True,
            ).exists() and not JournalEntry.objects.filter(posted=True, reference=reference).exists():
                missing_bill_gl.append(bill)
            if len(missing_bill_gl) >= limit:
                break

        paid_bills_with_gl = Bill.objects.filter(
            status='paid',
            amount_due=0,
        ).order_by('-total')[:200]
        stale_ap_candidates = []
        for bill in paid_bills_with_gl:
            if JournalEntry.objects.filter(content_type=bill_type, object_id=bill.id, posted=True).exists():
                stale_ap_candidates.append(bill)
            if len(stale_ap_candidates) >= limit:
                break

        if missing_bill_gl:
            self.stdout.write('')
            self.stdout.write(f'Bills missing AP GL (sample up to {limit}):')
            for bill in missing_bill_gl:
                self.stdout.write(
                    f"  {bill.bill_number} status={bill.status} total={bill.total}"
                )

        if stale_ap_candidates:
            self.stdout.write('')
            self.stdout.write(f'Paid bills that still have posted bill GL (sample up to {limit}):')
            for bill in stale_ap_candidates:
                self.stdout.write(
                    f"  {bill.bill_number} total={bill.total} amount_paid={bill.amount_paid}"
                )

        controls = AccountingControl.get_settings()
        self.stdout.write('')
        self.stdout.write(
            f"Control accounts: AR={getattr(controls.accounts_receivable_account, 'code', None)} "
            f"AP={getattr(controls.accounts_payable_account, 'code', None)}"
        )
        self.stdout.write('')
        self.stdout.write('Suggested next steps:')
        if missing_payments or missing_bill_payments:
            self.stdout.write('  python manage.py backfill_missing_gl_postings --dry-run')
            self.stdout.write('  python manage.py backfill_missing_gl_postings --payments-only')
            self.stdout.write('  python manage.py backfill_missing_gl_postings --bill-payments-only')
        if missing_invoice_gl:
            self.stdout.write('  python manage.py backfill_missing_gl_postings --invoices-only --dry-run')
        if stale_ap_candidates and ap['difference'] > 0:
            self.stdout.write(
                '  Paid bills may have AP bill GL without matching bill-payment GL; '
                'run backfill_missing_gl_postings --bill-payments-only.'
            )
        self.stdout.write('  python manage.py repair_operational_balances --dry-run')
