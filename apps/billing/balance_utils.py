"""Operational AR/AP balance helpers — cap paid at document total; due never negative."""
from decimal import Decimal


def operational_collection_balances(total, collected):
    """
    Derive amount_paid and amount_due from collected cash/credits.

    Excess collections (overpayments) are not stored on the invoice/bill;
    they remain on Payment records and post to customer prepayment liability.
    """
    total = Decimal(str(total or 0)).quantize(Decimal('0.01'))
    collected = Decimal(str(collected or 0)).quantize(Decimal('0.01'))
    amount_paid = min(collected, total)
    amount_due = max(Decimal('0'), (total - collected).quantize(Decimal('0.01')))
    return amount_paid, amount_due


def payment_net_amount(payment) -> Decimal:
    return (
        Decimal(str(payment.amount or 0)) - Decimal(str(payment.refund_amount or 0))
    ).quantize(Decimal('0.01'))


def payment_allocated_total(payment) -> Decimal:
    from django.db.models import Sum

    total = payment.allocations.aggregate(t=Sum('amount'))['t']
    return Decimal(str(total or 0)).quantize(Decimal('0.01'))


def payment_applied_to_invoice(payment, invoice) -> Decimal:
    """
    Portion of a completed payment that applies to a specific invoice,
    using payment order (date, id) against the invoice total.
    """
    from django.db.models import Sum

    if payment.status != 'completed' or invoice is None:
        return Decimal('0.00')

    invoice_total = Decimal(str(invoice.total or 0)).quantize(Decimal('0.01'))
    credit_total = invoice.credit_note_applications.aggregate(t=Sum('amount'))['t'] or Decimal('0')
    credit_total = Decimal(str(credit_total)).quantize(Decimal('0.01'))

    running = credit_total
    for candidate in invoice.payments.filter(status='completed').order_by('payment_date', 'id', 'pk'):
        if running >= invoice_total:
            if candidate.pk == payment.pk:
                return Decimal('0.00')
            continue

        room = (invoice_total - running).quantize(Decimal('0.01'))
        net = payment_net_amount(candidate)
        applied = min(net, room)
        if candidate.pk == payment.pk:
            return applied
        running = (running + applied).quantize(Decimal('0.01'))

    return Decimal('0.00')


def sync_direct_invoice_allocation(payment):
    """
    Ensure direct invoice payments have a PaymentAllocation row for the
    amount applied to the linked invoice (excluding overpayment credit).
    """
    if payment.status != 'completed' or not payment.invoice_id:
        return None

    from django.db.models import Sum
    from apps.billing.models import PaymentAllocation

    invoice = payment.invoice
    invoice.refresh_from_db()
    applied = payment_applied_to_invoice(payment, invoice)
    existing = payment.allocations.filter(invoice_id=invoice.id).aggregate(
        total=Sum('amount')
    )['total'] or Decimal('0')
    existing = Decimal(str(existing)).quantize(Decimal('0.01'))

    if applied <= 0:
        if existing > 0:
            payment.allocations.filter(invoice_id=invoice.id).delete()
        return None

    if applied == existing:
        return payment.allocations.filter(invoice_id=invoice.id).first()

    return PaymentAllocation.objects.update_or_create(
        payment=payment,
        invoice=invoice,
        defaults={
            'amount': applied,
            'allocated_by': payment.processed_by,
            'notes': 'Applied from invoice payment',
        },
    )[0]


def payment_unallocated_balance(payment, *, sync=True) -> Decimal:
    """Customer prepayment credit remaining on a completed payment."""
    if sync:
        sync_direct_invoice_allocation(payment)
    net = payment_net_amount(payment)
    allocated = payment_allocated_total(payment)
    return max(Decimal('0'), (net - allocated).quantize(Decimal('0.01')))

