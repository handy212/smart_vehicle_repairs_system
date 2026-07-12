"""QBO-style inventory operational reports (valuation, open POs, stock take)."""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Prefetch

from .models import PurchaseOrder, PurchaseOrderItem, StockItem
from .part_catalog import part_tracks_stock

OPEN_PO_STATUSES = (
    "pending_approval",
    "approved",
    "confirmed",
    "partially_received",
)


def _as_float(value) -> float:
    if value is None:
        return 0.0
    return float(value)


def _qty_remaining(item: PurchaseOrderItem) -> Decimal:
    ordered = Decimal(str(item.quantity or 0))
    received = Decimal(str(item.quantity_received or 0))
    remaining = ordered - received
    return remaining if remaining > 0 else Decimal("0")


class QboStyleInventoryReports:
    """Builders for QuickBooks Online–like inventory reports."""

    @staticmethod
    def inventory_valuation_detail(*, branch_id: int | None = None, include_zero: bool = False) -> dict:
        stock_qs = (
            StockItem.objects.select_related("part", "part__category", "part__preferred_supplier", "branch")
            .filter(part__is_active=True, part__item_type="inventory")
            .order_by("part__category__name", "part__part_number", "part__name", "branch__name")
        )
        if branch_id:
            stock_qs = stock_qs.filter(branch_id=branch_id)
        if not include_zero:
            stock_qs = stock_qs.filter(quantity_in_stock__gt=0)

        lines = []
        total_qty = Decimal("0")
        total_asset = Decimal("0")

        for stock in stock_qs:
            part = stock.part
            if not part_tracks_stock(part):
                continue
            qty = Decimal(str(stock.quantity_in_stock or 0))
            unit_cost = Decimal(str(part.cost_price or 0))
            asset_value = qty * unit_cost
            total_qty += qty
            total_asset += asset_value
            lines.append(
                {
                    "part_id": part.id,
                    "part_number": part.part_number,
                    "part_name": part.name,
                    "category": part.category.name if part.category_id else "Uncategorized",
                    "supplier": part.preferred_supplier.name if part.preferred_supplier_id else "",
                    "branch_id": stock.branch_id,
                    "branch_name": stock.branch.name if stock.branch_id else "",
                    "quantity_on_hand": _as_float(qty),
                    "unit_cost": _as_float(unit_cost),
                    "asset_value": _as_float(asset_value),
                }
            )

        return {
            "report": "inventory_valuation_detail",
            "summary": {
                "line_count": len(lines),
                "total_quantity": _as_float(total_qty),
                "total_asset_value": _as_float(total_asset),
            },
            "lines": lines,
        }

    @staticmethod
    def inventory_valuation_summary(*, branch_id: int | None = None, include_zero: bool = False) -> dict:
        detail = QboStyleInventoryReports.inventory_valuation_detail(
            branch_id=branch_id,
            include_zero=include_zero,
        )
        by_category: dict[str, dict] = {}
        for line in detail["lines"]:
            category = line["category"] or "Uncategorized"
            bucket = by_category.setdefault(
                category,
                {"category": category, "sku_count": 0, "quantity_on_hand": 0.0, "asset_value": 0.0},
            )
            bucket["sku_count"] += 1
            bucket["quantity_on_hand"] += line["quantity_on_hand"]
            bucket["asset_value"] += line["asset_value"]

        rows = sorted(by_category.values(), key=lambda row: row["asset_value"], reverse=True)
        return {
            "report": "inventory_valuation_summary",
            "summary": detail["summary"],
            "by_category": rows,
        }

    @staticmethod
    def _open_po_queryset(*, branch_id: int | None = None):
        qs = (
            PurchaseOrder.objects.select_related("supplier", "branch", "created_by")
            .prefetch_related(
                Prefetch(
                    "items",
                    queryset=PurchaseOrderItem.objects.select_related("part", "part__category").order_by(
                        "part__part_number", "id"
                    ),
                )
            )
            .filter(status__in=OPEN_PO_STATUSES)
            .order_by("expected_delivery_date", "order_date", "po_number")
        )
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        return qs

    @staticmethod
    def open_purchase_order_list(*, branch_id: int | None = None) -> dict:
        rows = []
        total_open_value = Decimal("0")
        total_open_qty = Decimal("0")

        for po in QboStyleInventoryReports._open_po_queryset(branch_id=branch_id):
            open_qty = Decimal("0")
            open_value = Decimal("0")
            line_count = 0
            for item in po.items.all():
                remaining = _qty_remaining(item)
                if remaining <= 0:
                    continue
                line_count += 1
                open_qty += remaining
                open_value += remaining * Decimal(str(item.unit_cost or 0))

            if line_count == 0:
                continue

            total_open_qty += open_qty
            total_open_value += open_value
            rows.append(
                {
                    "id": po.id,
                    "po_number": po.po_number,
                    "status": po.status,
                    "status_display": po.get_status_display(),
                    "supplier_id": po.supplier_id,
                    "supplier_name": po.supplier.name if po.supplier_id else "",
                    "branch_id": po.branch_id,
                    "branch_name": po.branch.name if po.branch_id else "",
                    "order_date": po.order_date.isoformat() if po.order_date else None,
                    "expected_delivery_date": (
                        po.expected_delivery_date.isoformat() if po.expected_delivery_date else None
                    ),
                    "open_line_count": line_count,
                    "open_quantity": _as_float(open_qty),
                    "open_value": _as_float(open_value),
                    "po_total": _as_float(po.total),
                }
            )

        return {
            "report": "open_purchase_order_list",
            "summary": {
                "po_count": len(rows),
                "total_open_quantity": _as_float(total_open_qty),
                "total_open_value": _as_float(total_open_value),
            },
            "purchase_orders": rows,
        }

    @staticmethod
    def open_purchase_order_detail(*, branch_id: int | None = None) -> dict:
        lines = []
        total_open_qty = Decimal("0")
        total_open_value = Decimal("0")

        for po in QboStyleInventoryReports._open_po_queryset(branch_id=branch_id):
            for item in po.items.all():
                remaining = _qty_remaining(item)
                if remaining <= 0:
                    continue
                unit_cost = Decimal(str(item.unit_cost or 0))
                open_value = remaining * unit_cost
                total_open_qty += remaining
                total_open_value += open_value
                part = item.part
                lines.append(
                    {
                        "po_id": po.id,
                        "po_number": po.po_number,
                        "status": po.status,
                        "status_display": po.get_status_display(),
                        "supplier_name": po.supplier.name if po.supplier_id else "",
                        "branch_name": po.branch.name if po.branch_id else "",
                        "order_date": po.order_date.isoformat() if po.order_date else None,
                        "expected_delivery_date": (
                            po.expected_delivery_date.isoformat() if po.expected_delivery_date else None
                        ),
                        "part_id": part.id if part else None,
                        "part_number": part.part_number if part else "",
                        "part_name": part.name if part else (item.description or ""),
                        "category": part.category.name if part and part.category_id else "Uncategorized",
                        "ordered_quantity": _as_float(item.quantity),
                        "received_quantity": _as_float(item.quantity_received),
                        "open_quantity": _as_float(remaining),
                        "unit_cost": _as_float(unit_cost),
                        "open_value": _as_float(open_value),
                    }
                )

        return {
            "report": "open_purchase_order_detail",
            "summary": {
                "line_count": len(lines),
                "total_open_quantity": _as_float(total_open_qty),
                "total_open_value": _as_float(total_open_value),
            },
            "lines": lines,
        }

    @staticmethod
    def stock_take_worksheet(*, branch_id: int | None = None, include_zero: bool = True) -> dict:
        """Worksheet of expected on-hand qty with blank physical-count columns."""
        stock_qs = (
            StockItem.objects.select_related("part", "part__category", "branch")
            .filter(part__is_active=True, part__item_type="inventory")
            .order_by("part__category__name", "part__part_number", "part__name")
        )
        if branch_id:
            stock_qs = stock_qs.filter(branch_id=branch_id)
        if not include_zero:
            stock_qs = stock_qs.filter(quantity_in_stock__gt=0)

        lines = []
        for stock in stock_qs:
            part = stock.part
            if not part_tracks_stock(part):
                continue
            qty = Decimal(str(stock.quantity_in_stock or 0))
            lines.append(
                {
                    "stock_item_id": stock.id,
                    "part_id": part.id,
                    "part_number": part.part_number,
                    "part_name": part.name,
                    "category": part.category.name if part.category_id else "Uncategorized",
                    "branch_id": stock.branch_id,
                    "branch_name": stock.branch.name if stock.branch_id else "",
                    "bin_location": stock.bin_location or "",
                    "system_quantity": _as_float(qty),
                    "physical_quantity": None,
                    "difference": None,
                }
            )

        return {
            "report": "stock_take_worksheet",
            "summary": {
                "line_count": len(lines),
            },
            "lines": lines,
        }
