"""Parts / inventory importer for the centralized data exchange hub."""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

import openpyxl
from django.db import transaction

from apps.branches.models import Branch
from apps.data_exchange.importers.base import (
    BaseImporter,
    ImportCommitResult,
    ImportPreviewResult,
    RowIssue,
)
from apps.data_exchange.utils import clean_value, normalize_header
from apps.inventory.models import Part, PartCategory, StockItem


class PartsImporter(BaseImporter):
    key = 'parts'
    label = 'Parts / Inventory'
    description = (
        'Import catalog parts and branch stock levels from the native parts Excel template. '
        'Stock quantities apply to the selected branch (or branch_code / branch_id option).'
    )
    supports_export = True

    REQUIRED_HEADERS = ('part_number', 'name')

    def default_options(self) -> dict[str, Any]:
        return {
            'update_existing': True,
            'branch_id': None,
            'branch_code': '',
            'default_category': 'Uncategorized',
        }

    def preview(self, file_obj, options: dict[str, Any] | None = None) -> ImportPreviewResult:
        opts = {**self.default_options(), **(options or {})}
        plan = self._build_plan(file_obj, opts, persist=False)
        return ImportPreviewResult(
            format_detected=plan['format_detected'],
            summary=plan['summary'],
            issues=plan['issues'],
            sample_creates=plan['sample_creates'],
            options_echo=opts,
        )

    def commit(self, file_obj, options: dict[str, Any] | None = None) -> ImportCommitResult:
        opts = {**self.default_options(), **(options or {})}
        plan = self._build_plan(file_obj, opts, persist=True)
        return ImportCommitResult(
            summary=plan['summary'],
            created_refs=plan['created_refs'],
            issues=plan['issues'],
        )

    def rollback(self, created_refs: dict[str, list[int]]) -> dict[str, Any]:
        deleted = {'part': 0, 'stock_item': 0}
        skipped = {'part': 0}
        errors: list[str] = []

        for part_id in list(created_refs.get('part') or []):
            try:
                part = Part.objects.filter(pk=part_id).first()
                if not part:
                    skipped['part'] += 1
                    continue
                if part.work_order_parts.exists() if hasattr(part, 'work_order_parts') else False:
                    skipped['part'] += 1
                    errors.append(f'Part {part_id} is used on work orders; skipped')
                    continue
                stock_count = part.stock_items.count()
                part.delete()
                deleted['part'] += 1
                deleted['stock_item'] += stock_count
            except Exception as exc:  # noqa: BLE001
                errors.append(f'Part {part_id}: {exc}')

        return {'deleted': deleted, 'skipped': skipped, 'errors': errors}

    def _build_plan(self, file_obj, opts: dict, *, persist: bool) -> dict:
        rows, headers = self._load_rows(file_obj)
        issues: list[RowIssue] = []
        sample_creates: list[dict] = []
        created_refs = {'part': [], 'stock_item': []}
        summary = {
            'total_rows': 0,
            'rows_to_create': 0,
            'parts_to_create': 0,
            'parts_to_update': 0,
            'parts_created': 0,
            'parts_updated': 0,
            'rows_failed': 0,
            'rows_skipped': 0,
        }

        branch = self._resolve_branch(opts)
        if not branch:
            issues.append(RowIssue(
                row_number=0,
                level='error',
                entity_type='part',
                action='skip',
                code='branch_required',
                message=(
                    'A branch is required for parts import. Select an active branch in the app, '
                    'or pass branch_id / branch_code in import options.'
                ),
            ))
            summary['rows_failed'] = len(rows)
            return {
                'format_detected': 'native_parts',
                'summary': summary,
                'issues': issues,
                'sample_creates': sample_creates,
                'created_refs': created_refs,
            }

        for row_number, row in rows:
            summary['total_rows'] += 1
            part_number = clean_value(row.get('part_number'))
            name = clean_value(row.get('name'))
            if not part_number and not name:
                summary['rows_skipped'] += 1
                continue
            if not part_number or not name:
                summary['rows_failed'] += 1
                issues.append(RowIssue(
                    row_number=row_number,
                    level='error',
                    entity_type='part',
                    action='skip',
                    code='missing_required',
                    identifier=part_number or name,
                    message='Missing part_number or name',
                ))
                continue

            existing = Part.objects.filter(part_number__iexact=part_number).first()
            action = 'update' if existing else 'create'
            if existing and not opts.get('update_existing', True):
                summary['rows_skipped'] += 1
                issues.append(RowIssue(
                    row_number=row_number,
                    level='warning',
                    entity_type='part',
                    action='skip',
                    code='exists',
                    identifier=part_number,
                    message=f'Part {part_number} already exists; skipped (update_existing=false)',
                ))
                continue

            if action == 'create':
                summary['parts_to_create'] += 1
                summary['rows_to_create'] += 1
            else:
                summary['parts_to_update'] += 1

            payload = self._row_payload(row, part_number, name, branch)
            if len(sample_creates) < 25 and action == 'create':
                sample_creates.append({
                    'row_number': row_number,
                    'part_number': part_number,
                    'name': name,
                    'branch': branch.code,
                    'quantity_in_stock': payload['quantity_in_stock'],
                })

            if not persist:
                continue

            try:
                with transaction.atomic():
                    part, created, stock = self._persist_part(payload, existing=existing)
                if created:
                    created_refs['part'].append(part.id)
                    if stock and stock.id:
                        created_refs['stock_item'].append(stock.id)
                    summary['parts_created'] += 1
                else:
                    summary['parts_updated'] += 1
            except Exception as exc:  # noqa: BLE001
                summary['rows_failed'] += 1
                issues.append(RowIssue(
                    row_number=row_number,
                    level='error',
                    entity_type='part',
                    action='skip',
                    code='persist_failed',
                    identifier=part_number,
                    message=str(exc),
                ))

        return {
            'format_detected': 'native_parts',
            'summary': summary,
            'issues': issues,
            'sample_creates': sample_creates,
            'created_refs': created_refs,
        }

    def _load_rows(self, file_obj) -> tuple[list[tuple[int, dict]], list[str]]:
        workbook = openpyxl.load_workbook(file_obj, read_only=True, data_only=True)
        worksheet = workbook.active
        iterator = worksheet.iter_rows(values_only=True)
        raw_headers = next(iterator, None)
        if not raw_headers:
            workbook.close()
            raise ValueError('Excel file is empty')

        headers = [normalize_header(h) for h in raw_headers]
        if not all(required in headers for required in self.REQUIRED_HEADERS):
            workbook.close()
            raise ValueError(
                f'Excel file must contain these columns: {", ".join(self.REQUIRED_HEADERS)}'
            )

        rows: list[tuple[int, dict]] = []
        for idx, values in enumerate(iterator, start=2):
            row = {}
            for col_index, header in enumerate(headers):
                if not header:
                    continue
                row[header] = values[col_index] if col_index < len(values) else None
            if any(clean_value(v) for v in row.values()):
                rows.append((idx, row))
        workbook.close()
        return rows, headers

    def _resolve_branch(self, opts: dict) -> Branch | None:
        branch_id = opts.get('branch_id')
        branch_code = clean_value(opts.get('branch_code')).upper()
        if branch_id:
            try:
                return Branch.objects.filter(pk=int(branch_id), is_active=True).first()
            except (TypeError, ValueError):
                pass
        if branch_code:
            return Branch.objects.filter(code__iexact=branch_code, is_active=True).first()
        return (
            Branch.objects.filter(is_active=True, is_headquarters=True).first()
            or Branch.objects.filter(is_active=True).order_by('id').first()
        )

    def _parse_decimal(self, value: Any, default: Decimal | None = None) -> Decimal | None:
        text = clean_value(value)
        if not text:
            return default
        try:
            return Decimal(text)
        except (InvalidOperation, ValueError):
            return default

    def _parse_int(self, value: Any, default: int = 0) -> int:
        text = clean_value(value)
        if not text:
            return default
        try:
            return int(Decimal(text))
        except (InvalidOperation, ValueError):
            return default

    def _parse_bool(self, value: Any, default: bool) -> bool:
        text = clean_value(value).lower()
        if not text:
            return default
        if text in ('1', 'true', 'yes', 'y'):
            return True
        if text in ('0', 'false', 'no', 'n'):
            return False
        return default

    def _row_payload(self, row: dict, part_number: str, name: str, branch: Branch) -> dict:
        raw_unit = (
            clean_value(row.get('unit') or row.get('unit_of_measure') or 'piece').lower()
        )
        if raw_unit in ('each', 'ea', 'unit'):
            raw_unit = 'piece'

        cost = self._parse_decimal(row.get('cost_price'), Decimal('0.01'))
        selling = self._parse_decimal(row.get('selling_price'), Decimal('0.01'))
        if cost is not None and cost < Decimal('0.01'):
            cost = Decimal('0.01')
        if selling is not None and selling < Decimal('0.01'):
            selling = Decimal('0.01')

        return {
            'part_number': part_number,
            'name': name,
            'description': clean_value(row.get('description')),
            'category_name': clean_value(row.get('category')) or 'Uncategorized',
            'manufacturer': clean_value(row.get('manufacturer')),
            'manufacturer_part_number': clean_value(row.get('manufacturer_part_number')),
            'cost_price': cost or Decimal('0.01'),
            'selling_price': selling or Decimal('0.01'),
            'quantity_in_stock': self._parse_int(row.get('quantity_in_stock'), 0),
            'minimum_stock': self._parse_int(row.get('minimum_stock'), 0),
            'reorder_point': self._parse_int(row.get('reorder_point'), 0),
            'reorder_quantity': self._parse_int(row.get('reorder_quantity'), 0),
            'bin_location': clean_value(row.get('bin_location')) or None,
            'is_taxable': self._parse_bool(row.get('is_taxable'), True),
            'is_core': self._parse_bool(row.get('is_core'), False),
            'core_charge': self._parse_decimal(row.get('core_charge'), Decimal('0.00')) or Decimal('0.00'),
            'unit': raw_unit or 'piece',
            'compatible_makes': clean_value(row.get('compatible_makes')),
            'compatible_models': clean_value(row.get('compatible_models')),
            'compatible_years': clean_value(row.get('compatible_years')),
            'is_active': self._parse_bool(row.get('is_active'), True),
            'branch': branch,
        }

    def _persist_part(
        self,
        payload: dict,
        *,
        existing: Part | None,
    ) -> tuple[Part, bool, StockItem | None]:
        category, _ = PartCategory.objects.get_or_create(
            name=payload['category_name'],
            defaults={'is_active': True, 'description': 'Created by parts import'},
        )
        defaults = {
            'name': payload['name'],
            'description': payload['description'],
            'category': category,
            'manufacturer': payload['manufacturer'],
            'manufacturer_part_number': payload['manufacturer_part_number'],
            'cost_price': payload['cost_price'],
            'selling_price': payload['selling_price'],
            'minimum_stock': payload['minimum_stock'],
            'reorder_point': payload['reorder_point'],
            'reorder_quantity': payload['reorder_quantity'],
            'bin_location': payload['bin_location'] or '',
            'is_taxable': payload['is_taxable'],
            'is_core': payload['is_core'],
            'core_charge': payload['core_charge'],
            'unit': payload['unit'],
            'compatible_makes': payload['compatible_makes'],
            'compatible_models': payload['compatible_models'],
            'compatible_years': payload['compatible_years'],
            'is_active': payload['is_active'],
        }

        created = False
        if existing:
            for key, value in defaults.items():
                setattr(existing, key, value)
            existing.save()
            part = existing
        else:
            part = Part.objects.create(part_number=payload['part_number'], **defaults)
            created = True

        stock, stock_created = StockItem.objects.get_or_create(
            part=part,
            branch=payload['branch'],
            defaults={
                'quantity_in_stock': payload['quantity_in_stock'],
                'minimum_stock': payload['minimum_stock'],
                'reorder_point': payload['reorder_point'],
                'reorder_quantity': payload['reorder_quantity'],
                'bin_location': payload['bin_location'] or '',
            },
        )
        if not stock_created:
            stock.quantity_in_stock = payload['quantity_in_stock']
            stock.minimum_stock = payload['minimum_stock']
            stock.reorder_point = payload['reorder_point']
            stock.reorder_quantity = payload['reorder_quantity']
            if payload['bin_location']:
                stock.bin_location = payload['bin_location']
            stock.save()

        return part, created, stock if stock_created else None
