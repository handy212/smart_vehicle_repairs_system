"""Branch-scoped settlement (bank/cash) account helpers."""

from __future__ import annotations

from django.conf import settings
from django.db.models import Q, QuerySet
from rest_framework.exceptions import ValidationError

SETTLEMENT_ACCOUNT_SUBTYPES = frozenset({'bank', 'cash', 'cash_equivalent'})


def branch_settlement_enforcement_enabled() -> bool:
    return getattr(settings, 'SETTLEMENT_ACCOUNT_BRANCH_ENFORCEMENT', True)


def user_bypasses_settlement_branch_enforcement(user) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    return getattr(user, 'role', None) == 'admin'


def is_settlement_account(account) -> bool:
    if account is None:
        return False
    return (
        account.account_type == 'asset'
        and account.account_subtype in SETTLEMENT_ACCOUNT_SUBTYPES
        and account.is_leaf
    )


def settlement_account_base_queryset() -> QuerySet:
    from apps.accounting.models import Account

    return Account.objects.filter(
        is_active=True,
        account_type='asset',
        account_subtype__in=SETTLEMENT_ACCOUNT_SUBTYPES,
    )


def settlement_accounts_for_branch(branch, *, include_shared: bool = True) -> QuerySet:
    """
    Return settlement accounts usable for a branch.

    When the branch has dedicated settlement rows, only those (+ optional shared)
    are returned. Otherwise fall back to unassigned (branch=null) accounts so
    existing installs keep working until provisioned.
    """
    qs = settlement_account_base_queryset()
    if not branch_settlement_enforcement_enabled():
        return qs
    if branch is None:
        if include_shared:
            return qs.filter(branch__isnull=True)
        return qs.none()

    branch_specific = qs.filter(branch=branch)
    if branch_specific.exists():
        allowed = Q(branch=branch)
        if include_shared:
            allowed |= Q(branch__isnull=True)
        return qs.filter(allowed)

    if include_shared:
        return qs.filter(Q(branch__isnull=True) | Q(branch=branch))
    return qs.filter(branch=branch)


def bank_account_queryset(*, branch=None, include_shared: bool = True) -> QuerySet:
    qs = settlement_accounts_for_branch(branch, include_shared=include_shared)
    return qs.filter(account_subtype__in={'bank', 'cash_equivalent'})


def resolve_default_bank_settlement_account():
    """
    Return AccountingControl.default_bank_account when it is a valid
    bank/cash-equivalent settlement account. Used by gateway payments
    (Paystack, etc.) that have no cashier-selected account.
    """
    from apps.accounting.models import AccountingControl

    account = AccountingControl.get_settings().default_bank_account
    if account is None:
        return None
    if (
        account.is_active
        and account.account_type == 'asset'
        and account.account_subtype in {'bank', 'cash_equivalent'}
        and account.is_leaf
    ):
        return account
    return None


def till_enabled_account_queryset(*, branch=None, include_shared: bool = True) -> QuerySet:
    return settlement_accounts_for_branch(branch, include_shared=include_shared).filter(
        is_till_enabled=True,
    )


def validate_settlement_account_for_branch(account, branch, *, user=None, field_name='bank_account'):
    """Raise DRF ValidationError when account is not allowed for the branch."""
    if account is None:
        return account
    if not branch_settlement_enforcement_enabled():
        return account
    if user and user_bypasses_settlement_branch_enforcement(user):
        return account
    if not is_settlement_account(account):
        return account
    if not account.is_active:
        raise ValidationError({field_name: 'Select an active settlement account.'})

    allowed = settlement_accounts_for_branch(branch, include_shared=True)
    if not allowed.filter(pk=account.pk).exists():
        branch_label = getattr(branch, 'name', None) or 'this branch'
        raise ValidationError({
            field_name: (
                f'This settlement account is not assigned to {branch_label}. '
                'Select a bank or cash account for your branch.'
            ),
        })
    return account


def deactivate_branch_settlement_accounts(branch) -> int:
    """Archive helper: deactivate settlement GL rows owned by a branch."""
    from apps.accounting.models import Account

    return Account.objects.filter(
        branch=branch,
        account_type='asset',
        account_subtype__in=SETTLEMENT_ACCOUNT_SUBTYPES,
        is_active=True,
    ).update(is_active=False)


def _account_qbo_mapped(account) -> bool:
    try:
        from apps.quickbooks_online.mapping_services import get_account_mapping_service

        mapping = get_account_mapping_service().get_mapping('svr_account', str(account.id))
        return bool(mapping and getattr(mapping, 'qbo_account_id', None))
    except Exception:
        return False


def serialize_settlement_account(account) -> dict:
    return {
        'id': account.id,
        'code': account.code,
        'name': account.name,
        'account_subtype': account.account_subtype,
        'is_till_enabled': account.is_till_enabled,
        'is_active': account.is_active,
        'branch_id': account.branch_id,
        'branch_name': account.branch.name if account.branch_id else None,
        'qbo_mapped': _account_qbo_mapped(account),
    }


def branch_settlement_overview(branch) -> dict:
    """Return assigned, assignable, and shared settlement accounts for admin UI."""
    from apps.accounting.models import Account

    base = settlement_account_base_queryset().select_related('branch').order_by('code')
    assigned = [serialize_settlement_account(a) for a in base.filter(branch=branch)]
    shared = [serialize_settlement_account(a) for a in base.filter(branch__isnull=True)]
    available = [serialize_settlement_account(a) for a in base.filter(branch__isnull=True)]
    return {
        'branch_id': branch.id,
        'branch_name': branch.name,
        'assigned': assigned,
        'available': available,
        'shared': shared,
    }


def assign_settlement_account_to_branch(account, branch):
    """Assign an unassigned settlement account to a branch."""
    from apps.accounting.models import Account

    if not is_settlement_account(account):
        raise ValidationError({'account': 'Only bank/cash settlement accounts can be branch-assigned.'})
    if account.branch_id and account.branch_id != branch.id:
        raise ValidationError({
            'account': f'Account {account.code} is already assigned to {account.branch.name}.',
        })
    if account.branch_id == branch.id:
        return account
    Account.objects.filter(pk=account.pk).update(branch=branch)
    account.refresh_from_db()
    return account


def unassign_settlement_account_from_branch(account, branch):
    """Remove branch ownership from a settlement account (becomes shared)."""
    if account.branch_id != branch.id:
        raise ValidationError({
            'account': f'Account {account.code} is not assigned to {branch.name}.',
        })
    account.branch = None
    account.save(update_fields=['branch', 'updated_at'])
    return account


def update_branch_settlement_accounts(
    branch,
    *,
    assign_ids=None,
    unassign_ids=None,
):
    """Bulk assign/unassign settlement accounts for a branch."""
    from apps.accounting.models import Account

    assign_ids = assign_ids or []
    unassign_ids = unassign_ids or []
    assigned = []
    unassigned = []
    errors = []

    for account_id in assign_ids:
        account = Account.objects.filter(pk=account_id).first()
        if not account:
            errors.append(f'Account {account_id} not found.')
            continue
        try:
            assign_settlement_account_to_branch(account, branch)
            assigned.append(serialize_settlement_account(account))
        except ValidationError as exc:
            detail = exc.detail
            if isinstance(detail, dict):
                errors.extend(str(v) for v in detail.values())
            else:
                errors.append(str(detail))

    for account_id in unassign_ids:
        account = Account.objects.filter(pk=account_id).first()
        if not account:
            errors.append(f'Account {account_id} not found.')
            continue
        try:
            unassign_settlement_account_from_branch(account, branch)
            unassigned.append(serialize_settlement_account(account))
        except ValidationError as exc:
            detail = exc.detail
            if isinstance(detail, dict):
                errors.extend(str(v) for v in detail.values())
            else:
                errors.append(str(detail))

    return {
        'assigned': assigned,
        'unassigned': unassigned,
        'errors': errors,
    }
