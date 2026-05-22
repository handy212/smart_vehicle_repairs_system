"""
Resolve invoices linked to a work order (supports multiple revisions after void).
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Iterable

if TYPE_CHECKING:
    from apps.billing.models import Invoice
    from apps.workorders.models import WorkOrder

HIDDEN_INVOICE_STATUSES = ('void', 'refunded')
CUSTOMER_VISIBLE_EXCLUDE = ('draft', 'void', 'proforma', 'refunded')


def invoices_for_work_order(work_order: WorkOrder) -> Iterable[Invoice]:
    """All invoices for this work order, newest first."""
    from apps.billing.models import Invoice

    if not work_order or not work_order.pk:
        return Invoice.objects.none()
    return Invoice.objects.filter(work_order_id=work_order.pk).order_by('-created_at')


def get_primary_invoice(
    work_order: WorkOrder | None,
    *,
    for_customer: bool = False,
) -> Invoice | None:
    """Latest billable invoice used for display and WO sync."""
    if not work_order or not work_order.pk:
        return None

    exclude = CUSTOMER_VISIBLE_EXCLUDE if for_customer else HIDDEN_INVOICE_STATUSES

    prefetched = getattr(work_order, '_prefetched_objects_cache', None)
    if prefetched and 'invoices' in prefetched:
        for inv in work_order.invoices.all():
            if inv.status not in exclude:
                return inv
        return None

    return (
        invoices_for_work_order(work_order)
        .exclude(status__in=exclude)
        .first()
    )


def has_active_invoice(work_order: WorkOrder) -> bool:
    return get_primary_invoice(work_order) is not None


def active_invoice_exists_for_work_order(work_order: WorkOrder, *, exclude_invoice_id: int | None = None) -> bool:
    qs = invoices_for_work_order(work_order).exclude(status__in=HIDDEN_INVOICE_STATUSES)
    if exclude_invoice_id:
        qs = qs.exclude(pk=exclude_invoice_id)
    return qs.exists()


def invoice_summary_payload(invoice: Invoice, *, include_internal: bool = True) -> dict:
    return {
        'id': invoice.id,
        'invoice_number': invoice.invoice_number,
        'status': invoice.status,
        'total': str(invoice.total),
        'amount_paid': str(invoice.amount_paid),
        'amount_due': str(invoice.amount_due),
        'is_paid': invoice.is_paid,
        'invoice_date': invoice.invoice_date.isoformat() if invoice.invoice_date else None,
        'paid_at': invoice.paid_at.isoformat() if invoice.paid_at else None,
        'created_at': invoice.created_at.isoformat() if invoice.created_at else None,
        **(
            {'is_void': invoice.status == 'void'}
            if include_internal
            else {}
        ),
    }


INVOICE_READY_NOTIFY_STATUSES = ('sent', 'viewed', 'partial', 'paid', 'overdue')


def notify_invoice_ready_if_needed(
    invoice: Invoice,
    *,
    previous_status: str | None = None,
    had_sent_at: bool = False,
) -> None:
    """Email/SMS customer when an invoice is first issued (status leaves draft/proforma)."""
    import logging

    logger = logging.getLogger(__name__)
    if not invoice.customer_id:
        return
    if invoice.status not in INVOICE_READY_NOTIFY_STATUSES:
        return
    if previous_status in INVOICE_READY_NOTIFY_STATUSES:
        return

    try:
        from apps.notifications_app.triggers import notification_triggers

        notification_triggers.invoice_sent(invoice)
    except Exception as exc:
        logger.warning(
            "Failed to send invoice-ready notification for %s: %s",
            invoice.invoice_number,
            exc,
            exc_info=True,
        )


def related_invoices_payload(work_order: WorkOrder, *, for_customer: bool = False) -> list[dict]:
    rows = []
    primary = get_primary_invoice(work_order)
    for inv in invoices_for_work_order(work_order):
        if for_customer and inv.status in CUSTOMER_VISIBLE_EXCLUDE:
            continue
        row = invoice_summary_payload(inv, include_internal=not for_customer)
        row['is_primary'] = primary is not None and inv.pk == primary.pk
        rows.append(row)
    return rows
