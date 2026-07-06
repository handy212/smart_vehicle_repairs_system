"""Schedule QBO outbound sync when document status changes (including bulk .update())."""

from __future__ import annotations

import logging

from .sync_policy import (
    CREDIT_NOTE_QBO_SYNC_STATUSES,
    ESTIMATE_QBO_SYNC_STATUSES,
    INVOICE_QBO_SYNC_STATUSES,
    PAYMENT_QBO_SYNC_STATUSES,
    VENDOR_CREDIT_QBO_SYNC_STATUSES,
    is_outbound_eligible,
    outbound_eligibility_reason,
)
from .task_dispatch import schedule_entity_sync

logger = logging.getLogger(__name__)

STATUS_GATED_MODELS = {
    'Invoice': 'invoice',
    'Payment': 'payment',
    'Estimate': 'estimate',
    'CreditNote': 'credit_note',
    'Bill': 'vendor_bill',
    'VendorCredit': 'vendor_credit',
}

MODEL_ELIGIBLE_STATUSES = {
    'Invoice': INVOICE_QBO_SYNC_STATUSES,
    'Payment': PAYMENT_QBO_SYNC_STATUSES,
    'Estimate': ESTIMATE_QBO_SYNC_STATUSES,
    'CreditNote': CREDIT_NOTE_QBO_SYNC_STATUSES,
    'VendorCredit': VENDOR_CREDIT_QBO_SYNC_STATUSES,
}


def capture_status_before_save(instance, model_class):
    """Store previous status on the instance for post_save transition detection."""
    if instance.pk:
        try:
            instance._qbo_prev_status = (
                model_class.objects.values_list('status', flat=True).get(pk=instance.pk)
            )
        except model_class.DoesNotExist:
            instance._qbo_prev_status = None
    else:
        instance._qbo_prev_status = None


def status_became_eligible(entity_type: str, instance) -> bool:
    """True when status changed and the record is now eligible for outbound sync."""
    prev = getattr(instance, '_qbo_prev_status', None)
    curr = getattr(instance, 'status', None)
    if prev is None or prev == curr:
        return False
    return is_outbound_eligible(entity_type, instance)


def _schedule_invoice_sync(invoice_id: int, previous_status: str | None = None):
    from .payment_helpers import _is_proforma_numbered_invoice
    from .signals import PROFORMA_FINALIZED_STATUSES
    from .tasks import task_sync_invoice_then_resync_payments, task_sync_invoice_to_qbo

    from apps.billing.models import Invoice

    try:
        invoice = Invoice.objects.get(pk=invoice_id)
    except Invoice.DoesNotExist:
        return

    if not is_outbound_eligible('invoice', invoice):
        return

    leaving_deposit_stage = previous_status in ('proforma',) or (
        previous_status == 'partial' and _is_proforma_numbered_invoice(invoice)
    )
    if leaving_deposit_stage and invoice.status in PROFORMA_FINALIZED_STATUSES:
        schedule_entity_sync(
            'invoice_finalize',
            invoice_id,
            task=task_sync_invoice_then_resync_payments,
        )
        return

    schedule_entity_sync('invoice', invoice_id, task=task_sync_invoice_to_qbo)


def schedule_sync_for_status_gated_instance(instance, *, previous_status: str | None = None):
    """Queue outbound sync when a status-gated model becomes eligible."""
    model_name = instance.__class__.__name__
    entity_type = STATUS_GATED_MODELS.get(model_name)
    if not entity_type:
        return

    if not is_outbound_eligible(entity_type, instance):
        return

    if entity_type == 'invoice':
        _schedule_invoice_sync(instance.id, previous_status=previous_status)
        return

    from . import tasks as qbo_tasks
    from .outbound_entities import OUTBOUND_SYNC_ENTITIES

    cfg = OUTBOUND_SYNC_ENTITIES[entity_type]
    task = getattr(qbo_tasks, cfg['task_name'])
    schedule_entity_sync(entity_type, instance.id, task=task)


def schedule_syncs_after_bulk_status_update(model_class, record_ids, new_status):
    """
    After queryset.update(status=...), re-load records and queue QBO sync when eligible.

    Bulk updates bypass Django signals; this restores outbound sync on status change.
    """
    if not record_ids:
        return 0

    model_name = model_class.__name__
    entity_type = STATUS_GATED_MODELS.get(model_name)
    if not entity_type:
        return 0

    eligible_statuses = MODEL_ELIGIBLE_STATUSES.get(model_name)
    if eligible_statuses is not None and new_status not in eligible_statuses:
        if model_name != 'Bill':
            return 0

    from .sync_policy import VENDOR_BILL_QBO_EXCLUDED_STATUSES

    if model_name == 'Bill' and new_status in VENDOR_BILL_QBO_EXCLUDED_STATUSES:
        return 0

    queued = 0
    for instance in model_class.objects.filter(id__in=record_ids):
        eligible, reason = outbound_eligibility_reason(entity_type, instance)
        if not eligible:
            logger.debug(
                'Skipping bulk-status QBO sync for %s %s: %s',
                model_name,
                instance.id,
                reason,
            )
            continue
        schedule_sync_for_status_gated_instance(
            instance,
            previous_status=None,
        )
        queued += 1
    return queued
