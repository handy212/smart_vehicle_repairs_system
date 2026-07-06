"""Rules for when operational invoice documents become financially locked."""


def invoice_is_financially_locked(invoice) -> bool:
    """
    Invoices stay editable after send/GL post until money or credit has been applied.
    """
    if invoice.status in ('void', 'refunded'):
        return True
    if (invoice.amount_paid or 0) > 0:
        return True
    if invoice.payments.filter(status='completed').exists():
        return True
    if invoice.credit_note_applications.exists():
        return True
    return False
