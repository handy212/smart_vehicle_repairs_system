"""Helpers for detecting posted GL settlement documents."""
from django.contrib.contenttypes.models import ContentType

from apps.accounting.models import JournalEntry
from apps.billing.models import BillPayment, Payment


def _references_for_payment(payment):
    refs = []
    if payment.payment_number:
        refs.append(payment.payment_number)
    if payment.reference_number:
        refs.append(payment.reference_number)
    return refs


def _references_for_bill_payment(bill_payment):
    refs = []
    if bill_payment.payment_number:
        refs.append(bill_payment.payment_number)
    if bill_payment.reference_number:
        refs.append(bill_payment.reference_number)
    return refs


def payment_has_posted_gl(payment):
    payment_type = ContentType.objects.get_for_model(Payment)
    if JournalEntry.objects.filter(
        content_type=payment_type,
        object_id=payment.id,
        posted=True,
    ).exists():
        return True
    refs = _references_for_payment(payment)
    if refs and JournalEntry.objects.filter(posted=True, reference__in=refs).exists():
        return True
    return False


def bill_payment_has_posted_gl(bill_payment):
    bill_payment_type = ContentType.objects.get_for_model(BillPayment)
    if JournalEntry.objects.filter(
        content_type=bill_payment_type,
        object_id=bill_payment.id,
        posted=True,
    ).exists():
        return True
    refs = _references_for_bill_payment(bill_payment)
    if refs and JournalEntry.objects.filter(posted=True, reference__in=refs).exists():
        return True
    return False
