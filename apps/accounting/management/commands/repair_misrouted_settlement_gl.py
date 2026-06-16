from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounting.models import AccountingControl, JournalEntry
from apps.accounting.services import AccountingService
from apps.accounting.subledger_analysis import (
    bill_payment_ap_debit_on_control,
    payment_ar_credit_on_control,
)
from apps.accounting.subledger_reconciliation import reconcile_subledgers
from apps.billing.models import BillPayment, Payment


class Command(BaseCommand):
    help = (
        'Post supplemental GL entries when settlement JEs exist but did not '
        'credit AR / debit AP on the configured control accounts.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--username', default='admin')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        user = get_user_model().objects.filter(username=options['username']).first()
        if user is None and not dry_run:
            self.stdout.write(self.style.ERROR(f"User '{options['username']}' not found."))
            return

        controls = AccountingControl.get_settings()
        ar_account = controls.accounts_receivable_account
        ap_account = controls.accounts_payable_account
        revenue_account = controls.sales_revenue_account
        expense_account = controls.default_expense_account

        ar_fixes = 0
        ap_fixes = 0

        for payment in Payment.objects.filter(status='completed').select_related('invoice', 'customer'):
            if not ar_account or payment_ar_credit_on_control(payment, ar_account) > 0:
                continue
            if not JournalEntry.objects.filter(
                content_type__model='payment',
                object_id=payment.id,
                posted=True,
            ).exists():
                continue
            if JournalEntry.objects.filter(posted=True, reference=f'AR-FIX-{payment.payment_number}').exists():
                continue

            amount = Decimal(str(payment.amount)).quantize(Decimal('0.01'))
            if amount <= 0:
                continue

            offset = revenue_account or expense_account
            if offset is None:
                continue

            if dry_run:
                self.stdout.write(
                    f"Would post AR fix for payment {payment.payment_number}: "
                    f"Cr AR {amount}, Dr {offset.code}"
                )
                ar_fixes += 1
                continue

            with transaction.atomic():
                AccountingService.create_journal_entry(
                    user=user,
                    date=AccountingService._payment_journal_date(payment),
                    description=f"AR clearing fix for payment {payment.payment_number}",
                    reference=f'AR-FIX-{payment.payment_number}',
                    posted=True,
                    branch=payment.invoice.branch if payment.invoice_id else None,
                    lines=[
                        {
                            'account_id': ar_account.id,
                            'type': 'credit',
                            'amount': amount,
                            'description': 'AR clearing fix',
                        },
                        {
                            'account_id': offset.id,
                            'type': 'debit',
                            'amount': amount,
                            'description': 'Reclass from misrouted settlement',
                        },
                    ],
                )
            ar_fixes += 1

        for bill_payment in BillPayment.objects.select_related('bill', 'bill__branch'):
            if not ap_account or bill_payment_ap_debit_on_control(bill_payment, ap_account) > 0:
                continue
            if not JournalEntry.objects.filter(
                content_type__model='billpayment',
                object_id=bill_payment.id,
                posted=True,
            ).exists():
                continue
            if JournalEntry.objects.filter(
                posted=True,
                reference=f'AP-FIX-{bill_payment.payment_number}',
            ).exists():
                continue

            amount = Decimal(str(bill_payment.amount)).quantize(Decimal('0.01'))
            if amount <= 0:
                continue

            offset = expense_account or revenue_account
            if offset is None:
                continue

            if dry_run:
                self.stdout.write(
                    f"Would post AP fix for bill payment {bill_payment.payment_number}: "
                    f"Dr AP {amount}, Cr {offset.code}"
                )
                ap_fixes += 1
                continue

            with transaction.atomic():
                AccountingService.create_journal_entry(
                    user=user,
                    date=bill_payment.payment_date,
                    description=f"AP clearing fix for bill payment {bill_payment.payment_number}",
                    reference=f'AP-FIX-{bill_payment.payment_number}',
                    posted=True,
                    branch=bill_payment.bill.branch if bill_payment.bill_id else None,
                    lines=[
                        {
                            'account_id': ap_account.id,
                            'type': 'debit',
                            'amount': amount,
                            'description': 'AP clearing fix',
                        },
                        {
                            'account_id': offset.id,
                            'type': 'credit',
                            'amount': amount,
                            'description': 'Reclass from misrouted settlement',
                        },
                    ],
                )
            ap_fixes += 1

        mode = 'Would post' if dry_run else 'Posted'
        self.stdout.write(self.style.SUCCESS(f'{mode} {ar_fixes} AR fix(es) and {ap_fixes} AP fix(es).'))

        if not dry_run:
            report = reconcile_subledgers()
            ar = report['accounts_receivable']
            ap = report['accounts_payable']
            self.stdout.write(
                f"After repair — AR diff {ar['difference']:.2f}, AP diff {ap['difference']:.2f}"
            )
