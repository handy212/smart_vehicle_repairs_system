"""
Currency formatting for notification templates (Python .format() rendering).
"""
from decimal import Decimal
from typing import Any, Dict, Optional, Union

from apps.accounts.settings_utils import get_payment_settings

Amount = Union[int, float, Decimal, str, None]


def get_currency_symbol() -> str:
    return get_payment_settings().get('currency_symbol', '$')


def format_money(amount: Amount, include_symbol: bool = True) -> str:
    """Format amount with system currency symbol (e.g. ₵1,234.56)."""
    symbol = get_currency_symbol()
    try:
        value = float(amount) if amount is not None and amount != '' else 0.0
        if include_symbol:
            return f"{symbol}{value:,.2f}"
        return f"{value:,.2f}"
    except (ValueError, TypeError):
        return f"{symbol}0.00" if include_symbol else "0.00"


def enrich_money_context(
    context: Dict[str, Any],
    mapping: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Add *_display formatted money fields for raw numeric context keys.

    mapping: raw_key -> display_key (default: key -> f"{key}_display")
    """
    if mapping is None:
        money_keys = (
            'total', 'total_amount', 'amount', 'balance_due', 'balance_remaining',
            'estimate_amount', 'amount_paid', 'charge_amount', 'expected_cost',
        )
        mapping = {k: f'{k}_display' for k in money_keys}

    enriched = dict(context)
    enriched.setdefault('currency_symbol', get_currency_symbol())

    for raw_key, display_key in mapping.items():
        if raw_key in enriched and display_key not in enriched:
            enriched[display_key] = format_money(enriched[raw_key])

    return enriched
