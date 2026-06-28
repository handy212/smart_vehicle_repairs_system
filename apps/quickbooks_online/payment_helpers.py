"""QuickBooks payment line building and invoice-link validation."""
from __future__ import annotations

import logging
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType

from .models import QBOMapping

logger = logging.getLogger(__name__)


class PaymentSyncError(Exception):
    """Payment cannot be pushed to QBO without breaking accounting rules."""


def _is_proforma_numbered_invoice(invoice) -> bool:
    """Proforma invoices use branch codes like MAIN-PRO000001."""
    number = (getattr(invoice, 'invoice_number', None) or '').upper()
    return '-PRO' in number or number.startswith('PRO')


def is_deposit_stage_invoice(invoice) -> bool:
    """Proforma or PRO-numbered partial invoices are customer-deposit stage (not issued in QBO)."""
    if not invoice:
        return False
    if getattr(invoice, 'status', None) == 'proforma':
        return True
    return (
        _is_proforma_numbered_invoice(invoice)
        and getattr(invoice, 'status', None) == 'partial'
    )


def is_customer_deposit_payment(local_payment) -> bool:
    """
    Treat proforma / deposit invoices as unapplied customer credits in QBO.
    SVR posts prepayment liability internally; QBO receives an unapplied Payment.

    A completed payment on a proforma invoice moves the invoice to ``partial``,
    so we also treat PRO-numbered partial invoices as deposits until issued.
    """
    return is_deposit_stage_invoice(getattr(local_payment, 'invoice', None))


def resolve_qbo_invoice_id(service, invoice) -> str | None:
    """Return QBO invoice Id for a local invoice, syncing on demand when needed."""
    if not invoice:
        return None

    mapping = QBOMapping.objects.filter(
        content_type=ContentType.objects.get_for_model(invoice),
        object_id=invoice.id,
        status='synced',
    ).first()
    if mapping and mapping.qbo_id:
        return str(mapping.qbo_id)

    qb_invoice = service.sync_invoice(invoice)
    if qb_invoice and getattr(qb_invoice, 'Id', None):
        return str(qb_invoice.Id)
    return None


def build_qbo_payment_lines(service, local_payment, *, PaymentLine, LinkedTxn):
    """
    Build QBO PaymentLine rows with LinkedTxn to invoices.

    - Proforma/deposit: no lines (unapplied payment in QBO).
    - PaymentAllocation rows: one line per allocated invoice.
    - Default: single line linked to payment.invoice.

    Raises PaymentSyncError when a finalized invoice payment cannot be linked.
    """
    allocations = list(
        local_payment.allocations.select_related('invoice').all()
    ) if hasattr(local_payment, 'allocations') else []

    if allocations:
        lines = []
        for allocation in allocations:
            if is_deposit_stage_invoice(allocation.invoice):
                continue
            qb_invoice_id = resolve_qbo_invoice_id(service, allocation.invoice)
            if not qb_invoice_id:
                raise PaymentSyncError(
                    f'Invoice {allocation.invoice.invoice_number} is not synced to QuickBooks; '
                    'sync the invoice before allocating this payment.'
                )
            from .invoice_sync_helpers import fetch_qbo_invoice_balance

            amount = Decimal(str(allocation.amount or 0)).quantize(Decimal('0.01'))
            qbo_balance = fetch_qbo_invoice_balance(service, allocation.invoice)
            if qbo_balance is not None:
                amount = min(amount, qbo_balance)
            if amount <= 0:
                continue
            line = PaymentLine()
            line.Amount = float(amount)
            linked = LinkedTxn()
            linked.TxnId = qb_invoice_id
            linked.TxnType = 'Invoice'
            line.LinkedTxn = [linked]
            lines.append(line)
        return lines

    if is_customer_deposit_payment(local_payment):
        return []

    invoice = local_payment.invoice
    if not invoice:
        raise PaymentSyncError(
            f'Payment {local_payment.payment_number} has no invoice to apply in QuickBooks.'
        )

    if invoice.status == 'proforma':
        return []

    if is_deposit_stage_invoice(invoice):
        return []

    qb_invoice_id = resolve_qbo_invoice_id(service, invoice)
    if not qb_invoice_id:
        raise PaymentSyncError(
            f'Invoice {invoice.invoice_number} is not synced to QuickBooks. '
            'Finalize and sync the invoice before syncing this payment.'
        )

    from .invoice_sync_helpers import qbo_payment_apply_amount

    apply_amount = qbo_payment_apply_amount(service, local_payment, invoice)
    if apply_amount <= 0:
        return []

    line = PaymentLine()
    line.Amount = float(apply_amount)
    linked = LinkedTxn()
    linked.TxnId = qb_invoice_id
    linked.TxnType = 'Invoice'
    line.LinkedTxn = [linked]
    return [line]


def payment_private_note(local_payment) -> str | None:
    if is_customer_deposit_payment(local_payment):
        base = local_payment.notes or ''
        marker = 'SVR customer deposit (proforma / prepayment)'
        return f'{base} — {marker}'.strip(' —') if base else marker
    return local_payment.notes or None


def resolve_payment_branch(local_payment):
    """
    Return the SVR branch for QBO DepartmentRef on a customer payment.

    Prefer a single branch across allocations; when multiple branches appear,
    fall back to the payment's primary invoice branch, then the open till branch.
    """
    from apps.branches.models import Branch

    branch_ids = set()
    if hasattr(local_payment, 'allocations'):
        for allocation in local_payment.allocations.select_related('invoice').all():
            invoice = allocation.invoice
            if invoice and invoice.branch_id:
                branch_ids.add(invoice.branch_id)

    invoice = getattr(local_payment, 'invoice', None)
    if invoice and invoice.branch_id:
        branch_ids.add(invoice.branch_id)

    if len(branch_ids) == 1:
        return Branch.objects.filter(pk=branch_ids.pop()).first()

    if invoice and invoice.branch_id:
        return invoice.branch

    till = getattr(local_payment, 'till', None)
    if till and till.branch_id:
        return till.branch

    return None
