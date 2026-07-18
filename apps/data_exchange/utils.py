"""Shared helpers for import/export parsing and validation."""
from __future__ import annotations

import hashlib
import re
from typing import Any

VIN_REGEX = re.compile(r'^[A-HJ-NPR-Z0-9]{17}$')
BUSINESS_TOKENS = (
    'LTD', 'LIMITED', 'LLC', 'INC', 'COMPANY', 'CO', 'GHANA', 'GH', 'BANK',
    'MINISTRY', 'SERVICES', 'ENTERPRISE', 'ENTERPRISES', 'GROUP', 'PLC',
    'ENERGY', 'ENERGIES', 'BREWERY', 'LIMITED.', 'CORPORATION', 'CORP',
    'ASSOCIATION', 'AUTHORITY', 'AGENCY', 'HOSPITAL', 'UNIVERSITY', 'SCHOOL',
    'CHURCH', 'TEMPLE', 'CLUB', 'UNION', 'TRUST', 'FOUNDATION', 'FARMS',
    'FARM', 'TRANSPORT', 'LOGISTICS', 'HOLDINGS', 'INVESTMENT', 'INVESTMENTS',
    'TRADING', 'CONSTRUCTION', 'ENGINEERING', 'TECHNOLOGY', 'TECHNOLOGIES',
)


def clean_value(value: Any) -> str:
    if value is None:
        return ''
    return str(value).strip()


def normalize_header(value: Any) -> str:
    text = clean_value(value).lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')


def normalize_phone(value: Any) -> str:
    """
    Normalize a phone for matching.

    ERP cells often contain multiple numbers ("0244... / 0552..."). Use the
    first plausible number so matching does not concatenate digits.
    """
    text = clean_value(value)
    if not text:
        return ''
    # Prefer explicit multi-value separators before falling back to full digits.
    parts = re.split(r'[/;,|]|\bor\b', text, flags=re.IGNORECASE)
    candidates = parts if len(parts) > 1 else [text]
    for part in candidates:
        digits = re.sub(r'\D+', '', part)
        if not digits:
            continue
        if digits.startswith('233') and len(digits) >= 12:
            digits = '0' + digits[3:]
        # Ghana mobile/local style, or other compact international numbers.
        if len(digits) >= 9:
            return digits[:15]
    digits = re.sub(r'\D+', '', text)
    if digits.startswith('233') and len(digits) >= 12:
        digits = '0' + digits[3:]
    return digits[:15]


def normalize_name(value: Any) -> str:
    text = re.sub(r'\s+', ' ', clean_value(value).upper())
    return text


def is_business_name(name: str) -> bool:
    upper = normalize_name(name)
    if not upper:
        return False
    words = [w.strip('.') for w in upper.replace('.', ' ').split() if w.strip('.')]
    word_set = set(words)
    for token in BUSINESS_TOKENS:
        token_norm = token.replace('.', '')
        if token_norm in word_set or token in upper:
            return True
    honorifics = {'MR', 'MRS', 'MS', 'MISS', 'DR', 'PROF', 'PROFESSOR', 'REV'}
    if words and words[0] in honorifics:
        return False
    # Org markers that are not personal names
    if any(ch.isdigit() for ch in upper) or '&' in upper or '/' in upper:
        return True
    # 3+ tokens without honorific → usually a company/fleet label in ERP dumps
    if len(words) >= 3:
        return True
    # Single-token org brands (BOMARTS, ECOBANK)
    if len(words) == 1 and len(words[0]) >= 5 and words[0].isalpha():
        return True
    # Two short acronym-style tokens (MTN GH, GCB BANK already token-matched)
    if len(words) == 2 and all(len(w) <= 4 and w.isalpha() for w in words):
        return True
    return False


def split_person_name(full_name: str) -> tuple[str, str]:
    parts = [p for p in clean_value(full_name).split() if p]
    if not parts:
        return 'Unknown', 'Customer'
    # Drop common honorifics
    honorifics = {'MR', 'MRS', 'MS', 'MISS', 'DR', 'PROF', 'PROFESSOR', 'REV'}
    filtered = [p for p in parts if p.upper().rstrip('.') not in honorifics]
    if not filtered:
        filtered = parts
    if len(filtered) == 1:
        return filtered[0][:150], 'Customer'
    return filtered[0][:150], ' '.join(filtered[1:])[:150]


def is_valid_vin(vin: str) -> bool:
    return bool(VIN_REGEX.match(vin or ''))


def repair_vin(vin: str) -> str | None:
    """
    Attempt to salvage a VIN with common ERP/OCR mistakes:
    I→1, O→0, Q→0, strip spaces/dashes. Returns repaired VIN or None.
    """
    raw = clean_value(vin).upper().replace(' ', '').replace('-', '')
    if not raw:
        return None
    if is_valid_vin(raw):
        return raw
    repaired = (
        raw.replace('I', '1')
        .replace('O', '0')
        .replace('Q', '0')
    )
    if is_valid_vin(repaired):
        return repaired
    return None


def make_placeholder_vin(seed: str, used: set[str] | None = None) -> str:
    """
    Build a deterministic 17-char VIN-safe placeholder from a seed (e.g. plate).
    Uses only A-H, J-N, P-R-Z, 0-9 (no I/O/Q).
    """
    alphabet = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'
    digest = hashlib.sha1(clean_value(seed).upper().encode('utf-8')).hexdigest()
    chars = []
    for i in range(0, len(digest), 2):
        chars.append(alphabet[int(digest[i:i + 2], 16) % len(alphabet)])
        if len(chars) >= 17:
            break
    while len(chars) < 17:
        chars.append('0')
    vin = ''.join(chars[:17])
    if used is None:
        return vin
    # Ensure uniqueness within batch / against provided set
    attempt = 0
    candidate = vin
    while candidate in used:
        attempt += 1
        tweak = alphabet[attempt % len(alphabet)]
        candidate = (vin[:16] + tweak) if attempt < len(alphabet) else make_placeholder_vin(f'{seed}-{attempt}')
        if attempt > 500:
            candidate = make_placeholder_vin(f'{seed}-{attempt}-{digest}')
            break
    used.add(candidate)
    return candidate


def make_import_email(name: str, phone: str, row_number: int) -> str:
    """Deterministic placeholder email when source data has no email."""
    seed = f'{normalize_name(name)}|{normalize_phone(phone)}|{row_number}'
    digest = hashlib.sha1(seed.encode('utf-8')).hexdigest()[:12]
    return f'import.{digest}@noemail.local'


def map_engine_type(raw: str) -> str:
    value = clean_value(raw).upper()
    if 'DIESEL' in value:
        return 'diesel'
    if 'ELECTRIC' in value or value == 'EV':
        return 'electric'
    if 'HYBRID' in value:
        return 'hybrid'
    return 'gasoline'


def map_transmission_type(raw: str) -> str:
    value = clean_value(raw).upper()
    if 'MANUAL' in value:
        return 'manual'
    if 'CVT' in value:
        return 'cvt'
    if 'DUAL' in value:
        return 'dual_clutch'
    return 'automatic'


def map_vehicle_type(raw: str) -> str:
    value = clean_value(raw).upper()
    if 'TRUCK' in value or 'PICK' in value:
        return 'truck'
    if 'SUV' in value:
        return 'suv'
    if 'MOTOR' in value or 'BIKE' in value:
        return 'motorcycle'
    if 'VAN' in value:
        return 'minivan'
    if 'PASSENGER' in value or 'SALOON' in value or 'SEDAN' in value:
        return 'saloon'
    return 'other'


def parse_year(value: Any, default: int | None = None) -> int | None:
    text = clean_value(value)
    if not text:
        return default
    match = re.search(r'(19|20)\d{2}', text)
    if not match:
        try:
            year = int(float(text))
        except (TypeError, ValueError):
            return default
    else:
        year = int(match.group(0))
    if 1900 <= year <= 2100:
        return year
    return default


def detect_format(headers: list[str]) -> str:
    """
    Return 'erp_vehicles', 'native_customers_vehicles', 'native_customers',
    'native_vehicles', or 'unknown'.
    """
    normalized = {normalize_header(h) for h in headers if h}
    if {'reg_no', 'cust_name', 'make', 'model'} <= normalized or (
        'cust_name' in normalized and ('engvin' in normalized or 'reg_no' in normalized)
    ):
        return 'erp_vehicles'

    has_vehicle_core = (
        ('make' in normalized and 'model' in normalized)
        and ('vin' in normalized or 'license_plate' in normalized or 'reg_no' in normalized)
    )
    has_customer_cols = bool(
        {'first_name', 'last_name', 'email', 'customer_name', 'company_name', 'phone'} & normalized
    )

    # Preferred joint template: customer_name/company_name + license_plate/vin + make/model
    # (owner email column is optional when customer columns are present).
    if has_vehicle_core and (
        'customer_name' in normalized
        or 'company_name' in normalized
        or ({'first_name', 'last_name'} <= normalized)
        or ('owner' in normalized and has_customer_cols)
    ):
        return 'native_customers_vehicles'

    if 'owner' in normalized and has_vehicle_core:
        return 'native_vehicles'
    if {'first_name', 'last_name', 'email'} <= normalized:
        return 'native_customers'
    return 'unknown'
