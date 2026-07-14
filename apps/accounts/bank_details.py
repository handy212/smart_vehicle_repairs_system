"""Parse free-text invoice bank details into separate payment accounts."""
from __future__ import annotations

import re
from typing import TypedDict


class BankAccountBlock(TypedDict):
    title: str
    body: str


# New account when a line looks like the start of another bank / wallet entry.
_ACCOUNT_START_RE = re.compile(
    r'^(?:'
    r'BANK\s*NAME\s*:'
    r'|BANK\s*:'
    r'|MTN\s*MOMO'
    r'|MOBILE\s*MONEY'
    r'|MOMO\s*(?:NO|NUMBER|NUM|#)?'
    r'|WALLET\s*:'
    r'|PAYMENT\s*(?:METHOD|OPTION)\s*:'
    r')',
    re.IGNORECASE,
)

_BANK_TITLE_RE = re.compile(
    r'^BANK\s*NAME\s*:\s*([^|\n]+?)(?:\s*\||$)',
    re.IGNORECASE,
)

_MOMO_TITLE_RE = re.compile(
    r'^(MTN\s*MOMO|MOBILE\s*MONEY|MOMO)\b',
    re.IGNORECASE,
)


def _infer_title(lines: list[str], index: int) -> str:
    first = (lines[0] if lines else '').strip()
    bank_match = _BANK_TITLE_RE.match(first)
    if bank_match:
        return bank_match.group(1).strip().rstrip('.')
    momo_match = _MOMO_TITLE_RE.match(first)
    if momo_match:
        return momo_match.group(1).upper().replace('  ', ' ')
    return f'Payment option {index}'


def _split_lines_into_accounts(lines: list[str]) -> list[list[str]]:
    """Split on blank lines, or on payment-start lines when packed together."""
    blank_groups: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if not line.strip():
            if current:
                blank_groups.append(current)
                current = []
            continue
        current.append(line.rstrip())
    if current:
        blank_groups.append(current)

    if len(blank_groups) > 1:
        return blank_groups

    packed = blank_groups[0] if blank_groups else []
    refined: list[list[str]] = []
    buf: list[str] = []
    for line in packed:
        if buf and _ACCOUNT_START_RE.match(line.strip()):
            refined.append(buf)
            buf = [line]
        else:
            buf.append(line)
    if buf:
        refined.append(buf)
    return refined


def parse_invoice_bank_accounts(text: str | None) -> list[BankAccountBlock]:
    """
    Split invoice bank details text into one block per bank / MoMo account.

    Supports:
    - blank-line separated blocks
    - packed blocks that each start with BANK NAME: / MTN MOMO / etc.
    """
    if not text or not str(text).strip():
        return []

    normalized = str(text).replace('\r\n', '\n').replace('\r', '\n')
    line_list = normalized.split('\n')
    groups = _split_lines_into_accounts(line_list)

    accounts: list[BankAccountBlock] = []
    for index, group in enumerate(groups, start=1):
        if not group:
            continue
        accounts.append(
            {
                'title': _infer_title(group, index),
                'body': '\n'.join(group),
            }
        )
    return accounts
