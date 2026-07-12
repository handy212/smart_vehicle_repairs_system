"""QBO-aligned inventory reports (columns match QuickBooks Online layouts)."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time
from decimal import Decimal

from django.db.models import Prefetch
from django.utils import timezone

from .models import InventoryTransaction, PurchaseOrder, PurchaseOrderItem, StockItem
from .part_catalog import part_tracks_stock

OPEN_PO_STATUSES = (
    "pending_approval",
    "approved",
    "confirmed",
    "partially_received",
)

# Map SVR movement types to QBO-style transaction type labels.
TXN_TYPE_LABELS = {
    "purchase": "Purchase/Receive",
    "sale": "Invoice",
    "adjustment": "Inventory Qty Adjust",
    "return": "Vendor Credit",
    "damage": "Inventory Qty Adjust",
    "loss": "Inventory Qty Adjust",
    "transfer": "Transfer",
    "transfer_in": "Transfer",
    "transfer_out": "Transfer",
    "count": "Inventory Qty Adjust",
    "correction": "Inventory Qty Adjust",
    "found": "Inventory Qty Adjust",
    "reserve": "Reservation",
    "release": "Release Reservation",
}


def _as_float(value) -> float:
    if value is None:
        return 0.0
    return float(value)


def _qty_remaining(item: PurchaseOrderItem) -> Decimal:
    ordered = Decimal(str(item.quantity or 0))
    received = Decimal(str(item.quantity_received or 0))
    remaining = ordered - received
    return remaining if remaining > 0 else Decimal("0")


def _parse_date(value) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _day_start(d: date):
    return timezone.make_aware(datetime.combine(d, time.min))


def _day_end(d: date):
    return timezone.make_aware(datetime.combine(d, time.max))


class QboStyleInventoryReports:
    """Builders aligned to QuickBooks Online inventory report columns."""

    @staticmethod
    def inventory_valuation_detail(
        *,
        branch_id: int | None = None,
        include_zero: bool = False,
        date_from: date | str | None = None,
        date_to: date | str | None = None,
    ) -> dict:
        """
        QBO columns:
        Product/Service | Transaction date | Transaction type | Number | Name |
        Qty | Rate | Inventory cost | Qty on hand | Asset value
        Grouped by product with subtotals.
        """
        start = _parse_date(date_from)
        end = _parse_date(date_to) or timezone.now().date()

        stock_qs = (
            StockItem.objects.select_related(
                "part", "part__category", "part__preferred_supplier", "branch"
            )
            .filter(part__is_active=True, part__item_type="inventory")
            .order_by("part__name", "part__part_number")
        )
        if branch_id:
            stock_qs = stock_qs.filter(branch_id=branch_id)
        if not include_zero:
            stock_qs = stock_qs.filter(quantity_in_stock__gt=0)

        # Aggregate qty/cost by part across selected branch(es)
        part_state: dict[int, dict] = {}
        for stock in stock_qs:
            part = stock.part
            if not part_tracks_stock(part):
                continue
            bucket = part_state.setdefault(
                part.id,
                {
                    "part": part,
                    "qty": Decimal("0"),
                    "unit_cost": Decimal(str(part.cost_price or 0)),
                },
            )
            bucket["qty"] += Decimal(str(stock.quantity_in_stock or 0))

        txn_qs = (
            InventoryTransaction.objects.select_related(
                "part",
                "part__preferred_supplier",
                "purchase_order",
                "purchase_order__supplier",
                "work_order",
                "work_order__customer",
                "created_by",
                "branch",
            )
            .filter(part_id__in=part_state.keys())
            .order_by("part_id", "transaction_date", "id")
        )
        if branch_id:
            txn_qs = txn_qs.filter(branch_id=branch_id)
        if start:
            txn_qs = txn_qs.filter(transaction_date__gte=_day_start(start))
        if end:
            txn_qs = txn_qs.filter(transaction_date__lte=_day_end(end))

        txns_by_part: dict[int, list] = defaultdict(list)
        for txn in txn_qs:
            txns_by_part[txn.part_id].append(txn)

        groups = []
        grand_qty = Decimal("0")
        grand_inventory_cost = Decimal("0")
        grand_qty_on_hand = Decimal("0")
        grand_asset = Decimal("0")

        for part_id, state in sorted(
            part_state.items(),
            key=lambda item: (item[1]["part"].name or "", item[1]["part"].part_number or ""),
        ):
            part = state["part"]
            product_name = part.name or part.part_number
            unit_cost = state["unit_cost"]
            current_qty = state["qty"]
            current_asset = current_qty * unit_cost
            lines = []

            txns = txns_by_part.get(part_id, [])
            if not txns:
                # Mirror QBO "Inventory Starting Value" / START when no movement history in range.
                if current_qty > 0 or include_zero:
                    inventory_cost = current_qty * unit_cost
                    lines.append(
                        {
                            "product_service": product_name,
                            "transaction_date": (start or end).isoformat() if (start or end) else None,
                            "transaction_type": "Inventory Starting Value",
                            "number": "START",
                            "name": "",
                            "qty": _as_float(current_qty),
                            "rate": _as_float(unit_cost),
                            "inventory_cost": _as_float(inventory_cost),
                            "qty_on_hand": _as_float(current_qty),
                            "asset_value": _as_float(current_asset),
                        }
                    )
            else:
                # Rebuild running qty within the filtered txn set using balance_after when present.
                for txn in txns:
                    qty = Decimal(str(txn.quantity or 0))
                    rate = Decimal(str(txn.unit_cost if txn.unit_cost is not None else unit_cost))
                    inventory_cost = Decimal(str(txn.total_cost)) if txn.total_cost is not None else abs(qty) * rate
                    qty_on_hand = Decimal(str(txn.balance_after if txn.balance_after is not None else 0))
                    asset_value = qty_on_hand * rate

                    number = ""
                    name = ""
                    if txn.purchase_order_id:
                        number = txn.purchase_order.po_number
                        name = (
                            txn.purchase_order.supplier.name
                            if getattr(txn.purchase_order, "supplier_id", None)
                            else ""
                        )
                    elif txn.work_order_id:
                        number = getattr(txn.work_order, "work_order_number", "") or str(txn.work_order_id)
                        customer = getattr(txn.work_order, "customer", None)
                        if customer:
                            name = getattr(customer, "full_name", None) or getattr(customer, "company_name", "") or ""

                    txn_type = TXN_TYPE_LABELS.get(txn.transaction_type, txn.get_transaction_type_display())
                    # First positive purchase with no prior history label can read like QBO starting value.
                    if txn.transaction_type == "purchase" and not number:
                        txn_type = "Inventory Starting Value"
                        number = number or "START"

                    lines.append(
                        {
                            "product_service": product_name,
                            "transaction_date": (
                                timezone.localtime(txn.transaction_date).date().isoformat()
                                if txn.transaction_date
                                else None
                            ),
                            "transaction_type": txn_type,
                            "number": number,
                            "name": name,
                            "qty": _as_float(qty),
                            "rate": _as_float(rate),
                            "inventory_cost": _as_float(inventory_cost),
                            "qty_on_hand": _as_float(qty_on_hand),
                            "asset_value": _as_float(asset_value),
                        }
                    )

            if not lines:
                continue

            subtotal_qty = sum(Decimal(str(line["qty"])) for line in lines)
            subtotal_inventory_cost = sum(Decimal(str(line["inventory_cost"])) for line in lines)
            # QBO subtotal uses ending qty on hand / asset for the item
            ending = lines[-1]
            groups.append(
                {
                    "product_service": product_name,
                    "sku": part.part_number,
                    "part_id": part.id,
                    "lines": lines,
                    "subtotal": {
                        "qty": _as_float(subtotal_qty),
                        "inventory_cost": _as_float(subtotal_inventory_cost),
                        "qty_on_hand": ending["qty_on_hand"],
                        "asset_value": ending["asset_value"],
                    },
                }
            )
            grand_qty += subtotal_qty
            grand_inventory_cost += subtotal_inventory_cost
            grand_qty_on_hand += Decimal(str(ending["qty_on_hand"]))
            grand_asset += Decimal(str(ending["asset_value"]))

        return {
            "report": "inventory_valuation_detail",
            "as_of": end.isoformat() if end else None,
            "date_from": start.isoformat() if start else None,
            "date_to": end.isoformat() if end else None,
            "summary": {
                "group_count": len(groups),
                "total_qty": _as_float(grand_qty),
                "total_inventory_cost": _as_float(grand_inventory_cost),
                "total_qty_on_hand": _as_float(grand_qty_on_hand),
                "total_asset_value": _as_float(grand_asset),
            },
            "groups": groups,
        }

    @staticmethod
    def inventory_valuation_summary(
        *,
        branch_id: int | None = None,
        include_zero: bool = False,
        date_from: date | str | None = None,
        date_to: date | str | None = None,
    ) -> dict:
        """
        QBO columns:
        Product/Service | SKU | Qty | Asset Value | Calc. Avg
        """
        # Summary is as-of stock snapshot (QBO "As of" report).
        stock_qs = (
            StockItem.objects.select_related("part", "part__category", "branch")
            .filter(part__is_active=True, part__item_type="inventory")
            .order_by("part__name", "part__part_number")
        )
        if branch_id:
            stock_qs = stock_qs.filter(branch_id=branch_id)
        if not include_zero:
            stock_qs = stock_qs.filter(quantity_in_stock__gt=0)

        by_part: dict[int, dict] = {}
        for stock in stock_qs:
            part = stock.part
            if not part_tracks_stock(part):
                continue
            bucket = by_part.setdefault(
                part.id,
                {
                    "product_service": part.name or part.part_number,
                    "sku": part.part_number,
                    "qty": Decimal("0"),
                    "unit_cost": Decimal(str(part.cost_price or 0)),
                },
            )
            bucket["qty"] += Decimal(str(stock.quantity_in_stock or 0))

        rows = []
        total_qty = Decimal("0")
        total_asset = Decimal("0")
        for bucket in sorted(by_part.values(), key=lambda row: (row["product_service"], row["sku"])):
            qty = bucket["qty"]
            asset = qty * bucket["unit_cost"]
            calc_avg = (asset / qty) if qty else Decimal("0")
            rows.append(
                {
                    "product_service": bucket["product_service"],
                    "sku": bucket["sku"],
                    "qty": _as_float(qty),
                    "asset_value": _as_float(asset),
                    "calc_avg": _as_float(calc_avg),
                }
            )
            total_qty += qty
            total_asset += asset

        overall_avg = (total_asset / total_qty) if total_qty else Decimal("0")
        end = _parse_date(date_to) or timezone.now().date()
        return {
            "report": "inventory_valuation_summary",
            "as_of": end.isoformat(),
            "summary": {
                "sku_count": len(rows),
                "total_qty": _as_float(total_qty),
                "total_asset_value": _as_float(total_asset),
                "calc_avg": _as_float(overall_avg),
            },
            "rows": rows,
        }

    @staticmethod
    def _open_po_queryset(*, branch_id: int | None = None, date_from=None, date_to=None):
        qs = (
            PurchaseOrder.objects.select_related("supplier", "branch", "created_by")
            .prefetch_related(
                Prefetch(
                    "items",
                    queryset=PurchaseOrderItem.objects.select_related(
                        "part", "part__category"
                    ).order_by("part__part_number", "id"),
                )
            )
            .filter(status__in=OPEN_PO_STATUSES)
            .order_by("supplier__name", "order_date", "po_number")
        )
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        start = _parse_date(date_from)
        end = _parse_date(date_to)
        if start:
            qs = qs.filter(order_date__gte=start)
        if end:
            qs = qs.filter(order_date__lte=end)
        return qs

    @staticmethod
    def open_purchase_order_list(
        *,
        branch_id: int | None = None,
        date_from: date | str | None = None,
        date_to: date | str | None = None,
    ) -> dict:
        """
        QBO "Open Purchase Order List by Supplier" columns:
        Date | Number | Memo | Ship via | Amount | Open Balance
        Grouped by supplier.
        """
        groups_map: dict[str, dict] = {}
        total_amount = Decimal("0")
        total_open = Decimal("0")

        for po in QboStyleInventoryReports._open_po_queryset(
            branch_id=branch_id, date_from=date_from, date_to=date_to
        ):
            open_value = Decimal("0")
            has_open = False
            for item in po.items.all():
                remaining = _qty_remaining(item)
                if remaining <= 0:
                    continue
                has_open = True
                open_value += remaining * Decimal(str(item.unit_cost or 0))
            if not has_open:
                continue

            amount = Decimal(str(po.total or 0))
            supplier_name = po.supplier.name if po.supplier_id else "No supplier"
            group = groups_map.setdefault(
                supplier_name,
                {"supplier_display_name": supplier_name, "rows": [], "subtotal_amount": 0.0, "subtotal_open_balance": 0.0},
            )
            row = {
                "po_id": po.id,
                "date": po.order_date.isoformat() if po.order_date else None,
                "number": po.po_number,
                "memo": po.notes or "",
                "ship_via": "",  # not tracked in SVR
                "amount": _as_float(amount),
                "open_balance": _as_float(open_value),
            }
            group["rows"].append(row)
            group["subtotal_amount"] = _as_float(Decimal(str(group["subtotal_amount"])) + amount)
            group["subtotal_open_balance"] = _as_float(
                Decimal(str(group["subtotal_open_balance"])) + open_value
            )
            total_amount += amount
            total_open += open_value

        groups = sorted(groups_map.values(), key=lambda g: g["supplier_display_name"])
        return {
            "report": "open_purchase_order_list",
            "summary": {
                "po_count": sum(len(g["rows"]) for g in groups),
                "total_amount": _as_float(total_amount),
                "total_open_balance": _as_float(total_open),
            },
            "groups": groups,
        }

    @staticmethod
    def open_purchase_order_detail(
        *,
        branch_id: int | None = None,
        date_from: date | str | None = None,
        date_to: date | str | None = None,
    ) -> dict:
        """
        QBO columns:
        Transaction date | Number | Supplier display name | Product/Service full name |
        Account Name | Quantity | Billed quantity | Backordered quantity |
        Total amount | Received amount | PO open balance
        """
        lines = []
        total_open = Decimal("0")

        for po in QboStyleInventoryReports._open_po_queryset(
            branch_id=branch_id, date_from=date_from, date_to=date_to
        ):
            for item in po.items.all():
                remaining = _qty_remaining(item)
                if remaining <= 0:
                    continue
                unit_cost = Decimal(str(item.unit_cost or 0))
                ordered = Decimal(str(item.quantity or 0))
                received = Decimal(str(item.quantity_received or 0))
                total_amount = ordered * unit_cost
                received_amount = received * unit_cost
                open_balance = remaining * unit_cost
                total_open += open_balance
                part = item.part
                product_full_name = ""
                if part:
                    product_full_name = (
                        f"{part.part_number}: {part.name}" if part.part_number else (part.name or "")
                    )
                lines.append(
                    {
                        "po_id": po.id,
                        "transaction_date": po.order_date.isoformat() if po.order_date else None,
                        "number": po.po_number,
                        "supplier_display_name": po.supplier.name if po.supplier_id else "",
                        "product_service_full_name": product_full_name,
                        "account_name": "Inventory Asset",
                        "quantity": _as_float(ordered),
                        "billed_quantity": _as_float(received),  # closest SVR equivalent
                        "backordered_quantity": _as_float(remaining),
                        "total_amount": _as_float(total_amount),
                        "received_amount": _as_float(received_amount),
                        "po_open_balance": _as_float(open_balance),
                    }
                )

        return {
            "report": "open_purchase_order_detail",
            "summary": {
                "line_count": len(lines),
                "total_open_balance": _as_float(total_open),
            },
            "lines": lines,
        }

    @staticmethod
    def stock_take_worksheet(*, branch_id: int | None = None, include_zero: bool = True) -> dict:
        """
        QBO Stocktake Worksheet columns:
        Product/Service | Memo/Description | Category | Preferred supplier name |
        Quantity on hand | Physical Count
        """
        stock_qs = (
            StockItem.objects.select_related(
                "part", "part__category", "part__preferred_supplier", "branch"
            )
            .filter(part__is_active=True, part__item_type="inventory")
            .order_by("part__name", "part__part_number")
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
                    "product_service": part.name or part.part_number,
                    "memo_description": part.description or "",
                    "category": part.category.name if part.category_id else "",
                    "preferred_supplier_name": (
                        part.preferred_supplier.name if part.preferred_supplier_id else ""
                    ),
                    "quantity_on_hand": _as_float(qty),
                    "physical_count": None,
                }
            )

        return {
            "report": "stock_take_worksheet",
            "summary": {"line_count": len(lines)},
            "lines": lines,
        }
