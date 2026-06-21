"""Eligibility rules for outbound QuickBooks document sync."""

from apps.accounting.services import AccountingService

INVOICE_QBO_SYNC_STATUSES = AccountingService.FINALIZED_INVOICE_STATUSES
PAYMENT_QBO_SYNC_STATUSES = {'completed'}
PO_QBO_EXCLUDED_STATUSES = {'draft', 'pending_approval', 'rejected', 'cancelled'}
ESTIMATE_QBO_SYNC_STATUSES = {'sent', 'viewed', 'approved'}
CREDIT_NOTE_QBO_SYNC_STATUSES = {'issued', 'applied', 'refunded'}


def outbound_eligibility_reason(entity_type, instance):
    """
    Return (eligible, reason). Reason is empty when eligible is True.
  """
    status = getattr(instance, 'status', None)

    if entity_type == 'invoice':
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
                'Approve or confirm the PO before pushing.'
            )
        return True, ''

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

    if entity_type == 'customer':
        if not getattr(instance, 'customer_number', None):
            return False, 'Customer must have a customer number before QuickBooks sync.'
        return True, ''

    # supplier, branch, and other master-data entities sync on save
    return True, ''


def is_outbound_eligible(entity_type, instance):
    eligible, _reason = outbound_eligibility_reason(entity_type, instance)
    return eligible
