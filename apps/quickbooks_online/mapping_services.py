"""QuickBooks chart-of-accounts and item mapping helpers."""

import logging

from apps.accounting.models import AccountingControl

from .mapping_specs import (
    ITEM_MAPPING_KINDS,
    MAPPING_KIND_CONTROL,
    all_mapping_rows,
)
from .models import QBOAccountMapping

logger = logging.getLogger(__name__)

try:
    from quickbooks.objects.account import Account as QBAccount
    from quickbooks.objects.item import Item as QBItem
except ModuleNotFoundError:
    QBAccount = None
    QBItem = None


class QBOAccountMappingService:
    """List QBO accounts/items and manage SVR ↔ QBO mapping configuration."""

    def __init__(self, quickbooks_service):
        self.qb = quickbooks_service

    def list_accounts(self):
        client = self.qb.get_client()
        if not client:
            return None, 'QuickBooks not connected or unauthorized.'
        if QBAccount is None:
            return None, self.qb.sdk_unavailable_message()

        try:
            accounts = QBAccount.all(qb=client)
            account_mappings = {
                row.qbo_account_id: row
                for row in QBOAccountMapping.objects.exclude(qbo_account_id='')
            }
            results = []
            for account in accounts:
                mapping = account_mappings.get(str(account.Id))
                mapped_row = None
                if mapping:
                    mapped_row = {
                        'mapping_kind': mapping.mapping_kind,
                        'mapping_key': mapping.mapping_key,
                        'label': mapping.mapping_key,
                    }
                results.append({
                    'id': str(account.Id),
                    'name': account.Name,
                    'account_type': getattr(account, 'AccountType', '') or '',
                    'account_sub_type': getattr(account, 'AccountSubType', '') or '',
                    'active': bool(getattr(account, 'Active', True)),
                    'mapped_row': mapped_row,
                })
            results.sort(key=lambda row: (row['name'] or '').lower())
            return results, None
        except Exception as exc:
            logger.error('Failed to list QBO accounts: %s', exc)
            return None, str(exc)

    def list_items(self):
        client = self.qb.get_client()
        if not client:
            return None, 'QuickBooks not connected or unauthorized.'
        if QBItem is None:
            return None, self.qb.sdk_unavailable_message()

        try:
            items = QBItem.all(qb=client)
            item_mappings = {
                row.qbo_item_id: row
                for row in QBOAccountMapping.objects.exclude(qbo_item_id='')
            }
            results = []
            for item in items:
                mapping = item_mappings.get(str(item.Id))
                mapped_row = None
                if mapping:
                    mapped_row = {
                        'mapping_kind': mapping.mapping_kind,
                        'mapping_key': mapping.mapping_key,
                    }
                income_account = ''
                if getattr(item, 'IncomeAccountRef', None):
                    income_account = getattr(item.IncomeAccountRef, 'name', '') or ''
                results.append({
                    'id': str(item.Id),
                    'name': item.Name,
                    'type': getattr(item, 'Type', '') or '',
                    'active': bool(getattr(item, 'Active', True)),
                    'income_account_name': income_account,
                    'mapped_row': mapped_row,
                })
            results.sort(key=lambda row: (row['name'] or '').lower())
            return results, None
        except Exception as exc:
            logger.error('Failed to list QBO items: %s', exc)
            return None, str(exc)

    def get_mapping_overview(self):
        controls = AccountingControl.get_settings()
        stored = {
            (row.mapping_kind, row.mapping_key): row
            for row in QBOAccountMapping.objects.select_related('svr_account', 'updated_by').all()
        }

        groups = {}
        rows = []
        for spec in all_mapping_rows():
            mapping = stored.get((spec['mapping_kind'], spec['mapping_key']))
            svr_account = None
            control_field = spec.get('control_field')
            if control_field:
                account = getattr(controls, control_field, None)
                if account:
                    svr_account = {
                        'id': account.id,
                        'code': account.code,
                        'name': account.name,
                    }
            row = {
                **spec,
                'svr_account': svr_account,
                'qbo_account_id': mapping.qbo_account_id if mapping else '',
                'qbo_account_name': mapping.qbo_account_name if mapping else '',
                'qbo_item_id': mapping.qbo_item_id if mapping else '',
                'qbo_item_name': mapping.qbo_item_name if mapping else '',
                'status': mapping.status if mapping else 'unmapped',
                'error_message': mapping.error_message if mapping else '',
            }
            rows.append(row)
            groups.setdefault(spec['group'], []).append(row)

        grouped = [{'group': name, 'rows': group_rows} for name, group_rows in groups.items()]
        return {'groups': grouped, 'rows': rows}

    def _fetch_qbo_account(self, client, account_id):
        return QBAccount.get(int(account_id), qb=client)

    def _fetch_qbo_item(self, client, item_id):
        return QBItem.get(int(item_id), qb=client)

    def map_row(self, mapping_kind, mapping_key, *, qbo_account_id=None, qbo_item_id=None, user=None):
        client = self.qb.get_client()
        if not client:
            return False, 'QuickBooks not connected or unauthorized.'

        if mapping_kind in ITEM_MAPPING_KINDS:
            if not qbo_item_id:
                return False, 'qbo_item_id is required for invoice line mappings.'
            try:
                item = self._fetch_qbo_item(client, qbo_item_id)
            except Exception as exc:
                return False, f'QBO item {qbo_item_id} was not found: {exc}'
            defaults = {
                'qbo_item_id': str(item.Id),
                'qbo_item_name': item.Name or '',
                'qbo_account_id': '',
                'qbo_account_name': '',
                'qbo_account_type': '',
                'status': 'synced',
                'error_message': '',
                'updated_by': user,
            }
        else:
            if not qbo_account_id:
                return False, 'qbo_account_id is required.'
            conflict = QBOAccountMapping.objects.filter(
                qbo_account_id=str(qbo_account_id),
            ).exclude(mapping_kind=mapping_kind, mapping_key=mapping_key).first()
            if conflict:
                return False, (
                    f'QBO account is already mapped to {conflict.mapping_kind}:{conflict.mapping_key}.'
                )
            try:
                account = self._fetch_qbo_account(client, qbo_account_id)
            except Exception as exc:
                return False, f'QBO account {qbo_account_id} was not found: {exc}'
            defaults = {
                'qbo_account_id': str(account.Id),
                'qbo_account_name': account.Name or '',
                'qbo_account_type': getattr(account, 'AccountType', '') or '',
                'qbo_item_id': '',
                'qbo_item_name': '',
                'status': 'synced',
                'error_message': '',
                'updated_by': user,
            }

        if mapping_kind == MAPPING_KIND_CONTROL:
            controls = AccountingControl.get_settings()
            svr_account = getattr(controls, mapping_key, None)
            defaults['svr_account'] = svr_account

        QBOAccountMapping.objects.update_or_create(
            mapping_kind=mapping_kind,
            mapping_key=mapping_key,
            defaults=defaults,
        )
        return True, None

    def clear_row(self, mapping_kind, mapping_key):
        deleted, _ = QBOAccountMapping.objects.filter(
            mapping_kind=mapping_kind,
            mapping_key=mapping_key,
        ).delete()
        return deleted > 0

    def get_mapping(self, mapping_kind, mapping_key):
        return QBOAccountMapping.objects.filter(
            mapping_kind=mapping_kind,
            mapping_key=mapping_key,
        ).first()

    def resolve_qbo_account_id(self, mapping_kind, mapping_key):
        mapping = self.get_mapping(mapping_kind, mapping_key)
        if mapping and mapping.qbo_account_id:
            return mapping.qbo_account_id
        return None

    def resolve_qbo_item_id(self, mapping_kind, mapping_key):
        mapping = self.get_mapping(mapping_kind, mapping_key)
        if mapping and mapping.qbo_item_id:
            return mapping.qbo_item_id
        return None

    def resolve_control_account_qbo_id(self, control_field):
        return self.resolve_qbo_account_id(MAPPING_KIND_CONTROL, control_field)

    def resolve_payment_deposit_account_id(self, payment):
        """Resolve QBO deposit account for a customer payment."""
        if payment.bank_account_id:
            svr_mapping = self.get_mapping('svr_account', str(payment.bank_account_id))
            if svr_mapping and svr_mapping.qbo_account_id:
                return svr_mapping.qbo_account_id

        method_id = self.resolve_qbo_account_id('payment_method', payment.payment_method)
        if method_id:
            return method_id

        if payment.till_id and payment.till and payment.till.till_account_id:
            till_mapping = self.get_mapping('svr_account', str(payment.till.till_account_id))
            if till_mapping and till_mapping.qbo_account_id:
                return till_mapping.qbo_account_id

        return self.resolve_control_account_qbo_id('default_bank_account')

    def resolve_invoice_line_item_id(self, item_type):
        return self.resolve_qbo_item_id('invoice_line_type', item_type)

    def resolve_bill_line_account_id(self, *, is_inventory_line):
        key = 'inventory' if is_inventory_line else 'expense'
        account_id = self.resolve_qbo_account_id('bill_line_kind', key)
        if account_id:
            return account_id
        control_field = 'inventory_asset_account' if is_inventory_line else 'default_expense_account'
        return self.resolve_control_account_qbo_id(control_field)


def get_account_mapping_service():
    from .services import QuickBooksService
    return QBOAccountMappingService(QuickBooksService())
