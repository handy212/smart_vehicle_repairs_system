"""QuickBooks Online Inventory Adjustment sync for SVR stock corrections."""

from __future__ import annotations

import logging
from datetime import date

from django.contrib.contenttypes.models import ContentType

from .models import QBOMapping
from .outbound_log import get_mapping_error

logger = logging.getLogger(__name__)

QBO_INVENTORY_ADJUSTMENT_TYPES = frozenset({
    'adjustment', 'correction', 'count', 'damage', 'loss', 'found',
})

try:
    from quickbooks.objects.base import QuickbooksManagedObject, Ref
except ModuleNotFoundError:
    QuickbooksManagedObject = object  # type: ignore[misc, assignment]
    Ref = None


class QBInventoryAdjustment(QuickbooksManagedObject):
    """
    Minimal QBO InventoryAdjustment entity (not shipped in python-quickbooks 0.9.x).

    Expected create/update payload shape (covered by tests/test_inventory_adjustment_sync.py):
    TxnDate, PrivateNote, optional DepartmentRef, and Line[] with ItemBasedExpenseLineDetail
    (ItemRef + QtyDiff). Id/SyncToken required on update.
    """

    class Meta:
        pass

    name = 'InventoryAdjustment'
    list_dict = {
        'TxnDate': 'TxnDate',
        'PrivateNote': 'PrivateNote',
        'Line': 'Line',
        'DepartmentRef': 'DepartmentRef',
    }
    detail_dict = {
        'TxnDate': 'TxnDate',
        'PrivateNote': 'PrivateNote',
        'Line': 'Line',
        'DepartmentRef': 'DepartmentRef',
        'Id': 'Id',
        'SyncToken': 'SyncToken',
    }


def _txn_date(txn) -> date:
    created = getattr(txn, 'created_at', None)
    if created:
        return created.date()
    return date.today()


def _adjustment_note(txn) -> str:
    txn_type = getattr(txn, 'transaction_type', '') or 'adjustment'
    reason = (getattr(txn, 'reason', '') or '').strip()
    notes = (getattr(txn, 'notes', '') or '').strip()
    parts = [f'SVR inventory {txn_type}']
    if reason:
        parts.append(reason)
    if notes:
        parts.append(notes)
    return ' — '.join(parts)[:4000]


def sync_inventory_adjustment(service, local_txn):
    """
    Push a stock correction to QBO as an InventoryAdjustment document.

    Uses QtyDiff on the mapped Part Item. Ensures the Item exists without overwriting
    QtyOnHand (company-wide total); the adjustment document owns the qty delta.
    """
    if local_txn is None:
        return None, 'Missing inventory transaction.'

    txn_type = getattr(local_txn, 'transaction_type', '')
    if txn_type not in QBO_INVENTORY_ADJUSTMENT_TYPES:
        return None, f'Transaction type "{txn_type}" is not eligible for QBO inventory adjustment sync.'

    part = getattr(local_txn, 'part', None)
    if part is None or not part.tracks_inventory():
        return None, 'Only inventory-type parts sync as QBO inventory adjustments.'

    qty_diff = float(getattr(local_txn, 'quantity', 0) or 0)
    if qty_diff == 0:
        return None, 'Zero-quantity adjustment skipped.'

    client = service.get_client()
    if not client:
        return None, 'QuickBooks not connected or unauthorized.'

    from .item_sync import ensure_part_item_for_inventory_adjustment

    qb_item = ensure_part_item_for_inventory_adjustment(service, part)
    if not qb_item or not getattr(qb_item, 'Id', None):
        return None, (get_mapping_error(part) if hasattr(service, '_mapping_error') else '') or 'Part is not synced to QuickBooks.'

    branch = getattr(local_txn, 'branch', None)

    ct = ContentType.objects.get_for_model(local_txn)
    mapping = QBOMapping.objects.filter(content_type=ct, object_id=local_txn.id).first()

    qb_adj = QBInventoryAdjustment()
    if mapping and mapping.qbo_id:
        try:
            qb_adj = QBInventoryAdjustment.get(int(mapping.qbo_id), qb=client)
        except Exception as exc:
            logger.warning('Could not load QBO inventory adjustment %s: %s', mapping.qbo_id, exc)
            mapping.qbo_id = ''
            mapping.save(update_fields=['qbo_id'])

    qb_adj.TxnDate = _txn_date(local_txn).isoformat()
    qb_adj.PrivateNote = _adjustment_note(local_txn)

    line = {
        'DetailType': 'ItemAdjustmentLineDetail',
        'ItemAdjustmentLineDetail': {
            'ItemRef': {'value': str(qb_item.Id)},
            'QtyDiff': qty_diff,
        },
    }
    qb_adj.Line = [line]

    service._apply_department_ref(qb_adj, branch)

    try:
        service._save_qb(qb_adj, client)
        service._update_qbo_mapping(local_txn, qb_adj)
        return qb_adj, None
    except Exception as exc:
        logger.error('QBO inventory adjustment sync failed for txn %s: %s', local_txn.pk, exc)
        service._update_qbo_mapping(local_txn, None, error=str(exc))
        return None, str(exc)
