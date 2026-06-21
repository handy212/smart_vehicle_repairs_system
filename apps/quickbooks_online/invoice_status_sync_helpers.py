"""Map SVR invoice lifecycle status to QuickBooks delivery/display fields."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

try:
    from quickbooks.objects.base import EmailAddress, CustomerMemo
except ModuleNotFoundError:
    EmailAddress = None
    CustomerMemo = None

# SVR statuses where the invoice has been issued to the customer.
_SVR_ISSUED_STATUSES = frozenset({'sent', 'viewed', 'partial', 'paid', 'overdue'})


def _customer_bill_email(local_invoice) -> str:
    customer = getattr(local_invoice, 'customer', None)
    if not customer:
        return ''
    email = getattr(customer, 'email', None) or ''
    if callable(email):
        try:
            email = email()
        except Exception:
            email = ''
    if not email and getattr(customer, 'user', None):
        email = getattr(customer.user, 'email', '') or ''
    return str(email).strip()


def apply_invoice_communication_status(qb_invoice, local_invoice, *, us_company=False):
    """
    Align QBO invoice delivery status with SVR.

    QBO shows separate concepts in the UI:
    - Open / Overdue / Paid → balance (financial)
    - Not sent / Sent / Viewed → delivery (EmailStatus + tracking)

    US AST companies reject EmailStatus=EmailSent on programmatic saves (error 2010).
    """
    if us_company:
        return

    status = getattr(local_invoice, 'status', None)

    if status in _SVR_ISSUED_STATUSES:
        qb_invoice.EmailStatus = 'EmailSent'
    elif status in ('draft', 'proforma', 'void', 'refunded'):
        qb_invoice.EmailStatus = 'NotSet'

    email = _customer_bill_email(local_invoice)
    if email and status in _SVR_ISSUED_STATUSES and EmailAddress is not None:
        bill_email = EmailAddress()
        bill_email.Address = email
        qb_invoice.BillEmail = bill_email

    customer_notes = getattr(local_invoice, 'customer_notes', None)
    if customer_notes and CustomerMemo is not None:
        memo = CustomerMemo()
        memo.value = customer_notes
        qb_invoice.CustomerMemo = memo


def set_qbo_customer_memo(qb_txn, text):
    """Set CustomerMemo using a proper QBO object (not a raw dict)."""
    if text and CustomerMemo is not None:
        memo = CustomerMemo()
        memo.value = text
        qb_txn.CustomerMemo = memo
