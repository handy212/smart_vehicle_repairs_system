from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounting.models import AccountingControl, JournalEntry
from apps.accounting.services import AccountingService
from apps.accounting.subledger_analysis import (
    analyze_subledger_gaps,
    bill_payment_ap_debit_on_control,
    payment_ar_credit_on_control,
)
from apps.accounting.subledger_reconciliation import reconcile_subledgers
from apps.billing.models import BillPayment, Payment


class Command(BaseCommand):
    help = 'Show per-invoice/bill GL drift explaining AR/AP subledger imbalance.'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=15)
        parser.add_argument('--json', action='store_true')

    def handle(self, *args, **options):
        import json

        report = analyze_subledger_gaps(limit=options['limit'])
        if options['json']:
            self.stdout.write(json.dumps(report, indent=2))
            return

        recon = report['reconciliation']
        ar = recon['accounts_receivable']
        ap = recon['accounts_payable']
        self.stdout.write('Reconciliation summary')
        self.stdout.write(
            f"  AR diff {ar['difference']:.2f} (GL {ar['gl_balance']:.2f}, subledger {ar['subledger_net_of_credits']:.2f})"
        )
        self.stdout.write(
            f"  AP diff {ap['difference']:.2f} (GL {ap['gl_balance']:.2f}, subledger {ap['subledger_net_of_credits']:.2f})"
        )
        self.stdout.write('')
        self.stdout.write(
            f"Sum invoice GL net AR: {report['sum_invoice_gl_net_ar']:.2f} "
            f"(orphan/unattributed AR GL: {report['orphan_ar_gl']:.2f})"
        )
        self.stdout.write(
            f"Sum bill GL net AP: {report['sum_bill_gl_net_ap']:.2f} "
            f"(orphan/unattributed AP GL: {report['orphan_ap_gl']:.2f})"
        )

        if report['invoice_drifts']:
            self.stdout.write('')
            self.stdout.write(f"Top invoice AR drift ({report['invoice_drift_count']} total):")
            for row in report['invoice_drifts']:
                self.stdout.write(
                    f"  {row['invoice_number']}: gl_net_ar={row['gl_net_ar']:.2f}, "
                    f"amount_due={row['amount_due']:.2f}, drift={row['drift']:.2f}, status={row['status']}"
                )
                for payment in row['payments_missing_ar_credit']:
                    self.stdout.write(
                        f"    payment {payment['payment_number']} amount={payment['amount']:.2f} "
                        f"has JE but no AR credit on control account"
                    )

        if report['bill_drifts']:
            self.stdout.write('')
            self.stdout.write(f"Top bill AP drift ({report['bill_drift_count']} total):")
            for row in report['bill_drifts']:
                self.stdout.write(
                    f"  {row['bill_number']}: gl_net_ap={row['gl_net_ap']:.2f}, "
                    f"amount_due={row['amount_due']:.2f}, drift={row['drift']:.2f}, status={row['status']}"
                )
                for bp in row['bill_payments_missing_ap_debit']:
                    self.stdout.write(
                        f"    bill payment {bp['payment_number']} amount={bp['amount']:.2f} "
                        f"has JE but no AP debit on control account"
                    )

        self.stdout.write('')
        self.stdout.write('If payments have JE but missing AR/AP control lines, run:')
        self.stdout.write('  python manage.py repair_misrouted_settlement_gl --dry-run')
