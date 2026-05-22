"""
When a work-order-linked invoice becomes fully paid, optionally advance the work
order to Invoiced (same outcome as Mark work order invoiced).
"""
import logging

from django.core.exceptions import ValidationError

logger = logging.getLogger(__name__)

WO_STATUSES_ELIGIBLE_FOR_AUTO_INVOICED = ('completed', 'discontinued_pending_bill')


def try_auto_mark_work_order_invoiced(invoice, *, user=None):
    """
    Transition linked work order to ``invoiced`` when invoice is fully paid.

    Returns True if the work order was transitioned, False otherwise (no-op).
    """
    if not invoice.work_order_id:
        return False

    if invoice.status in ('draft', 'void', 'proforma', 'refunded'):
        return False

    if not invoice.is_paid:
        return False

    from apps.billing.work_order_invoices import get_primary_invoice

    work_order = invoice.work_order
    primary = get_primary_invoice(work_order)
    if primary and primary.pk != invoice.pk:
        return False
    if work_order.status not in WO_STATUSES_ELIGIBLE_FOR_AUTO_INVOICED:
        return False

    if not work_order.odometer_out and work_order.odometer_in:
        work_order.odometer_out = work_order.odometer_in
        work_order.save(update_fields=['odometer_out'])
        logger.info(
            "Auto-invoiced WO %s: set odometer_out from odometer_in (%s)",
            work_order.work_order_number,
            work_order.odometer_out,
        )

    can_transition, error = work_order.can_transition_to('invoiced')
    if not can_transition:
        logger.info(
            "Invoice %s paid but WO %s not auto-marked invoiced: %s",
            invoice.invoice_number,
            work_order.work_order_number,
            error,
        )
        return False

    field_errors = work_order.validate_before_status_change('invoiced')
    if field_errors:
        logger.info(
            "Invoice %s paid but WO %s not auto-marked invoiced: %s",
            invoice.invoice_number,
            work_order.work_order_number,
            '; '.join(field_errors),
        )
        return False

    try:
        work_order.transition_to('invoiced', user=user, notify=True)
        logger.info(
            "WO %s auto-marked invoiced after invoice %s was paid in full",
            work_order.work_order_number,
            invoice.invoice_number,
        )
        return True
    except ValidationError as exc:
        logger.warning(
            "Invoice %s paid but WO %s auto-mark invoiced failed: %s",
            invoice.invoice_number,
            work_order.work_order_number,
            exc,
        )
        return False
