"""Repair branch settlement GL ↔ QBO mapping conflicts."""

from __future__ import annotations

import logging

from django.db import transaction

from apps.accounting.models import Account
from apps.accounting.settlement_accounts import SETTLEMENT_ACCOUNT_SUBTYPES
from apps.quickbooks_online.models import QBOAccountMapping
from apps.quickbooks_online.owner_coa_services import find_best_qbo_account
from apps.quickbooks_online.owner_coa_specs import (
    PAYMENT_METHOD_QBO_PATTERNS,
    SVR_ACCOUNT_QBO_PATTERNS,
)

logger = logging.getLogger(__name__)

SETTLEMENT_MAPPING_KINDS = frozenset({
    'control_account',
    'payment_method',
    'vendor_payment_method',
    'invoice_line_type',
    'bill_line_kind',
})


def _qbo_account_rows(mapping_service):
    rows, error = mapping_service.list_accounts()
    if error:
        return None, error

    class Row:
        def __init__(self, data):
            self.Id = data['id']
            self.Name = data['name']
            self.AcctNum = data.get('account_number') or ''
            self.AccountType = data.get('account_type') or ''

    return [Row(row) for row in rows], None


def _find_qbo_for_svr_account(svr_account, qbo_accounts):
    patterns = SVR_ACCOUNT_QBO_PATTERNS.get(svr_account.code)
    if patterns:
        account, score = find_best_qbo_account(qbo_accounts, patterns)
        if account and score > 0:
            return account

    normalized_name = (svr_account.name or '').strip().lower()
    account_number = (svr_account.code or '').strip()
    for account in qbo_accounts:
        qbo_name = (account.Name or '').strip().lower()
        qbo_number = (getattr(account, 'AcctNum', '') or '').strip()
        if account_number and qbo_number == account_number:
            return account
        if normalized_name and normalized_name in qbo_name:
            return account
    return None


def _clear_mappings_for_qbo_account(qbo_account_id, *, keep_kind=None, keep_key=None, dry_run=False):
    cleared = []
    qs = QBOAccountMapping.objects.filter(qbo_account_id=str(qbo_account_id))
    for mapping in qs:
        if keep_kind and keep_key and mapping.mapping_kind == keep_kind and mapping.mapping_key == keep_key:
            continue
        cleared.append(f'{mapping.mapping_kind}:{mapping.mapping_key} ({mapping.qbo_account_name})')
        if not dry_run:
            mapping.delete()
    return cleared


def _has_svr_mapping(svr_account) -> bool:
    return QBOAccountMapping.objects.filter(
        mapping_kind='svr_account',
        mapping_key=str(svr_account.id),
        qbo_account_id__gt='',
    ).exists()


def remap_settlement_svr_account(svr_account, *, mapping_service, qbo_accounts, dry_run=False):
    """Map one branch settlement SVR account to its QBO bank row."""
    result = {'account_code': svr_account.code, 'cleared': [], 'mapped': None, 'skipped': None}

    if _has_svr_mapping(svr_account):
        result['skipped'] = 'already mapped'
        return result

    qbo_account = _find_qbo_for_svr_account(svr_account, qbo_accounts)
    if not qbo_account:
        result['skipped'] = 'no QBO match'
        return result

    result['cleared'] = _clear_mappings_for_qbo_account(
        qbo_account.Id,
        keep_kind='svr_account',
        keep_key=str(svr_account.id),
        dry_run=dry_run,
    )

    if dry_run:
        result['mapped'] = f'{svr_account.code} -> QBO {qbo_account.Id} {qbo_account.Name}'
        return result

    with transaction.atomic():
        ok, error = mapping_service.map_row(
            'svr_account',
            str(svr_account.id),
            qbo_account_id=str(qbo_account.Id),
        )
        if not ok:
            result['skipped'] = error or 'map failed'
            return result
        mapping = mapping_service.get_mapping('svr_account', str(svr_account.id))
        if mapping:
            mapping.svr_account = svr_account
            mapping.save(update_fields=['svr_account', 'updated_at'])
        result['mapped'] = f'{svr_account.code} -> QBO {qbo_account.Id} {qbo_account.Name}'

    return result


def fix_vendor_cash_mapping(*, mapping_service, qbo_accounts, dry_run=False):
    """Point vendor bill cash payments at the generic cash receipt account, not a branch leaf."""
    result = {'cleared': [], 'mapped': None, 'skipped': None}
    current = mapping_service.get_mapping('vendor_payment_method', 'cash')
    target, score = find_best_qbo_account(qbo_accounts, PAYMENT_METHOD_QBO_PATTERNS['cash'])
    if not target or score <= 0:
        result['skipped'] = 'no generic cash QBO account'
        return result

    if current and current.qbo_account_id == str(target.Id):
        result['skipped'] = 'already correct'
        return result

    if current:
        result['cleared'].append(
            f'vendor_payment_method:cash ({current.qbo_account_name})'
        )

    if dry_run:
        result['mapped'] = f'vendor_payment_method:cash -> QBO {target.Id} {target.Name}'
        return result

    with transaction.atomic():
        if current and current.qbo_account_id != str(target.Id):
            mapping_service.clear_row('vendor_payment_method', 'cash')
        ok, error = mapping_service.map_row(
            'vendor_payment_method',
            'cash',
            qbo_account_id=str(target.Id),
        )
        if ok:
            result['mapped'] = f'vendor_payment_method:cash -> QBO {target.Id} {target.Name}'
        else:
            result['skipped'] = error or 'map failed'
    return result


def clear_stale_control_mapping(mapping_kind, mapping_key, *, blocked_names, dry_run=False):
    """Clear a control/method mapping that points at a branch settlement QBO account."""
    mapping = QBOAccountMapping.objects.filter(
        mapping_kind=mapping_kind,
        mapping_key=mapping_key,
    ).first()
    if not mapping or not mapping.qbo_account_id:
        return None

    name = (mapping.qbo_account_name or '').lower()
    if not any(token in name for token in blocked_names):
        return None

    label = f'{mapping_kind}:{mapping_key} ({mapping.qbo_account_name})'
    if dry_run:
        return f'would clear {label}'

    mapping.delete()
    return f'cleared {label}'


def fix_branch_settlement_qbo_mappings(
    *,
    account_codes=None,
    dry_run=False,
):
    """
    Clear stale QBO mappings that stole branch settlement accounts and remap svr_account rows.
    """
    from apps.quickbooks_online.mapping_services import get_account_mapping_service

    mapping_service = get_account_mapping_service()
    qbo_accounts, error = _qbo_account_rows(mapping_service)
    if error:
        return {'errors': [error]}

    combined = {
        'cleared_controls': [],
        'settlement': [],
        'vendor_cash': None,
        'errors': [],
    }

    blocked = ('momo', 'cash receipt', 'cash recepts', 'absa', 'main cash')

    for kind, key in (
        ('control_account', 'accounts_payable_account'),
        ('vendor_payment_method', 'cash'),
    ):
        cleared = clear_stale_control_mapping(kind, key, blocked_names=blocked, dry_run=dry_run)
        if cleared:
            combined['cleared_controls'].append(cleared)

    qs = Account.objects.filter(
        is_active=True,
        account_type='asset',
        account_subtype__in=SETTLEMENT_ACCOUNT_SUBTYPES,
        branch__isnull=False,
    ).select_related('branch')
    if account_codes:
        qs = qs.filter(code__in=account_codes)

    for svr_account in qs.order_by('code'):
        partial = remap_settlement_svr_account(
            svr_account,
            mapping_service=mapping_service,
            qbo_accounts=qbo_accounts,
            dry_run=dry_run,
        )
        if partial.get('mapped') or partial.get('cleared') or partial.get('skipped'):
            combined['settlement'].append(partial)

    combined['vendor_cash'] = fix_vendor_cash_mapping(
        mapping_service=mapping_service,
        qbo_accounts=qbo_accounts,
        dry_run=dry_run,
    )

    return combined
