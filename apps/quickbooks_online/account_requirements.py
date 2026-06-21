"""QBO chart-of-account requirements for inventory product sync."""

from __future__ import annotations

import re

try:
    from quickbooks.objects.account import Account as QBAccount
except ModuleNotFoundError:
    QBAccount = None


def normalize_qbo_label(value: str | None) -> str:
    return re.sub(r'[^a-z0-9]', '', (value or '').lower())


# Control fields used when syncing SVR Inventory-type parts to QBO Items.
INVENTORY_PART_CONTROL_REQUIREMENTS = {
    'sales_revenue_account': {
        'label': 'Sales Revenue',
        'account_type': 'Income',
        'account_sub_types': {
            'SalesOfProductIncome',
        },
        'subtype_display': 'Sales of Product Income',
    },
    'cost_of_goods_sold_account': {
        'label': 'Cost of Goods Sold',
        'account_type': 'Cost of Goods Sold',
        'account_sub_types': {
            'SuppliesMaterialsCogs',
            'SuppliesMaterials',
        },
        'subtype_display': 'Supplies and Materials',
    },
    'inventory_asset_account': {
        'label': 'Inventory Asset',
        'account_type': 'Other Current Asset',
        'account_sub_types': {
            'Inventory',
        },
        'subtype_display': 'Inventory',
    },
}

CONTROL_ACCOUNT_QBO_HINTS = {
    field: (
        f'QBO type: {spec["account_type"]} → {spec["subtype_display"]}'
    )
    for field, spec in INVENTORY_PART_CONTROL_REQUIREMENTS.items()
}


def _subtype_matches(actual_subtype: str | None, allowed_subtypes: set[str]) -> bool:
    normalized = normalize_qbo_label(actual_subtype)
    if not normalized:
        return False
    allowed = {normalize_qbo_label(value) for value in allowed_subtypes}
    if normalized in allowed:
        return True
    # QBO UI labels vary ("Supplies and Materials" vs SuppliesMaterialsCogs).
    if 'suppliesmaterials' in normalized:
        return any('suppliesmaterials' in entry for entry in allowed)
    return False


def account_matches_inventory_requirement(account, control_field: str) -> bool:
    requirement = INVENTORY_PART_CONTROL_REQUIREMENTS.get(control_field)
    if not requirement or account is None:
        return True

    account_type = getattr(account, 'AccountType', '') or ''
    account_subtype = getattr(account, 'AccountSubType', '') or ''
    if normalize_qbo_label(account_type) != normalize_qbo_label(requirement['account_type']):
        return False
    return _subtype_matches(account_subtype, requirement['account_sub_types'])


def validate_control_account_for_inventory_item(account, control_field: str) -> str | None:
    """Return a user-facing error when a mapped QBO account is wrong for Inventory items."""
    requirement = INVENTORY_PART_CONTROL_REQUIREMENTS.get(control_field)
    if not requirement or account is None:
        return None
    if account_matches_inventory_requirement(account, control_field):
        return None

    name = getattr(account, 'Name', '') or control_field
    account_type = getattr(account, 'AccountType', '') or 'unknown'
    account_subtype = getattr(account, 'AccountSubType', '') or 'none'
    return (
        f'Mapped QBO account "{name}" cannot be used for Inventory products. '
        f'Remap "{requirement["label"]}" to a QuickBooks account with type '
        f'"{requirement["account_type"]}" and detail type "{requirement["subtype_display"]}" '
        f'(currently mapped account is {account_type} / {account_subtype}). '
        f'Fix under Accounting → Control Panel → QuickBooks Chart of Accounts Mapping.'
    )


def fetch_qbo_account(client, account_id: str):
    if QBAccount is None or client is None or not account_id:
        return None
    return QBAccount.get(int(account_id), qb=client)


def validate_inventory_part_account_ids(
    client,
    *,
    income_id: str | None,
    expense_id: str | None,
    asset_id: str | None,
) -> str | None:
    """Validate resolved QBO account ids before pushing an Inventory item."""
    errors: list[str] = []
    for control_field, account_id in (
        ('sales_revenue_account', income_id),
        ('cost_of_goods_sold_account', expense_id),
        ('inventory_asset_account', asset_id),
    ):
        if not account_id:
            continue
        try:
            account = fetch_qbo_account(client, account_id)
        except Exception as exc:
            errors.append(f'Could not load QBO account {account_id} for {control_field}: {exc}')
            continue
        message = validate_control_account_for_inventory_item(account, control_field)
        if message:
            errors.append(message)
    return ' '.join(errors) if errors else None
