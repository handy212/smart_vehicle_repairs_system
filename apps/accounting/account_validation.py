"""Shared GL account validation helpers for accounting and billing."""
from django.core.exceptions import ValidationError


def is_valid_settlement_account(account):
    """Return True when account is an active leaf bank/cash-equivalent asset."""
    if not account:
        return False
    return (
        account.is_active
        and account.account_type == 'asset'
        and account.account_subtype in {'bank', 'cash_equivalent'}
        and account.is_leaf
    )


def validate_settlement_account(account, *, field_name='account'):
    """Raise ValidationError when account is not a valid settlement account."""
    if account is None:
        raise ValidationError({field_name: f"{field_name} is required."})
    if not is_valid_settlement_account(account):
        raise ValidationError({
            field_name: (
                'Select an active leaf Asset account classified as Bank or Cash Equivalent.'
            ),
        })
    return account
