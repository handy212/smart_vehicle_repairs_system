"""QuickBooks chart-of-accounts and item mapping helpers."""

import logging

from apps.accounting.models import AccountingControl

from .mapping_specs import (
    CLASS_MAPPING_KINDS,
    ITEM_MAPPING_KINDS,
    MAPPING_KIND_CONTROL,
    TAX_CODE_MAPPING_KINDS,
    all_mapping_rows,
)
from .account_requirements import (
    CONTROL_ACCOUNT_QBO_HINTS,
    INVENTORY_PART_CONTROL_REQUIREMENTS,
    validate_control_account_for_inventory_item,
)
from .models import QBOAccountMapping
from .qbo_account_utils import account_number_from_name, extract_qbo_account_number

from .owner_coa_specs import CONTROL_ACCOUNT_QBO_PATTERNS

logger = logging.getLogger(__name__)

QBAccount = None
QBItem = None
QBTaxCode = None
QBClass = None

try:
    from quickbooks.objects.account import Account as QBAccount
except ModuleNotFoundError:
    pass

try:
    from quickbooks.objects.item import Item as QBItem
except ModuleNotFoundError:
    pass

try:
    from quickbooks.objects.taxcode import TaxCode as QBTaxCode
except ModuleNotFoundError:
    pass

try:
    from importlib import import_module

    try:
        QBClass = import_module("quickbooks.objects.trackingclass").Class
    except ModuleNotFoundError:
        QBClass = import_module("quickbooks.objects.class").Class
except ModuleNotFoundError:
    pass


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
                    'account_number': extract_qbo_account_number(account),
                    'account_type': getattr(account, 'AccountType', '') or '',
                    'account_sub_type': getattr(account, 'AccountSubType', '') or '',
                    'active': bool(getattr(account, 'Active', True)),
                    'mapped_row': mapped_row,
                })
            results.sort(key=lambda row: (
                (row['account_number'] or 'zzz').lower(),
                (row['name'] or '').lower(),
            ))
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

    def list_tax_codes(self):
        client = self.qb.get_client()
        if not client:
            return None, 'QuickBooks not connected or unauthorized.'
        if QBTaxCode is None:
            return None, self.qb.sdk_unavailable_message()

        try:
            tax_codes = QBTaxCode.all(qb=client)
            tax_mappings = {
                row.qbo_account_id: row
                for row in QBOAccountMapping.objects.filter(
                    mapping_kind='tax_code',
                ).exclude(qbo_account_id='')
            }
            results = []
            for tax_code in tax_codes:
                mapping = tax_mappings.get(str(tax_code.Id))
                mapped_row = None
                if mapping:
                    mapped_row = {
                        'mapping_kind': mapping.mapping_kind,
                        'mapping_key': mapping.mapping_key,
                    }
                results.append({
                    'id': str(tax_code.Id),
                    'name': tax_code.Name,
                    'active': bool(getattr(tax_code, 'Active', True)),
                    'description': getattr(tax_code, 'Description', '') or '',
                    'mapped_row': mapped_row,
                })
            results.sort(key=lambda row: (row['name'] or '').lower())
            return results, None
        except Exception as exc:
            logger.error('Failed to list QBO tax codes: %s', exc)
            return None, str(exc)

    def list_classes(self):
        client = self.qb.get_client()
        if not client:
            return None, 'QuickBooks not connected or unauthorized.'
        if QBClass is None:
            return None, self.qb.sdk_unavailable_message()

        try:
            classes = QBClass.all(qb=client)
            class_mappings = {
                row.qbo_class_id: row
                for row in QBOAccountMapping.objects.exclude(qbo_class_id='')
            }
            results = []
            for qb_class in classes:
                mapping = class_mappings.get(str(qb_class.Id))
                mapped_row = None
                if mapping:
                    mapped_row = {
                        'mapping_kind': mapping.mapping_kind,
                        'mapping_key': mapping.mapping_key,
                    }
                parent_name = ''
                parent_ref = getattr(qb_class, 'ParentRef', None)
                if parent_ref is not None:
                    parent_name = getattr(parent_ref, 'name', '') or ''
                results.append({
                    'id': str(qb_class.Id),
                    'name': qb_class.Name,
                    'active': bool(getattr(qb_class, 'Active', True)),
                    'parent_name': parent_name,
                    'mapped_row': mapped_row,
                })
            results.sort(key=lambda row: (row['name'] or '').lower())
            return results, None
        except Exception as exc:
            logger.error('Failed to list QBO classes: %s', exc)
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
                'qbo_account_number': (
                    mapping.qbo_account_number
                    if mapping and mapping.qbo_account_number
                    else account_number_from_name(mapping.qbo_account_name)
                    if mapping and mapping.qbo_account_name
                    else ''
                ),
                'qbo_item_id': mapping.qbo_item_id if mapping else '',
                'qbo_item_name': mapping.qbo_item_name if mapping else '',
                'qbo_class_id': mapping.qbo_class_id if mapping else '',
                'qbo_class_name': mapping.qbo_class_name if mapping else '',
                'uses_tax_code': spec.get('uses_tax_code', False),
                'uses_class': spec.get('uses_class', False),
                'status': mapping.status if mapping else 'unmapped',
                'error_message': mapping.error_message if mapping else '',
                'qbo_account_hint': CONTROL_ACCOUNT_QBO_HINTS.get(spec.get('control_field') or '', ''),
            }
            rows.append(row)
            groups.setdefault(spec['group'], []).append(row)

        grouped = [{'group': name, 'rows': group_rows} for name, group_rows in groups.items()]
        return {'groups': grouped, 'rows': rows}

    def _fetch_qbo_account(self, client, account_id):
        return QBAccount.get(int(account_id), qb=client)

    def _fetch_qbo_item(self, client, item_id):
        return QBItem.get(int(item_id), qb=client)

    def _fetch_qbo_tax_code(self, client, tax_code_id):
        return QBTaxCode.get(int(tax_code_id), qb=client)

    def _fetch_qbo_class(self, client, class_id):
        return QBClass.get(int(class_id), qb=client)

    def map_row(self, mapping_kind, mapping_key, *, qbo_account_id=None, qbo_item_id=None, qbo_class_id=None, user=None):
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
        elif mapping_kind in CLASS_MAPPING_KINDS:
            if not qbo_class_id:
                return False, 'qbo_class_id is required for class mappings.'
            try:
                qb_class = self._fetch_qbo_class(client, qbo_class_id)
            except Exception as exc:
                return False, f'QBO class {qbo_class_id} was not found: {exc}'
            defaults = {
                'qbo_class_id': str(qb_class.Id),
                'qbo_class_name': qb_class.Name or '',
                'qbo_account_id': '',
                'qbo_account_name': '',
                'qbo_account_number': '',
                'qbo_account_type': '',
                'qbo_item_id': '',
                'qbo_item_name': '',
                'status': 'synced',
                'error_message': '',
                'updated_by': user,
            }
        elif mapping_kind in TAX_CODE_MAPPING_KINDS:
            if not qbo_account_id:
                return False, 'qbo_account_id (tax code id) is required for tax code mappings.'
            try:
                tax_code = self._fetch_qbo_tax_code(client, qbo_account_id)
            except Exception as exc:
                return False, f'QBO tax code {qbo_account_id} was not found: {exc}'
            defaults = {
                'qbo_account_id': str(tax_code.Id),
                'qbo_account_name': tax_code.Name or '',
                'qbo_account_type': 'TaxCode',
                'qbo_item_id': '',
                'qbo_item_name': '',
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
            if (
                mapping_kind == MAPPING_KIND_CONTROL
                and mapping_key in INVENTORY_PART_CONTROL_REQUIREMENTS
            ):
                validation_error = validate_control_account_for_inventory_item(account, mapping_key)
                if validation_error:
                    return False, validation_error
            defaults = {
                'qbo_account_id': str(account.Id),
                'qbo_account_name': account.Name or '',
                'qbo_account_number': extract_qbo_account_number(account),
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

    def resolve_qbo_class_id(self, mapping_kind, mapping_key):
        mapping = self.get_mapping(mapping_kind, mapping_key)
        if mapping and mapping.qbo_class_id:
            return mapping.qbo_class_id
        return None

    def resolve_control_account_qbo_id(self, control_field):
        mapped = self.resolve_qbo_account_id(MAPPING_KIND_CONTROL, control_field)
        if mapped:
            return mapped
        persist = control_field in INVENTORY_PART_CONTROL_REQUIREMENTS
        return self._pattern_resolve_control_account_qbo_id(control_field, persist=persist)

    def _account_rows_for_pattern_match(self, account_rows):
        return [
            type('QBOAccountRow', (), {
                'Id': row['id'],
                'Name': row['name'],
                'AccountType': row['account_type'],
                'AccountSubType': row['account_sub_type'],
                'Active': row['active'],
            })()
            for row in account_rows
        ]

    def _pattern_resolve_control_account_qbo_id(self, control_field, *, persist=True):
        """Best-effort match from live QBO chart when no saved mapping exists."""
        from .owner_coa_services import find_best_qbo_account

        patterns = CONTROL_ACCOUNT_QBO_PATTERNS.get(control_field)
        if not patterns:
            return None

        account_rows, error = self.list_accounts()
        if error or not account_rows:
            return None

        accounts = self._account_rows_for_pattern_match(account_rows)
        best, score = find_best_qbo_account(accounts, patterns)
        if not best or score <= 0:
            return None

        account_id = str(best.Id)
        if control_field in INVENTORY_PART_CONTROL_REQUIREMENTS:
            client = self.qb.get_client()
            if client:
                try:
                    account = self._fetch_qbo_account(client, account_id)
                except Exception:
                    return None
                if validate_control_account_for_inventory_item(account, control_field):
                    return None

        if persist and control_field in INVENTORY_PART_CONTROL_REQUIREMENTS:
            ok, map_error = self.map_row(
                MAPPING_KIND_CONTROL,
                control_field,
                qbo_account_id=account_id,
            )
            if not ok:
                logger.warning(
                    'Pattern-matched QBO account for %s but could not persist mapping: %s',
                    control_field,
                    map_error,
                )
            else:
                logger.info(
                    'Auto-mapped control_account:%s → %s (%s)',
                    control_field,
                    getattr(best, 'Name', ''),
                    account_id,
                )

        return account_id

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

    def resolve_tax_code_id(self, tax_key='composite'):
        return self.resolve_qbo_account_id('tax_code', tax_key)

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
