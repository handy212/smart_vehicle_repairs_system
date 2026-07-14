"""
Phone number helpers for SMS / WhatsApp (Ghana-first E.164).
"""
from __future__ import annotations

import re
from typing import Optional


DEFAULT_COUNTRY_CODE = "233"


def digits_only(value: Optional[str]) -> str:
    if not value:
        return ""
    return re.sub(r"\D", "", str(value))


def normalize_phone_e164(
    phone: Optional[str],
    *,
    default_country_code: str = DEFAULT_COUNTRY_CODE,
) -> str:
    """
    Normalize to E.164 digits without leading '+'.
    Ghana local mobiles (0XXXXXXXXX / 9 digits) map to 233XXXXXXXXX.
    """
    digits = digits_only(phone)
    if not digits:
        return ""

    cc = digits_only(default_country_code) or DEFAULT_COUNTRY_CODE

    if digits.startswith(cc):
        return digits
    if digits.startswith("00") and len(digits) > 4:
        return digits[2:]
    if digits.startswith("0") and len(digits) == 10:
        return f"{cc}{digits[1:]}"
    if len(digits) == 9 and cc == DEFAULT_COUNTRY_CODE:
        return f"{cc}{digits}"
    return digits


def format_phone_display(phone: Optional[str], *, default_country_code: str = DEFAULT_COUNTRY_CODE) -> str:
    """Human-friendly display like +233 24 123 4567."""
    e164 = normalize_phone_e164(phone, default_country_code=default_country_code)
    if not e164:
        return ""
    if e164.startswith(DEFAULT_COUNTRY_CODE) and len(e164) == 12:
        local = e164[3:]
        return f"+{DEFAULT_COUNTRY_CODE} {local[:2]} {local[2:5]} {local[5:]}"
    return f"+{e164}"
