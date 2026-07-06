"""Shared QuickBooks account number helpers (no service imports)."""

from __future__ import annotations

import re


def account_number_from_name(name: str) -> str:
    """Extract leading account number tokens like 650, 118.4, 12100 from QBO account name."""
    if not name:
        return ''
    match = re.match(r'^[\s]*([0-9]+(?:[.\-][0-9a-z]+)?)', name.strip(), re.IGNORECASE)
    return match.group(1) if match else ''


def extract_qbo_account_number(account) -> str:
    """Return QBO AcctNum, or a number parsed from the account display name."""
    acct_num = (getattr(account, 'AcctNum', None) or '').strip()
    if acct_num:
        return acct_num
    return account_number_from_name(getattr(account, 'Name', '') or '')


# Backward-compatible alias used by owner COA matching.
_account_number_from_name = account_number_from_name
