"""Helpers for detecting posted GL settlement documents."""
from django.contrib.contenttypes.models import ContentType

from apps.accounting.models import JournalEntry
from apps.billing.models import BillPayment, Payment


def payment_has_posted_gl(payment):
    """True only when a posted JE is linked to this payment via content_object."""
    payment_type = ContentType.objects.get_for_model(Payment)
    return JournalEntry.objects.filter(
        content_type=payment_type,
        object_id=payment.id,
        posted=True,
    ).exists()


def bill_payment_has_posted_gl(bill_payment):
    """True only when a posted JE is linked to this bill payment via content_object."""
    bill_payment_type = ContentType.objects.get_for_model(BillPayment)
    return JournalEntry.objects.filter(
        content_type=bill_payment_type,
        object_id=bill_payment.id,
        posted=True,
    ).exists()


def count_missing_settlement_gl():
    missing_payments = sum(
        1 for payment in Payment.objects.filter(status='completed').iterator()
        if not payment_has_posted_gl(payment)
    )
    missing_bill_payments = sum(
        1 for bill_payment in BillPayment.objects.iterator()
        if not bill_payment_has_posted_gl(bill_payment)
    )
    return missing_payments, missing_bill_payments
