"""Repair invoice/bill operational balances (cap paid, non-negative amount_due)."""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Sum

from apps.billing.balance_utils import operational_collection_balances
from apps.billing.models import Bill, Invoice


class Command(BaseCommand):
    help = (
        "Recalculate invoice and bill amount_paid/amount_due using operational "
        "collection rules (no negative due, paid capped at total)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report records that would change without saving.',
        )

    def _invoice_collected(self, invoice):
        total_payments = sum(
            (p.amount - (p.refund_amount or Decimal('0')))
            for p in invoice.payments.filter(status='completed')
        ) or Decimal('0')
        credit_total = invoice.credit_note_applications.aggregate(t=Sum('amount'))['t'] or Decimal('0')
        return (total_payments + credit_total).quantize(Decimal('0.01'))

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        invoice_changes = 0
        bill_changes = 0

        for invoice in Invoice.objects.exclude(status__in=['void', 'refunded']).iterator():
            collected = self._invoice_collected(invoice)
            paid, due = operational_collection_balances(invoice.total, collected)
            if paid == invoice.amount_paid and due == invoice.amount_due:
                continue
            invoice_changes += 1
            if not dry_run:
                invoice.amount_paid = paid
                invoice.amount_due = due
                invoice.save()

        for bill in Bill.objects.exclude(status='void').iterator():
            paid, due = operational_collection_balances(bill.total, bill.amount_paid)
            if paid == bill.amount_paid and due == bill.amount_due:
                continue
            bill_changes += 1
            if not dry_run:
                bill.amount_paid = paid
                bill.amount_due = due
                bill.save()

        mode = 'Would update' if dry_run else 'Updated'
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode} {invoice_changes} invoice(s) and {bill_changes} bill(s)."
            )
        )
