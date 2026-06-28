"""Repair PO QBOMappings that incorrectly store a QBO Bill Id instead of PurchaseOrder Id."""
from __future__ import annotations

import logging

from django.contrib.contenttypes.models import ContentType

from .models import QBOMapping

logger = logging.getLogger(__name__)


def classify_qbo_id_for_po(client, qbo_id: str) -> str:
    """
    Return how a stored qbo_id resolves in QuickBooks for a PurchaseOrder mapping.

    Values: purchase_order | bill | missing | unknown
    """
    if not qbo_id or client is None:
        return 'missing'

    try:
        from quickbooks.objects.purchaseorder import PurchaseOrder as QBPurchaseOrder

        QBPurchaseOrder.get(int(qbo_id), qb=client)
        return 'purchase_order'
    except Exception:
        pass

    try:
        from quickbooks.objects.bill import Bill as QBBill

        QBBill.get(int(qbo_id), qb=client)
        return 'bill'
    except Exception:
        pass

    return 'unknown'


def repair_legacy_po_qbo_mappings(
    service,
    *,
    dry_run: bool = True,
    resync: bool = False,
) -> dict:
    """
    Find PO mappings whose qbo_id is a Bill (legacy mirror) and restore them.

    Clears the stale mapping; optionally re-pushes the PO to QBO when resync=True.
    """
    from apps.inventory.models import PurchaseOrder

    client = service.get_client()
    if not client:
        return {
            'checked': 0,
            'legacy_bill': 0,
            'cleared': 0,
            'resynced': 0,
            'skipped': 0,
            'errors': ['QuickBooks not connected or unauthorized.'],
            'details': [],
        }

    po_ct = ContentType.objects.get_for_model(PurchaseOrder)
    mappings = list(QBOMapping.objects.filter(content_type=po_ct).exclude(qbo_id=''))

    result = {
        'checked': 0,
        'legacy_bill': 0,
        'cleared': 0,
        'resynced': 0,
        'skipped': 0,
        'errors': [],
        'details': [],
    }

    for mapping in mappings:
        result['checked'] += 1
        kind = classify_qbo_id_for_po(client, mapping.qbo_id)
        if kind == 'purchase_order':
            result['skipped'] += 1
            continue
        if kind != 'bill':
            result['skipped'] += 1
            continue

        result['legacy_bill'] += 1
        try:
            local_po = PurchaseOrder.objects.get(id=mapping.object_id)
        except PurchaseOrder.DoesNotExist:
            result['errors'].append(f'PO mapping {mapping.id}: local PO {mapping.object_id} missing')
            continue

        result['details'].append({
            'po_id': local_po.id,
            'po_number': local_po.po_number,
            'legacy_qbo_id': mapping.qbo_id,
        })

        if dry_run:
            continue

        service.clear_qbo_mapping(local_po)
        result['cleared'] += 1

        if resync:
            try:
                qb_po = service.sync_purchase_order(local_po)
                if qb_po and getattr(qb_po, 'Id', None):
                    result['resynced'] += 1
                else:
                    result['errors'].append(
                        f'PO {local_po.po_number}: cleared legacy Bill Id but re-sync returned no result'
                    )
            except Exception as exc:
                logger.exception('Failed to re-sync PO %s after legacy mapping repair', local_po.po_number)
                result['errors'].append(f'PO {local_po.po_number}: re-sync failed — {exc}')

    return result
