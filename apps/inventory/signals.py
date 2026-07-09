"""
Inventory signals — stock changes and QBO quantity sync for Inventory-type parts.
"""
import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.inventory.models import InventoryTransaction, StockItem

logger = logging.getLogger(__name__)

QBO_ADJUSTMENT_TXN_TYPES = frozenset({
    'adjustment', 'correction', 'count', 'damage', 'loss', 'found',
})


@receiver(post_save, sender=StockItem)
def sync_inventory_part_qty_to_qbo(sender, instance, **kwargs):
    """Push updated qty on hand to QBO when branch stock changes."""
    from django.conf import settings
    from apps.quickbooks_online.sync_context import outbound_signals_suppressed, item_qty_sync_suppressed

    if item_qty_sync_suppressed():
        return
    if not getattr(settings, 'QUICKBOOKS_AUTO_SYNC_ENABLED', True) or outbound_signals_suppressed():
        return
    part = instance.part
    if part.tracks_inventory() and part.is_active:
        from apps.quickbooks_online.task_dispatch import schedule_part_sync

        schedule_part_sync(part.id)


@receiver(post_save, sender=InventoryTransaction)
def sync_inventory_adjustment_to_qbo(sender, instance, created, **kwargs):
    """Push stock corrections to QBO as InventoryAdjustment documents."""
    from django.conf import settings
    from django.db import transaction as db_transaction
    from apps.quickbooks_online.sync_context import outbound_signals_suppressed

    if not created:
        return
    if instance.transaction_type not in QBO_ADJUSTMENT_TXN_TYPES:
        return
    if not getattr(settings, 'QUICKBOOKS_AUTO_SYNC_ENABLED', True) or outbound_signals_suppressed():
        return
    part = instance.part
    if not part or not part.tracks_inventory():
        return

    from apps.quickbooks_online.tasks import task_sync_inventory_adjustment_to_qbo
    from apps.quickbooks_online.task_dispatch import schedule_entity_sync

    db_transaction.on_commit(
        lambda: schedule_entity_sync(
            'inventory_adjustment',
            instance.id,
            task=task_sync_inventory_adjustment_to_qbo,
        )
    )
