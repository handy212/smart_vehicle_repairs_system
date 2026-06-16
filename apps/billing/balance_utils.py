"""Operational AR/AP balance helpers — cap paid at document total; due never negative."""
from decimal import Decimal


def operational_collection_balances(total, collected):
    """
    Derive amount_paid and amount_due from collected cash/credits.

    Excess collections (overpayments) are not stored on the invoice/bill;
    they remain on Payment records and post to customer prepayment liability.
    """
    total = Decimal(str(total or 0)).quantize(Decimal('0.01'))
    collected = Decimal(str(collected or 0)).quantize(Decimal('0.01'))
    amount_paid = min(collected, total)
    amount_due = max(Decimal('0'), (total - collected).quantize(Decimal('0.01')))
    return amount_paid, amount_due
