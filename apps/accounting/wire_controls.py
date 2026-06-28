"""Wire AccountingControl fields to canonical chart accounts."""

from django.core.management import call_command

from apps.accounting.control_accounts import CONTROL_ACCOUNT_SPECS
from apps.accounting.models import Account, AccountingControl


def wire_accounting_controls(*, force=False, dry_run=False):
    """
    Ensure chart seeds exist and wire control fields to canonical leaf accounts.

    Returns dict with changed_fields, skipped, and messages for API/CLI use.
    """
    call_command('setup_chart_of_accounts')

    by_code = {account.code: account for account in Account.objects.all()}
    controls = AccountingControl.get_settings()
    changed_fields = []
    skipped = []
    messages = []

    for field_name in AccountingControl.ACCOUNT_FIELD_NAMES:
        spec = CONTROL_ACCOUNT_SPECS.get(field_name)
        if spec is None:
            messages.append(f'No spec for {field_name}; skipping.')
            continue

        code, name, account_type, balance_type, account_subtype, parent_code = spec
        account = by_code.get(code)
        if account is None:
            parent = by_code.get(parent_code) if parent_code else None
            if dry_run:
                messages.append(f'Would create account {code} ({name}) for {field_name}.')
                account = Account(code=code, name=name)
            else:
                account, _ = Account.objects.get_or_create(
                    code=code,
                    defaults={
                        'name': name,
                        'account_type': account_type,
                        'balance_type': balance_type,
                        'account_subtype': account_subtype,
                        'parent': parent,
                        'is_active': True,
                    },
                )
                by_code[code] = account

        current = getattr(controls, field_name, None)
        needs_update = current is None
        if current is not None:
            if not current.is_active or not current.is_leaf:
                needs_update = True
            elif force and current.id != account.id:
                needs_update = True

        if not needs_update:
            skipped.append(field_name)
            continue

        if dry_run:
            messages.append(
                f'Would set {field_name} -> {account.code} ({getattr(account, "name", name)}).'
            )
        else:
            setattr(controls, field_name, account)
            changed_fields.append(field_name)

    if changed_fields and not dry_run:
        controls.save(update_fields=changed_fields + ['updated_at'])

    return {
        'changed_fields': changed_fields,
        'skipped': skipped,
        'messages': messages,
        'dry_run': dry_run,
    }
