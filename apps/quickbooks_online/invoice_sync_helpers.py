"""Helpers for aligning SVR invoice balances with QuickBooks inbound/outbound sync."""
from __future__ import annotations

import logging
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db.models import Sum

from .models import QBOMapping

logger = logging.getLogger(__name__)

try:
    from quickbooks.objects.invoice import Invoice as QBInvoice
except ModuleNotFoundError:
    QBInvoice = None


def local_invoice_collected(invoice) -> Decimal:
    """Cash + credit note applications recorded locally on this invoice."""
    total_payments = sum(
        (p.amount - (p.refund_amount or Decimal('0')))
        for p in invoice.payments.filter(status='completed')
    ) or Decimal('0')
    credit_total = invoice.credit_note_applications.aggregate(t=Sum('amount'))['t'] or Decimal('0')
    return (total_payments + Decimal(str(credit_total or 0))).quantize(Decimal('0.01'))


def invoice_totals_aligned(local_total, qbo_total, *, tolerance=Decimal('0.01')) -> bool:
    local_total = Decimal(str(local_total or 0)).quantize(Decimal('0.01'))
    qbo_total = Decimal(str(qbo_total or 0)).quantize(Decimal('0.01'))
    return abs(local_total - qbo_total) <= tolerance


def fetch_qbo_invoice_balance(service, invoice) -> Decimal | None:
    """Read the open Balance on the mapped QBO invoice, if available."""
    if invoice is None or QBInvoice is None:
        return None

    client = service.get_client()
    if not client:
        return None

    mapping = QBOMapping.objects.filter(
        content_type=ContentType.objects.get_for_model(invoice),
        object_id=invoice.id,
        status='synced',
    ).exclude(qbo_id='').first()
    if not mapping or not mapping.qbo_id:
        return None

    try:
        qb_inv = QBInvoice.get(int(mapping.qbo_id), qb=client)
    except Exception as exc:
        logger.debug('Could not read QBO invoice balance for %s: %s', invoice, exc)
        return None

    return Decimal(str(getattr(qb_inv, 'Balance', 0) or 0)).quantize(Decimal('0.01'))


def qbo_payment_apply_amount(service, local_payment, invoice) -> Decimal:
    """
    Amount of this payment to apply to the QBO invoice.

    Uses SVR allocation logic, capped by the QBO invoice open balance so we do
    not create unapplied customer credits that QBO may auto-apply to later invoices.
    """
    from apps.billing.balance_utils import payment_applied_to_invoice

    applied = payment_applied_to_invoice(local_payment, invoice)
    if applied <= 0:
        return Decimal('0.00')

    qbo_balance = fetch_qbo_invoice_balance(service, invoice)
    if qbo_balance is not None:
        applied = min(applied, qbo_balance)
    return applied.quantize(Decimal('0.01'))


def should_apply_qbo_payment_pull(local_invoice, *, qbo_total, qbo_paid, qbo_balance) -> bool:
    """
    Whether inbound QBO payment amounts may update this local invoice.

    Prevents QBO auto-applied credits (often from tax/total mismatches) from
    creating phantom amount_paid on unrelated SVR invoices with no local payments.
    """
    local_total = Decimal(str(local_invoice.total or 0)).quantize(Decimal('0.01'))
    qbo_total = Decimal(str(qbo_total or 0)).quantize(Decimal('0.01'))
    qbo_paid = Decimal(str(qbo_paid or 0)).quantize(Decimal('0.01'))
    local_paid = Decimal(str(local_invoice.amount_paid or 0)).quantize(Decimal('0.01'))
    local_collected = local_invoice_collected(local_invoice)

    if qbo_paid <= local_paid:
        return False

    aligned = invoice_totals_aligned(local_total, qbo_total)
    if aligned:
        return True

    if qbo_paid <= local_collected:
        return True

    logger.warning(
        'Skipping QBO payment pull for invoice %s: qbo_paid=%s exceeds local '
        'collections=%s while totals differ (svr=%s qbo=%s balance=%s)',
        local_invoice.invoice_number,
        qbo_paid,
        local_collected,
        local_total,
        qbo_total,
        qbo_balance,
    )
    return False
