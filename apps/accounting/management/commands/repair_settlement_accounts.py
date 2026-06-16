from django.core.management.base import BaseCommand

from apps.accounting.models import AccountingControl
from apps.billing.models import BillPayment, Payment, Refund

from apps.accounting.management.commands.validate_accounting_integrity import (
    BANK_SETTLEMENT_PAYMENT_METHODS,
)


class Command(BaseCommand):
    help = (
        'Backfill missing bank/cash-equivalent settlement accounts on completed '
        'payments and refunds using AccountingControl.default_bank_account.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report records that would change without saving.',
        )

    def _is_valid_bank_account(self, account):
        return (
            account is not None
            and account.is_active
            and account.account_type == 'asset'
            and account.account_subtype in {'bank', 'cash_equivalent'}
            and not account.children.exists()
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        controls = AccountingControl.get_settings()
        default_bank = controls.default_bank_account

        if not self._is_valid_bank_account(default_bank):
            self.stdout.write(
                self.style.ERROR(
                    'default_bank_account is not configured as an active leaf bank/cash-equivalent account. '
                    'Run wire_accounting_controls first.'
                )
            )
            return

        payment_changes = 0
        refund_changes = 0
        vendor_changes = 0

        for payment in Payment.objects.filter(
            status='completed',
            payment_method__in=BANK_SETTLEMENT_PAYMENT_METHODS,
            bank_account__isnull=True,
        ).iterator():
            payment_changes += 1
            if not dry_run:
                payment.bank_account = default_bank
                payment.save(update_fields=['bank_account', 'updated_at'])

        for refund in Refund.objects.filter(
            status='completed',
            bank_account__isnull=True,
        ).exclude(refund_method='cash').iterator():
            refund_changes += 1
            if not dry_run:
                refund.bank_account = default_bank
                refund.save(update_fields=['bank_account', 'updated_at'])

        for payment in BillPayment.objects.filter(
            payment_method__in=BANK_SETTLEMENT_PAYMENT_METHODS,
            bank_account__isnull=True,
        ).iterator():
            vendor_changes += 1
            if not dry_run:
                payment.bank_account = default_bank
                payment.save(update_fields=['bank_account', 'updated_at'])

        mode = 'Would update' if dry_run else 'Updated'
        self.stdout.write(
            self.style.SUCCESS(
                f'{mode} {payment_changes} customer payment(s), '
                f'{refund_changes} refund(s), and {vendor_changes} vendor payment(s).'
            )
        )
