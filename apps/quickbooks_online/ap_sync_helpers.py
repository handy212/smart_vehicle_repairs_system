"""Helpers for QuickBooks AP document sync (PO, Bill PO links)."""
from __future__ import annotations


def po_item_is_inventory_line(item) -> bool:
    part = getattr(item, 'part', None)
    if part is None:
        return False
    tracks = getattr(part, 'tracks_inventory', None)
    if callable(tracks):
        return tracks()
    return getattr(part, 'item_type', None) == 'inventory'


def match_po_line_for_bill_line(bill_line, purchase_order):
    """Find PO line matching a bill line by linked inventory item or part."""
    if not purchase_order:
        return None
    inv = getattr(bill_line, 'inventory_item', None)
    if not inv:
        return None
    for po_line in purchase_order.items.all():
        if po_line.part_id == inv.id:
            return po_line
    return None


def apply_bill_po_linked_txn(qb_bill, purchase_order, line_items, *, LinkedTxn):
    """Attach QBO PurchaseOrder LinkedTxn at bill and line level."""
    if not purchase_order or LinkedTxn is None:
        return

    from django.contrib.contenttypes.models import ContentType

    from apps.quickbooks_online.models import QBOMapping

    po_mapping = QBOMapping.objects.filter(
        content_type=ContentType.objects.get_for_model(purchase_order),
        object_id=purchase_order.id,
    ).exclude(qbo_id='').first()
    if not po_mapping:
        return

    po_qbo_id = str(po_mapping.qbo_id)
    linked = LinkedTxn()
    linked.TxnId = po_qbo_id
    linked.TxnType = 'PurchaseOrder'
    qb_bill.LinkedTxn = [linked]

    if not getattr(qb_bill, 'Line', None):
        return

    po_lines = {pl.part_id: pl for pl in purchase_order.items.all()}
    for qb_line, bill_line in zip(qb_bill.Line, line_items):
        inv = getattr(bill_line, 'inventory_item', None)
        po_line = po_lines.get(inv.id) if inv else match_po_line_for_bill_line(bill_line, purchase_order)
        if not po_line or not po_line.qbo_line_id:
            continue
        line_link = LinkedTxn()
        line_link.TxnId = po_qbo_id
        line_link.TxnType = 'PurchaseOrder'
        line_link.TxnLineId = str(po_line.qbo_line_id)
        qb_line.LinkedTxn = [line_link]


def persist_po_line_qbo_ids(local_po, qb_po):
    """Store QBO line Ids on PurchaseOrderItem rows after PO sync."""
    if not qb_po or not getattr(qb_po, 'Line', None):
        return

    local_items = list(local_po.items.order_by('id'))
    qb_lines = list(qb_po.Line)
    for idx, local_item in enumerate(local_items):
        if idx >= len(qb_lines):
            break
        qb_line_id = getattr(qb_lines[idx], 'Id', None)
        if qb_line_id and local_item.qbo_line_id != str(qb_line_id):
            from apps.inventory.models import PurchaseOrderItem

            PurchaseOrderItem.objects.filter(pk=local_item.pk).update(qbo_line_id=str(qb_line_id))
