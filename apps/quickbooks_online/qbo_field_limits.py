"""QuickBooks Online field length limits for outbound sync."""

QBO_DOC_NUMBER_MAX_LENGTH = 21


def qbo_doc_number(value: str | None) -> str | None:
    """
    Normalize a value for QBO DocNumber (max 21 characters).

    SVR document numbers use {PREFIX}-{YYYY}-{branch}-{seq} and can exceed
    QBO's limit when branch codes are long (e.g. BILL-2026-ACCRA-000001 = 22).
    """
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:QBO_DOC_NUMBER_MAX_LENGTH]
