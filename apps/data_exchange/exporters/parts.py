"""Export parts in an import-compatible workbook."""
from __future__ import annotations

from typing import Any

from apps.data_exchange.exporters.base import BaseExporter
from apps.inventory.models import Part


class PartsExporter(BaseExporter):
    key = 'parts'
    label = 'Parts / Inventory'
    description = 'Export parts with stock levels for the selected branch (or first stock row).'

    def export(self, options: dict[str, Any] | None = None) -> tuple:
        opts = options or {}
        branch_id = opts.get('branch_id')
        headers = [
            'part_number',
            'name',
            'description',
            'category',
            'manufacturer',
            'manufacturer_part_number',
            'cost_price',
            'selling_price',
            'quantity_in_stock',
            'minimum_stock',
            'reorder_point',
            'reorder_quantity',
            'bin_location',
            'is_taxable',
            'is_core',
            'core_charge',
            'unit_of_measure',
            'compatible_makes',
            'compatible_models',
            'compatible_years',
            'is_active',
        ]
        rows = []
        qs = Part.objects.select_related('category').prefetch_related('stock_items').order_by('part_number')
        for part in qs.iterator(chunk_size=500):
            stock = None
            stock_items = list(part.stock_items.all())
            if branch_id:
                stock = next((s for s in stock_items if s.branch_id == int(branch_id)), None)
            if stock is None and stock_items:
                stock = stock_items[0]
            rows.append([
                part.part_number,
                part.name,
                part.description or '',
                part.category.name if part.category_id else '',
                part.manufacturer or '',
                part.manufacturer_part_number or '',
                part.cost_price,
                part.selling_price,
                stock.quantity_in_stock if stock else 0,
                stock.minimum_stock if stock else part.minimum_stock,
                stock.reorder_point if stock else part.reorder_point,
                stock.reorder_quantity if stock else part.reorder_quantity,
                (stock.bin_location if stock else part.bin_location) or '',
                'true' if part.is_taxable else 'false',
                'true' if part.is_core else 'false',
                part.core_charge,
                part.unit,
                part.compatible_makes or '',
                part.compatible_models or '',
                part.compatible_years or '',
                'true' if part.is_active else 'false',
            ])
        buffer = self._workbook_from_rows(headers, rows, 'Parts')
        return buffer, 'parts_export.xlsx', (
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
