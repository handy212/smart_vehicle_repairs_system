"""Migrate legacy shared Main Cash till accounts to per-branch 114x rows."""

from __future__ import annotations

import logging

from django.db import transaction

from apps.accounting.models import Account
from apps.branches.models import Branch
from apps.quickbooks_online.branch_settlement_services import provision_branch_settlement_accounts
from apps.quickbooks_online.owner_coa_specs import BRANCH_MAIN_CASH_CODES

logger = logging.getLogger(__name__)


def resolve_main_cash_code(branch: Branch) -> str | None:
    city = (branch.city or '').strip().lower()
    name = (branch.name or '').strip().lower()
    for key, code in BRANCH_MAIN_CASH_CODES.items():
        if key in city or key in name:
            return code
    return None


def _legacy_shared_main_cash_queryset():
    return Account.objects.filter(
        branch__isnull=True,
        account_type='asset',
        account_subtype='cash',
        is_till_enabled=True,
        is_active=True,
    ).filter(name__icontains='main cash')


def migrate_branch_main_cash(
    branch: Branch,
    *,
    dry_run=False,
    map_qbo=True,
):
    """
    Ensure a branch has its own till-enabled Main Cash account (114x series).

    Tries QBO auto-match first, then creates a placeholder with the branch code.
    """
    result = {'created': [], 'updated': [], 'mapped': [], 'skipped': [], 'errors': []}
    preferred_code = resolve_main_cash_code(branch)

    existing = None
    if preferred_code:
        existing = Account.objects.filter(code=preferred_code).first()
    if existing is None:
        existing = Account.objects.filter(
            branch=branch,
            account_subtype='cash',
            is_till_enabled=True,
            is_active=True,
        ).first()

    if map_qbo:
        partial = provision_branch_settlement_accounts(
            branch,
            dry_run=dry_run,
            map_qbo=True,
            kinds=['main_cash'],
        )
        for key in result:
            result[key].extend(partial.get(key, []))
        if partial.get('created') or partial.get('updated'):
            return result

    display_name = f'{branch.name} Main Cash'
    defaults = {
        'name': display_name,
        'account_type': 'asset',
        'balance_type': 'debit',
        'account_subtype': 'cash',
        'is_till_enabled': True,
        'is_active': True,
        'branch': branch,
    }

    if dry_run:
        action = 'update' if existing else 'create'
        code = existing.code if existing else (preferred_code or f'{branch.code}-MAIN-CASH')
        result[f'{action}d'].append(f'{branch.name}: main_cash -> {code} {display_name}')
        return result

    with transaction.atomic():
        if existing:
            if existing.branch_id and existing.branch_id != branch.id:
                result['skipped'].append(
                    f'{branch.name}: code {existing.code} belongs to another branch'
                )
                return result
            for field, value in defaults.items():
                setattr(existing, field, value)
            existing.save()
            result['updated'].append(f'{existing.code} (main_cash)')
            return result

        code = preferred_code or f'{branch.code}-MC'[:20]
        suffix = 1
        while Account.objects.filter(code=code).exists():
            code = f'{preferred_code or branch.code}-MC{suffix}'[:20]
            suffix += 1
        account = Account.objects.create(code=code, **defaults)
        result['created'].append(f'{account.code} (main_cash)')

    return result


def deactivate_legacy_shared_main_cash(*, dry_run=False):
    """
    Deactivate unassigned till-enabled Main Cash accounts once branches have their own.

    Old shared rows are left in the database but marked inactive.
    """
    branch_main_cash_exists = Account.objects.filter(
        branch__isnull=False,
        account_subtype='cash',
        is_till_enabled=True,
        is_active=True,
    ).exists()
    if not branch_main_cash_exists:
        return {'deactivated': [], 'skipped': ['No branch main cash accounts yet']}

    legacy = list(_legacy_shared_main_cash_queryset())
    if not legacy:
        return {'deactivated': [], 'skipped': ['No legacy shared main cash found']}

    codes = [a.code for a in legacy]
    if dry_run:
        return {'deactivated': codes, 'skipped': []}

    count = _legacy_shared_main_cash_queryset().update(is_active=False)
    return {'deactivated': codes[:count], 'skipped': []}


def migrate_all_branch_main_cash(*, dry_run=False, map_qbo=True, deactivate_legacy=True):
    combined = {'created': [], 'updated': [], 'mapped': [], 'skipped': [], 'errors': [], 'deactivated': []}
    for branch in Branch.objects.filter(is_active=True).order_by('name'):
        partial = migrate_branch_main_cash(branch, dry_run=dry_run, map_qbo=map_qbo)
        for key in ('created', 'updated', 'mapped', 'skipped', 'errors'):
            combined[key].extend(partial.get(key, []))

    if deactivate_legacy:
        legacy = deactivate_legacy_shared_main_cash(dry_run=dry_run)
        combined['deactivated'] = legacy.get('deactivated', [])
        combined['skipped'].extend(legacy.get('skipped', []))

    return combined
