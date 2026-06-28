"""QuickBooks BillPayment line building and vendor payment account resolution."""
from __future__ import annotations

import logging
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType

from .models import QBOMapping

logger = logging.getLogger(__name__)


class BillPaymentSyncError(Exception):
    """Bill payment cannot be pushed to QBO without breaking accounting rules."""


def resolve_qbo_bill_id(service, bill) -> str | None:
    """Return QBO Bill Id for a local vendor bill, syncing on demand when needed."""
    if not bill:
        return None

    mapping = QBOMapping.objects.filter(
        content_type=ContentType.objects.get_for_model(bill),
        object_id=bill.id,
        status='synced',
    ).first()
    if mapping and mapping.qbo_id:
        return str(mapping.qbo_id)

    qb_bill = service.sync_vendor_bill(bill)
    if qb_bill and getattr(qb_bill, 'Id', None):
        return str(qb_bill.Id)
    return None


def resolve_vendor_payment_bank_account_id(mapping_service, bill_payment) -> str | None:
    """Resolve QBO bank/cash account for a vendor bill payment."""
    method = getattr(bill_payment, 'payment_method', '') or ''
    if mapping_service:
        mapped = mapping_service.resolve_qbo_account_id('vendor_payment_method', method)
        if mapped:
            return mapped

    if method == 'cash' and bill_payment.till_id and bill_payment.till:
        till_account = getattr(bill_payment.till, 'till_account', None)
        if till_account and mapping_service:
            till_mapping = mapping_service.get_mapping('svr_account', str(till_account.id))
            if till_mapping and till_mapping.qbo_account_id:
                return till_mapping.qbo_account_id

    if bill_payment.bank_account_id and mapping_service:
        bank_mapping = mapping_service.get_mapping('svr_account', str(bill_payment.bank_account_id))
        if bank_mapping and bank_mapping.qbo_account_id:
            return bank_mapping.qbo_account_id

    if mapping_service:
        return mapping_service.resolve_control_account_qbo_id('default_bank_account')
    return None


def qbo_pay_type_for_method(payment_method: str) -> str:
    """Map SVR vendor payment method to QBO BillPayment PayType."""
    if payment_method == 'credit_card':
        return 'CreditCard'
    return 'Check'


def build_qbo_bill_payment_lines(service, bill_payments, *, DetailLine, LinkedTxn):
    """
    Build QBO BillPayment Line rows with LinkedTxn to bills.

    bill_payments: iterable of local BillPayment rows (same vendor).
    """
    lines = []
    for bill_payment in bill_payments:
        bill = bill_payment.bill
        qb_bill_id = resolve_qbo_bill_id(service, bill)
        if not qb_bill_id:
            raise BillPaymentSyncError(
                f'Bill {bill.bill_number} is not synced to QuickBooks; '
                'sync the bill before recording payment.'
            )
        amount = Decimal(str(bill_payment.amount or 0)).quantize(Decimal('0.01'))
        if amount <= 0:
            continue
        line = DetailLine()
        line.Amount = float(amount)
        linked = LinkedTxn()
        linked.TxnId = qb_bill_id
        linked.TxnType = 'Bill'
        line.LinkedTxn = [linked]
        lines.append(line)
    if not lines:
        raise BillPaymentSyncError('No bill payment lines to sync to QuickBooks.')
    return lines


def bill_payment_private_note(bill_payments) -> str:
    """Build PrivateNote for WHT and SVR references."""
    parts = []
    for bp in bill_payments:
        ref = bp.payment_number
        wht = getattr(bp, 'wht_amount', None) or 0
        if wht and Decimal(str(wht)) > 0:
            parts.append(f'{ref}: WHT {wht}')
        else:
            parts.append(ref)
    note = 'SVR Bill Payment: ' + ', '.join(parts)
    if len(note) > 4000:
        return note[:3997] + '...'
    return note
