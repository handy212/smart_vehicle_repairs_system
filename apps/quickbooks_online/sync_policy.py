"""Eligibility rules for outbound QuickBooks document sync."""

from apps.accounting.services import AccountingService
from .payment_helpers import is_deposit_stage_invoice

INVOICE_QBO_SYNC_STATUSES = AccountingService.FINALIZED_INVOICE_STATUSES
PAYMENT_QBO_SYNC_STATUSES = {'completed'}
PO_QBO_SYNC_STATUSES = {'confirmed', 'partially_received', 'received'}
PO_QBO_EXCLUDED_STATUSES = {'draft', 'pending_approval', 'rejected', 'cancelled'}
BILL_PAYMENT_QBO_SYNC_STATUSES = {'cash', 'check', 'bank_transfer', 'mobile_money', 'credit_card', 'other'}
VENDOR_EXPENSE_QBO_SYNC_STATUSES = {'posted'}
ESTIMATE_QBO_SYNC_STATUSES = {'sent', 'viewed', 'approved', 'converted'}
CREDIT_NOTE_QBO_SYNC_STATUSES = {'issued', 'applied', 'refunded'}
VENDOR_BILL_QBO_EXCLUDED_STATUSES = {'draft', 'pending_approval', 'rejected', 'void'}
VENDOR_CREDIT_QBO_SYNC_STATUSES = {'issued', 'applied'}

# SVR estimate status → QBO Estimate.TxnStatus (inverse of pull_estimates map)
ESTIMATE_QBO_TXN_STATUS = {
    'approved': 'Accepted',
    'declined': 'Rejected',
    'converted': 'Closed',
}


def outbound_eligibility_reason(entity_type, instance):
    """
    Return (eligible, reason). Reason is empty when eligible is True.
  """
    status = getattr(instance, 'status', None)

    if entity_type == 'invoice':
        if is_deposit_stage_invoice(instance):
            return False, (
                'Proforma and deposit-stage invoices are not pushed to QuickBooks until '
                'converted to an issued invoice (sent, viewed, paid, etc.).'
            )
        if status not in INVOICE_QBO_SYNC_STATUSES:
            return False, (
                f'Invoice status "{status}" is not eligible for QuickBooks sync. '
                f'Finalize the invoice first (status must be one of: '
                f'{", ".join(sorted(INVOICE_QBO_SYNC_STATUSES))}).'
            )
        return True, ''

    if entity_type == 'payment':
        if status not in PAYMENT_QBO_SYNC_STATUSES:
            return False, (
                f'Payment status "{status}" is not eligible for QuickBooks sync. '
                'Only completed payments are pushed.'
            )
        return True, ''

    if entity_type == 'purchase_order':
        if status in PO_QBO_EXCLUDED_STATUSES:
            return False, (
                f'Purchase order status "{status}" is not eligible for QuickBooks sync. '
                'Confirm the purchase order before pushing to QuickBooks.'
            )
        if status not in PO_QBO_SYNC_STATUSES:
            return False, (
                f'Purchase order status "{status}" is not eligible for QuickBooks sync. '
                f'Status must be one of: {", ".join(sorted(PO_QBO_SYNC_STATUSES))}.'
            )
        return True, ''

    if entity_type == 'bill_payment':
        bill = getattr(instance, 'bill', None)
        if bill and getattr(bill, 'status', None) in VENDOR_BILL_QBO_EXCLUDED_STATUSES:
            return False, 'Cannot sync payment for a draft or void vendor bill.'
        method = getattr(instance, 'payment_method', None)
        if method and method not in BILL_PAYMENT_QBO_SYNC_STATUSES:
            return False, f'Payment method "{method}" is not supported for QuickBooks sync.'
        return True, ''

    if entity_type == 'vendor_expense':
        if status not in VENDOR_EXPENSE_QBO_SYNC_STATUSES:
            return False, (
                f'Vendor expense status "{status}" is not eligible for QuickBooks sync. '
                'Post the expense before pushing.'
            )
        return True, ''

    if entity_type == 'estimate':
        if status not in ESTIMATE_QBO_SYNC_STATUSES:
            return False, (
                f'Estimate status "{status}" is not eligible for QuickBooks sync. '
                f'Send, approve, or convert the estimate first (status must be one of: '
                f'{", ".join(sorted(ESTIMATE_QBO_SYNC_STATUSES))}).'
            )
        return True, ''

    if entity_type == 'credit_note':
        if status not in CREDIT_NOTE_QBO_SYNC_STATUSES:
            return False, (
                f'Credit note status "{status}" is not eligible for QuickBooks sync. '
                'Issue the credit note before pushing.'
            )
        return True, ''

    if entity_type == 'vendor_bill':
        if status in VENDOR_BILL_QBO_EXCLUDED_STATUSES:
            return False, (
                f'Vendor bill status "{status}" is not eligible for QuickBooks sync. '
                'Approve or open the bill before pushing.'
            )
        return True, ''

    if entity_type == 'vendor_credit':
        if status not in VENDOR_CREDIT_QBO_SYNC_STATUSES:
            return False, (
                f'Vendor credit status "{status}" is not eligible for QuickBooks sync. '
                'Issue the vendor credit before pushing.'
            )
        return True, ''

    if entity_type == 'customer':
        if not getattr(instance, 'customer_number', None):
            return False, 'Customer must have a customer number before QuickBooks sync.'
        return True, ''

    if entity_type == 'inventory_adjustment':
        from .inventory_adjustment_sync import QBO_INVENTORY_ADJUSTMENT_TYPES

        txn_type = getattr(instance, 'transaction_type', '')
        if txn_type not in QBO_INVENTORY_ADJUSTMENT_TYPES:
            return False, (
                f'Inventory transaction type "{txn_type}" is not eligible for QBO adjustment sync.'
            )
        part = getattr(instance, 'part', None)
        if not part or not part.tracks_inventory():
            return False, 'Only inventory-type parts sync as QBO inventory adjustments.'
        qty = getattr(instance, 'quantity', 0) or 0
        if qty == 0:
            return False, 'Zero-quantity adjustment skipped.'
        return True, ''

    # supplier, branch, and other master-data entities sync on save
    return True, ''


def is_outbound_eligible(entity_type, instance):
    eligible, _reason = outbound_eligibility_reason(entity_type, instance)
    return eligible
