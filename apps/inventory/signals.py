"""
Inventory signals — stock changes and QBO quantity sync for Inventory-type parts.
"""
import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.inventory.models import InventoryTransaction, StockItem

logger = logging.getLogger(__name__)


@receiver(post_save, sender=StockItem)
def sync_inventory_part_qty_to_qbo(sender, instance, **kwargs):
    """Push updated qty on hand to QBO when branch stock changes."""
    from django.conf import settings
    from apps.quickbooks_online.sync_context import outbound_signals_suppressed

    if not getattr(settings, 'QUICKBOOKS_AUTO_SYNC_ENABLED', True) or outbound_signals_suppressed():
        return
    part = instance.part
    if part.tracks_inventory() and part.is_active:
        from apps.quickbooks_online.task_dispatch import schedule_part_sync

        schedule_part_sync(part.id)


@receiver(post_save, sender=InventoryTransaction)
def inventory_transaction_post_save(sender, instance, created, **kwargs):
    """QBO qty sync is handled by StockItem post_save after record_transaction()."""
    pass
