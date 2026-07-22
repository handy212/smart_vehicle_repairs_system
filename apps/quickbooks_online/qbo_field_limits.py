"""QuickBooks Online field length limits and string sanitization for outbound sync."""

import re

QBO_DOC_NUMBER_MAX_LENGTH = 21
# QBO rejects DisplayName/CompanyName/GivenName/FamilyName with characters like ':' (error 2040).
_QBO_NAME_ILLEGAL_RE = re.compile(r'[:<>\"\\]')
_QBO_NAME_WHITESPACE_RE = re.compile(r'\s+')


def qbo_doc_number(value: str | None) -> str | None:
    """
    Normalize a value for QBO DocNumber (max 21 characters).

    SVR numbers are {PREFIX}-{branch}-{seq} (e.g. INV-ACC-000001). Legacy
    year-prefixed values (BILL-2026-ACCRA-000001) may still need truncation.
    """
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:QBO_DOC_NUMBER_MAX_LENGTH]


def qbo_safe_name(value: str | None, *, max_length: int = 100) -> str:
    """Strip QBO-illegal characters from person/company/display names."""
    if value is None:
        return ''
    text = _QBO_NAME_ILLEGAL_RE.sub(' -', str(value))
    text = _QBO_NAME_WHITESPACE_RE.sub(' ', text).strip(' -')
    return text[:max_length]
