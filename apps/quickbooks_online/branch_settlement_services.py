"""Provision branch-scoped settlement GL accounts from QuickBooks Online."""

from __future__ import annotations

import logging
import re

from django.db import transaction

from apps.accounting.models import Account
from apps.branches.models import Branch
from apps.quickbooks_online.owner_coa_services import find_best_qbo_account
from apps.quickbooks_online.owner_coa_specs import (
    BRANCH_DEPARTMENT_PATTERNS,
    BRANCH_SETTLEMENT_KINDS,
)

logger = logging.getLogger(__name__)


def _branch_keywords(branch: Branch) -> list[str]:
    keywords = []
    for source in (branch.city, branch.name, branch.code):
        value = (source or '').strip().lower()
        if value and value not in keywords:
            keywords.append(value)
    for key, patterns in BRANCH_DEPARTMENT_PATTERNS.items():
        if key in ' '.join(keywords):
            keywords.extend(p for p in patterns if p not in keywords)
    return keywords


def _normalize_name(value: str) -> str:
    return re.sub(r'\s+', ' ', (value or '').strip().lower())


def _qbo_account_number(qbo_account) -> str:
    for attr in ('AcctNum', 'AccountSubType', 'account_number'):
        raw = getattr(qbo_account, attr, None)
        if raw:
            return str(raw).strip()
    return ''


def _matches_branch(qbo_account, keywords: list[str]) -> bool:
    name = _normalize_name(getattr(qbo_account, 'Name', '') or '')
    if not name:
        return False
    return any(keyword and keyword in name for keyword in keywords)


def _matches_settlement_kind(qbo_account, kind_spec: dict) -> bool:
    name = _normalize_name(getattr(qbo_account, 'Name', '') or '')
    if not name:
        return False
    account_type = getattr(qbo_account, 'AccountType', '') or ''
    allowed_types = kind_spec.get('qbo_account_types') or ['Bank']
    if account_type not in allowed_types:
        return False
    return any(sub in name for sub in kind_spec.get('name_substrings', ()))


def find_qbo_settlement_account(qbo_accounts, branch: Branch, kind_key: str):
    kind_spec = BRANCH_SETTLEMENT_KINDS[kind_key]
    keywords = _branch_keywords(branch)
    candidates = [
        acct for acct in qbo_accounts
        if _matches_branch(acct, keywords) and _matches_settlement_kind(acct, kind_spec)
    ]
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    best, score = find_best_qbo_account(
        candidates,
        {
            'name_substrings': list(kind_spec.get('name_substrings', ())) + keywords,
            'account_types': kind_spec.get('qbo_account_types', ['Bank']),
        },
    )
    return best if score > 0 else candidates[0]


def _unique_account_code(preferred: str, qbo_name: str) -> str:
    preferred = (preferred or '').strip()
    if preferred and not Account.objects.filter(code=preferred).exists():
        return preferred
    slug = re.sub(r'[^A-Z0-9]+', '-', (qbo_name or 'SETTLE').upper()).strip('-')[:18]
    candidate = slug or 'SETTLE'
    suffix = 1
    while Account.objects.filter(code=candidate).exists():
        candidate = f'{slug}-{suffix}'[:20]
        suffix += 1
    return candidate


def provision_branch_settlement_accounts(
    branch: Branch,
    *,
    qbo_accounts=None,
    dry_run=False,
    map_qbo=True,
    kinds=None,
):
    """
    Create or update SVR settlement accounts for a branch from QBO bank/cash accounts.

    Returns dict with created, updated, mapped, skipped keys.
    """
    kind_keys = kinds or list(BRANCH_SETTLEMENT_KINDS.keys())
    result = {'created': [], 'updated': [], 'mapped': [], 'skipped': [], 'errors': []}

    if qbo_accounts is None and map_qbo:
        from apps.quickbooks_online.mapping_services import get_account_mapping_service

        rows, error = get_account_mapping_service().list_accounts()
        if error:
            result['errors'].append(error)
            return result
        qbo_accounts = [
            type('QBOAccountRow', (), {
                'Id': row['id'],
                'Name': row['name'],
                'AcctNum': row.get('account_number') or row.get('qbo_account_number') or '',
                'AccountType': row.get('account_type') or 'Bank',
            })()
            for row in rows
            if (row.get('account_type') or '') in {'Bank', 'Other Current Asset'}
        ]

    mapping_service = None
    if map_qbo:
        from apps.quickbooks_online.mapping_services import get_account_mapping_service

        mapping_service = get_account_mapping_service()

    for kind_key in kind_keys:
        kind_spec = BRANCH_SETTLEMENT_KINDS.get(kind_key)
        if not kind_spec:
            result['skipped'].append(f'{kind_key} (unknown kind)')
            continue

        qbo_account = find_qbo_settlement_account(qbo_accounts or [], branch, kind_key) if map_qbo else None
        if map_qbo and qbo_account is None:
            result['skipped'].append(f'{branch.name}:{kind_key} (no QBO match)')
            continue

        qbo_name = getattr(qbo_account, 'Name', kind_spec['label']) if qbo_account else f'{branch.name} {kind_spec["label"]}'
        qbo_number = _qbo_account_number(qbo_account) if qbo_account else ''
        preferred_code = qbo_number or f'{branch.code}-{kind_key}'.upper()[:20]

        existing = Account.objects.filter(branch=branch, name=qbo_name).first()
        if not existing and qbo_number:
            existing = Account.objects.filter(code=qbo_number).first()

        defaults = {
            'name': qbo_name,
            'account_type': 'asset',
            'balance_type': 'debit',
            'account_subtype': kind_spec['account_subtype'],
            'is_till_enabled': kind_spec['is_till_enabled'],
            'is_active': True,
            'branch': branch,
        }

        if dry_run:
            action = 'update' if existing else 'create'
            result[f'{action}d'].append(f'{branch.name}:{kind_key} -> {qbo_name}')
            continue

        with transaction.atomic():
            if existing:
                for field, value in defaults.items():
                    setattr(existing, field, value)
                existing.save()
                account = existing
                result['updated'].append(f'{account.code} ({kind_key})')
            else:
                code = _unique_account_code(preferred_code, qbo_name)
                account = Account.objects.create(code=code, **defaults)
                result['created'].append(f'{account.code} ({kind_key})')

            if map_qbo and qbo_account and mapping_service:
                ok, map_error = mapping_service.map_row(
                    'svr_account',
                    str(account.id),
                    qbo_account_id=str(qbo_account.Id),
                )
                if ok:
                    mapping = mapping_service.get_mapping('svr_account', str(account.id))
                    if mapping:
                        mapping.svr_account = account
                        mapping.save(update_fields=['svr_account', 'updated_at'])
                    result['mapped'].append(f'{account.code} -> QBO {qbo_account.Id}')
                else:
                    result['skipped'].append(f'{account.code} QBO map ({map_error})')

    return result


def provision_all_active_branches(*, dry_run=False, map_qbo=True):
    combined = {'created': [], 'updated': [], 'mapped': [], 'skipped': [], 'errors': []}
    for branch in Branch.objects.filter(is_active=True).order_by('name'):
        partial = provision_branch_settlement_accounts(
            branch,
            dry_run=dry_run,
            map_qbo=map_qbo,
        )
        for key in combined:
            combined[key].extend(partial.get(key, []))
    return combined
