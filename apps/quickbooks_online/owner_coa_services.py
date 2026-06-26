"""Apply owner legacy COA patterns to QBO mappings (SVR stays lean)."""

from __future__ import annotations

import logging

from django.db import transaction

from apps.accounting.models import Account
from apps.branches.models import Branch

from .mapping_services import QBOAccountMappingService
from .qbo_account_utils import account_number_from_name
from .mapping_specs import (
    MAPPING_KIND_BILL_LINE,
    MAPPING_KIND_CONTROL,
    MAPPING_KIND_INVOICE_LINE,
    MAPPING_KIND_PAYMENT_METHOD,
    MAPPING_KIND_TAX_CODE,
    MAPPING_KIND_VENDOR_PAYMENT_METHOD,
)
from .owner_coa_specs import (
    BILL_LINE_KIND_QBO_PATTERNS,
    BRANCH_DEPARTMENT_PATTERNS,
    CONTROL_ACCOUNT_QBO_PATTERNS,
    INVOICE_LINE_ITEM_TEMPLATES,
    OWNER_COA_CORRECTIONS,
    PAYMENT_METHOD_QBO_PATTERNS,
    QBO_ACCOUNT_EXCLUDE_PATTERNS,
    SUPPLEMENTAL_QBO_ACCOUNTS,
    SVR_ACCOUNT_QBO_PATTERNS,
    TAX_CODE_QBO_PATTERNS,
    VENDOR_PAYMENT_METHOD_QBO_PATTERNS,
)

logger = logging.getLogger(__name__)

try:
    from quickbooks.objects.account import Account as QBAccount
    from quickbooks.objects.department import Department as QBDepartment
    from quickbooks.objects.item import Item as QBItem
    from quickbooks.objects.taxcode import TaxCode as QBTaxCode
except ModuleNotFoundError:
    QBAccount = None
    QBDepartment = None
    QBItem = None
    QBTaxCode = None


def _normalize(value):
    return (value or '').strip().lower()


def _account_number_from_name(name):
    return account_number_from_name(name)


def _is_excluded_account(name):
    normalized = _normalize(name)
    return any(pattern in normalized for pattern in QBO_ACCOUNT_EXCLUDE_PATTERNS)


def _score_account_match(account, patterns):
    """Return match score (higher is better) or -1 if excluded."""
    name = getattr(account, 'Name', '') or ''
    if _is_excluded_account(name):
        return -1

    normalized_name = _normalize(name)
    account_type = getattr(account, 'AccountType', '') or ''
    allowed_types = patterns.get('account_types') or []
    if allowed_types and account_type not in allowed_types:
        return -1

    for exclude in patterns.get('exclude_substrings') or []:
        if exclude in normalized_name:
            return -1

    score = 0
    account_number = _account_number_from_name(name)
    for number in patterns.get('account_numbers') or []:
        if account_number.startswith(number.lower()) or number.lower() in normalized_name:
            score += 100

    for substring in patterns.get('name_substrings') or []:
        if substring in normalized_name:
            score += 50

    return score


def find_best_qbo_account(accounts, patterns):
    best = None
    best_score = 0
    for account in accounts:
        score = _score_account_match(account, patterns)
        if score > best_score:
            best_score = score
            best = account
    return best, best_score


def find_best_qbo_tax_code(tax_codes, patterns):
    best = None
    best_score = 0
    normalized_patterns = patterns.get('name_substrings') or []
    for tax_code in tax_codes:
        name = _normalize(getattr(tax_code, 'Name', ''))
        score = sum(50 for substring in normalized_patterns if substring in name)
        if score > best_score:
            best_score = score
            best = tax_code
    return best, best_score


def find_best_qbo_item(items, name):
    normalized_target = _normalize(name)
    for item in items:
        if _normalize(getattr(item, 'Name', '')) == normalized_target:
            return item
    for item in items:
        if normalized_target in _normalize(getattr(item, 'Name', '')):
            return item
    return None


def find_best_qbo_department(departments, branch):
    """Match branch to QBO Department by city/name keywords."""
    branch_text = _normalize(f'{branch.name} {branch.city}')
    for keywords in BRANCH_DEPARTMENT_PATTERNS.values():
        if any(keyword in branch_text for keyword in keywords):
            for department in departments:
                dept_name = _normalize(getattr(department, 'Name', ''))
                if any(keyword in dept_name for keyword in keywords):
                    return department
    # Fallback: exact branch name match
    for department in departments:
        if _normalize(getattr(department, 'Name', '')) == _normalize(branch.name):
            return department
    return None


class OwnerCOASetupService:
    """Setup and auto-map owner QBO chart without importing it into SVR."""

    def __init__(self, mapping_service: QBOAccountMappingService):
        self.mapping_service = mapping_service
        self.qb = mapping_service.qb

    def _require_client(self):
        client = self.qb.get_client()
        if not client:
            return None, 'QuickBooks not connected or unauthorized.'
        if QBAccount is None:
            return None, self.qb.sdk_unavailable_message()
        return client, None

    def _load_qbo_accounts(self, client):
        accounts, error = self.mapping_service.list_accounts()
        if error:
            raise RuntimeError(error)
        # Rehydrate lightweight dicts into account-like objects for scoring helpers.
        return [
            type('QBOAccountRow', (), {
                'Id': row['id'],
                'Name': row['name'],
                'AccountType': row['account_type'],
                'AccountSubType': row['account_sub_type'],
                'Active': row['active'],
            })()
            for row in accounts
        ]

    def _load_qbo_items(self, client):
        items, error = self.mapping_service.list_items()
        if error:
            return []
        return [
            type('QBOItemRow', (), {
                'Id': row['id'],
                'Name': row['name'],
                'Type': row['type'],
                'Active': row['active'],
            })()
            for row in items
        ]

    def _load_qbo_tax_codes(self, client):
        tax_codes, error = self.mapping_service.list_tax_codes()
        if error:
            return []
        return [
            type('QBOTaxRow', (), {
                'Id': row['id'],
                'Name': row['name'],
                'Active': row['active'],
            })()
            for row in tax_codes
        ]

    def _load_qbo_departments(self, client):
        if QBDepartment is None:
            return []
        return QBDepartment.all(qb=client)

    def validate_owner_chart(self, accounts):
        """Return warnings for known owner COA issues found in QBO."""
        warnings = []
        account_names = [_normalize(getattr(account, 'Name', '')) for account in accounts]

        for correction in OWNER_COA_CORRECTIONS:
            code = correction['code'].lower()
            if any(code.replace('-', ' ') in name or code in name for name in account_names):
                warnings.append(correction)

        subcontractor_income = [
            name for name in account_names
            if 'sub-contractor' in name or 'subcontractor' in name
        ]
        if subcontractor_income:
            warnings.append({
                'code': '685',
                'issue': 'Subcontractor accounts present as income in QBO',
                'action': (
                    'Ensure invoice line items map to service/labour revenue, '
                    'not subcontractor income accounts.'
                ),
            })

        branch_sales = [name for name in account_names if ' sales' in name and any(
            city in name for city in ('kumasi', 'takoradi', 'tamale')
        )]
        if branch_sales:
            warnings.append({
                'code': '698',
                'issue': 'Branch sales GL accounts found in QBO',
                'action': 'Use QBO Departments for branch P&L; do not map SVR revenue here.',
            })

        return warnings

    def create_supplemental_accounts(self, *, dry_run=False, user=None):
        """Create missing supplemental QBO accounts required by the SVR bridge."""
        client, error = self._require_client()
        if error:
            return {'created': [], 'skipped': [], 'error': error}

        accounts = self._load_qbo_accounts(client)
        existing_names = {_normalize(getattr(account, 'Name', '')) for account in accounts}
        created = []
        skipped = []

        for spec in SUPPLEMENTAL_QBO_ACCOUNTS:
            normalized_name = _normalize(spec['name'])
            if normalized_name in existing_names:
                skipped.append(spec['name'])
                continue

            if dry_run:
                created.append(f"Would create: {spec['name']}")
                continue

            account = QBAccount()
            account.Name = spec['name']
            account.AccountType = spec['account_type']
            account.AccountSubType = spec['account_sub_type']
            if spec.get('description'):
                account.Description = spec['description']
            account.Active = True
            try:
                account.save(qb=client)
                created.append(spec['name'])
                if spec.get('maps_control_field'):
                    self.mapping_service.map_row(
                        MAPPING_KIND_CONTROL,
                        spec['maps_control_field'],
                        qbo_account_id=str(account.Id),
                        user=user,
                    )
            except Exception as exc:
                logger.error('Failed to create supplemental QBO account %s: %s', spec['name'], exc)
                skipped.append(f"{spec['name']} ({exc})")

        return {'created': created, 'skipped': skipped, 'error': None}

    def _ensure_invoice_line_item(self, client, accounts, items, line_type, template, *, dry_run=False, user=None):
        existing_item = find_best_qbo_item(items, template['name'])
        if existing_item:
            if not dry_run:
                self.mapping_service.map_row(
                    MAPPING_KIND_INVOICE_LINE,
                    line_type,
                    qbo_item_id=str(existing_item.Id),
                    user=user,
                )
            return {
                'line_type': line_type,
                'action': 'mapped_existing',
                'name': existing_item.Name,
                'qbo_item_id': str(existing_item.Id),
            }

        income_account, score = find_best_qbo_account(accounts, template['income_account_patterns'])
        if not income_account or score <= 0:
            return {
                'line_type': line_type,
                'action': 'skipped',
                'reason': 'No matching income account in QBO for item template.',
            }

        if dry_run:
            return {
                'line_type': line_type,
                'action': 'would_create',
                'name': template['name'],
                'income_account': income_account.Name,
            }

        item = QBItem()
        item.Name = template['name']
        item.Type = template['type']
        item.Active = True
        item.IncomeAccountRef = {'value': str(income_account.Id), 'name': income_account.Name}
        try:
            item.save(qb=client)
            self.mapping_service.map_row(
                MAPPING_KIND_INVOICE_LINE,
                line_type,
                qbo_item_id=str(item.Id),
                user=user,
            )
            return {
                'line_type': line_type,
                'action': 'created',
                'name': item.Name,
                'qbo_item_id': str(item.Id),
                'income_account': income_account.Name,
            }
        except Exception as exc:
            logger.error('Failed to create QBO item %s: %s', template['name'], exc)
            return {'line_type': line_type, 'action': 'failed', 'reason': str(exc)}

    def setup_invoice_line_items(self, *, dry_run=False, user=None):
        client, error = self._require_client()
        if error:
            return {'items': [], 'error': error}

        accounts = self._load_qbo_accounts(client)
        items = self._load_qbo_items(client)
        results = []
        for line_type, template in INVOICE_LINE_ITEM_TEMPLATES.items():
            results.append(
                self._ensure_invoice_line_item(
                    client, accounts, items, line_type, template, dry_run=dry_run, user=user,
                )
            )
        return {'items': results, 'error': None}

    def apply_control_and_payment_mappings(self, *, dry_run=False, user=None, overwrite=False):
        """Auto-map SVR control accounts and payment methods to owner QBO accounts."""
        client, error = self._require_client()
        if error:
            return {'mapped': [], 'skipped': [], 'error': error}

        accounts = self._load_qbo_accounts(client)
        tax_codes = self._load_qbo_tax_codes(client)
        mapped = []
        skipped = []

        mapping_specs = [
            (MAPPING_KIND_CONTROL, CONTROL_ACCOUNT_QBO_PATTERNS),
            (MAPPING_KIND_PAYMENT_METHOD, PAYMENT_METHOD_QBO_PATTERNS),
            (MAPPING_KIND_VENDOR_PAYMENT_METHOD, VENDOR_PAYMENT_METHOD_QBO_PATTERNS),
            (MAPPING_KIND_BILL_LINE, BILL_LINE_KIND_QBO_PATTERNS),
        ]

        for mapping_kind, pattern_map in mapping_specs:
            for mapping_key, patterns in pattern_map.items():
                existing = self.mapping_service.get_mapping(mapping_kind, mapping_key)
                if existing and existing.qbo_account_id and not overwrite:
                    skipped.append(f'{mapping_kind}:{mapping_key} (already mapped)')
                    continue

                account, score = find_best_qbo_account(accounts, patterns)
                if not account or score <= 0:
                    skipped.append(f'{mapping_kind}:{mapping_key} (no match)')
                    continue

                if dry_run:
                    mapped.append({
                        'mapping_kind': mapping_kind,
                        'mapping_key': mapping_key,
                        'qbo_account_id': str(account.Id),
                        'qbo_account_name': account.Name,
                        'score': score,
                    })
                    continue

                success, map_error = self.mapping_service.map_row(
                    mapping_kind,
                    mapping_key,
                    qbo_account_id=str(account.Id),
                    user=user,
                )
                if success:
                    mapped.append({
                        'mapping_kind': mapping_kind,
                        'mapping_key': mapping_key,
                        'qbo_account_name': account.Name,
                    })
                else:
                    skipped.append(f'{mapping_kind}:{mapping_key} ({map_error})')

        for tax_key, patterns in TAX_CODE_QBO_PATTERNS.items():
            existing = self.mapping_service.get_mapping(MAPPING_KIND_TAX_CODE, tax_key)
            if existing and existing.qbo_account_id and not overwrite:
                skipped.append(f'tax_code:{tax_key} (already mapped)')
                continue

            tax_code, score = find_best_qbo_tax_code(tax_codes, patterns)
            if not tax_code or score <= 0:
                skipped.append(f'tax_code:{tax_key} (no match)')
                continue

            if dry_run:
                mapped.append({
                    'mapping_kind': MAPPING_KIND_TAX_CODE,
                    'mapping_key': tax_key,
                    'qbo_account_id': str(tax_code.Id),
                    'qbo_account_name': tax_code.Name,
                })
                continue

            success, map_error = self.mapping_service.map_row(
                MAPPING_KIND_TAX_CODE,
                tax_key,
                qbo_account_id=str(tax_code.Id),
                user=user,
            )
            if success:
                mapped.append({
                    'mapping_kind': MAPPING_KIND_TAX_CODE,
                    'mapping_key': tax_key,
                    'qbo_account_name': tax_code.Name,
                })
            else:
                skipped.append(f'tax_code:{tax_key} ({map_error})')

        # SVR GL bank/cash accounts → QBO deposit accounts
        for svr_account in Account.objects.filter(is_active=True).exclude(account_subtype='category'):
            code_patterns = SVR_ACCOUNT_QBO_PATTERNS.get(svr_account.code)
            if not code_patterns:
                continue

            mapping_key = str(svr_account.id)
            existing = self.mapping_service.get_mapping('svr_account', mapping_key)
            if existing and existing.qbo_account_id and not overwrite:
                skipped.append(f'svr_account:{svr_account.code} (already mapped)')
                continue

            account, score = find_best_qbo_account(accounts, code_patterns)
            if not account or score <= 0:
                skipped.append(f'svr_account:{svr_account.code} (no match)')
                continue

            if dry_run:
                mapped.append({
                    'mapping_kind': 'svr_account',
                    'mapping_key': mapping_key,
                    'svr_account_code': svr_account.code,
                    'qbo_account_name': account.Name,
                })
                continue

            success, map_error = self.mapping_service.map_row(
                'svr_account',
                mapping_key,
                qbo_account_id=str(account.Id),
                user=user,
            )
            if success:
                mapping = self.mapping_service.get_mapping('svr_account', mapping_key)
                if mapping:
                    mapping.svr_account = svr_account
                    mapping.save(update_fields=['svr_account', 'updated_at'])
                mapped.append({
                    'mapping_kind': 'svr_account',
                    'mapping_key': mapping_key,
                    'svr_account_code': svr_account.code,
                    'qbo_account_name': account.Name,
                })
            else:
                skipped.append(f'svr_account:{svr_account.code} ({map_error})')

        return {'mapped': mapped, 'skipped': skipped, 'error': None}

    def sync_branch_departments(self, *, dry_run=False):
        """Link SVR branches to QBO Departments by city/name."""
        client, error = self._require_client()
        if error:
            return {'linked': [], 'skipped': [], 'error': error}

        departments = self._load_qbo_departments(client)
        linked = []
        skipped = []

        for branch in Branch.objects.filter(is_active=True):
            department = find_best_qbo_department(departments, branch)
            if not department:
                skipped.append(f'{branch.name} (no department match)')
                continue

            if dry_run:
                linked.append({
                    'branch': branch.name,
                    'department': department.Name,
                    'qbo_id': str(department.Id),
                })
                continue

            try:
                success, map_error = self.qb.map_branch_to_department(branch, str(department.Id))
                if not success:
                    skipped.append(f'{branch.name} ({map_error})')
                    continue
                linked.append({
                    'branch': branch.name,
                    'department': department.Name,
                    'qbo_id': str(department.Id),
                })
            except Exception as exc:
                logger.error('Failed to map branch %s: %s', branch.name, exc)
                skipped.append(f'{branch.name} ({exc})')

        return {'linked': linked, 'skipped': skipped, 'error': None}

    @transaction.atomic
    def run_full_setup(self, *, dry_run=False, overwrite=False, user=None):
        """Run supplemental accounts, mappings, items, and branch departments."""
        client, error = self._require_client()
        if error:
            return {'success': False, 'error': error}

        accounts = self._load_qbo_accounts(client)
        warnings = self.validate_owner_chart(accounts)

        result = {
            'success': True,
            'dry_run': dry_run,
            'warnings': warnings,
            'supplemental_accounts': self.create_supplemental_accounts(dry_run=dry_run, user=user),
            'mappings': self.apply_control_and_payment_mappings(
                dry_run=dry_run, user=user, overwrite=overwrite,
            ),
            'invoice_line_items': self.setup_invoice_line_items(dry_run=dry_run, user=user),
            'branch_departments': self.sync_branch_departments(dry_run=dry_run),
        }
        return result


def get_owner_coa_setup_service():
    from .services import QuickBooksService
    return OwnerCOASetupService(QBOAccountMappingService(QuickBooksService()))
