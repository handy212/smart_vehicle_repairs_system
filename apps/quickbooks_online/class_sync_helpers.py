"""QuickBooks Online Class tracking helpers."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

try:
    from quickbooks.objects.base import Ref
except ModuleNotFoundError:
    Ref = None


def qbo_class_tracking_prefs(client) -> dict[str, bool] | None:
    """
    Return QBO class-tracking preferences, or None when unavailable.

    Keys:
      - per_txn: ClassTrackingPerTxn (header-level on sales docs)
      - per_txn_line: ClassTrackingPerTxnLine (line-level)
    """
    if client is None:
        return None
    try:
        from quickbooks.objects.preferences import Preferences

        prefs = Preferences.get(qb=client)
        accounting = getattr(prefs, 'AccountingInfoPrefs', None)
        if accounting is None:
            return {'per_txn': False, 'per_txn_line': False}

        per_txn = bool(getattr(accounting, 'ClassTrackingPerTxn', False))
        per_txn_line = bool(getattr(accounting, 'ClassTrackingPerTxnLine', False))
        return {'per_txn': per_txn, 'per_txn_line': per_txn_line}
    except Exception as exc:
        logger.warning('Could not read QBO class tracking preferences: %s', exc)
        return None


def class_tracking_enabled(client) -> bool:
    prefs = qbo_class_tracking_prefs(client)
    if prefs is None:
        return False
    return bool(prefs.get('per_txn') or prefs.get('per_txn_line'))


def apply_class_ref_to_detail(detail_obj, class_id: str | None) -> None:
    """Set ClassRef on a QBO line detail object (sales or expense)."""
    if not class_id or detail_obj is None or Ref is None:
        return
    detail_obj.ClassRef = Ref()
    detail_obj.ClassRef.value = str(class_id)


def apply_class_ref_to_txn(qb_txn, class_id: str | None) -> None:
    """Set ClassRef on a QBO transaction header (when per-txn class tracking is enabled)."""
    if not class_id or qb_txn is None or Ref is None:
        return
    qb_txn.ClassRef = Ref()
    qb_txn.ClassRef.value = str(class_id)


def resolve_sales_line_class_id(mapping_service, line_item) -> str | None:
    """Map an invoice/estimate/credit line to a QBO Class id."""
    if mapping_service is None:
        return None

    revenue_product = getattr(line_item, 'revenue_product', None)
    if revenue_product is not None:
        code = getattr(revenue_product, 'code', None)
        if code:
            class_id = mapping_service.resolve_qbo_class_id('revenue_product_class', code)
            if class_id:
                return class_id

    item_type = getattr(line_item, 'item_type', None) or 'other'
    return mapping_service.resolve_qbo_class_id('income_class', str(item_type))


def resolve_ap_line_class_id(mapping_service, *, is_inventory_line: bool) -> str | None:
    """Map a vendor bill/credit/expense line to a QBO Class id."""
    if mapping_service is None:
        return None
    key = 'inventory' if is_inventory_line else 'expense'
    return mapping_service.resolve_qbo_class_id('expense_class', key)
