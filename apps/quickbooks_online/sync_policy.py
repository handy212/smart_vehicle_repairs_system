"""Eligibility rules for outbound QuickBooks document sync."""

from apps.accounting.services import AccountingService
from .payment_helpers import is_deposit_stage_invoice

INVOICE_QBO_SYNC_STATUSES = AccountingService.FINALIZED_INVOICE_STATUSES
PAYMENT_QBO_SYNC_STATUSES = {'completed'}
PO_QBO_EXCLUDED_STATUSES = {'draft', 'pending_approval', 'rejected', 'cancelled'}
ESTIMATE_QBO_SYNC_STATUSES = {'sent', 'viewed', 'approved'}
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
        return False, (
            'Purchase orders are not pushed to QuickBooks as bills. '
            'Receive the PO in SVR, create the linked vendor bill, and sync that bill to QBO.'
        )

    if entity_type == 'estimate':
        if status not in ESTIMATE_QBO_SYNC_STATUSES:
            return False, (
                f'Estimate status "{status}" is not eligible for QuickBooks sync. '
                f'Send or approve the estimate first (status must be one of: '
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

    # supplier, branch, and other master-data entities sync on save
    return True, ''


def is_outbound_eligible(entity_type, instance):
    eligible, _reason = outbound_eligibility_reason(entity_type, instance)
    return eligible
