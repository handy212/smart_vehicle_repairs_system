"""QuickBooks Online field length limits and string sanitization for outbound sync."""

import hashlib
import re

QBO_DOC_NUMBER_MAX_LENGTH = 21
# QBO rejects DisplayName/CompanyName/GivenName/FamilyName with characters like ':' (error 2040).
_QBO_NAME_ILLEGAL_RE = re.compile(r'[:<>\"\\]')
_QBO_NAME_WHITESPACE_RE = re.compile(r'\s+')
_STRUCTURED_DOC_NUMBER_RE = re.compile(r'^(?P<prefix>[A-Za-z]+)-(?P<middle>.+)-(?P<sequence>\d+)$')


def _compact_doc_middle(value: str, max_length: int) -> str:
    if len(value) <= max_length:
        return value

    digest = hashlib.sha1(value.encode('utf-8')).hexdigest().upper()
    if max_length <= 0:
        return ''
    if max_length == 1:
        return digest[:1]

    checksum_length = min(2, max_length)
    keep_length = max_length - checksum_length
    return f"{value[:keep_length]}{digest[:checksum_length]}"


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
    if len(text) <= QBO_DOC_NUMBER_MAX_LENGTH:
        return text

    match = _STRUCTURED_DOC_NUMBER_RE.match(text)
    if match:
        prefix = match.group('prefix')
        middle = match.group('middle')
        sequence = match.group('sequence')
        fixed_length = len(prefix) + len(sequence) + 2
        middle_max_length = QBO_DOC_NUMBER_MAX_LENGTH - fixed_length
        if middle_max_length > 0:
            compact_middle = _compact_doc_middle(middle, middle_max_length)
            return f"{prefix}-{compact_middle}-{sequence}"

    return text[:QBO_DOC_NUMBER_MAX_LENGTH]


def qbo_safe_name(value: str | None, *, max_length: int = 100) -> str:
    """Strip QBO-illegal characters from person/company/display names."""
    if value is None:
        return ''
    text = _QBO_NAME_ILLEGAL_RE.sub(' -', str(value))
    text = _QBO_NAME_WHITESPACE_RE.sub(' ', text).strip(' -')
    return text[:max_length]
