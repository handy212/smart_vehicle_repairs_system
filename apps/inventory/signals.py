"""
Signals for inventory app to integrate with Django Ledger
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from apps.inventory.models import InventoryTransaction, Part
from apps.billing.accounting_service import AccountingService


@receiver(post_save, sender=InventoryTransaction)
def inventory_transaction_post_save(sender, instance, created, **kwargs):
    """
    Post accounting entries when inventory transactions are created
    
    Handles:
    - purchase: Inventory received (Debit Inventory, Credit AP/Cash)
    - sale: Parts used (Debit COGS, Credit Inventory)
    - damage: Inventory loss (Debit Expense, Credit Inventory)
    """
    if created and instance.total_cost and instance.total_cost > 0:
        # Only post for certain transaction types
        if instance.transaction_type in ['purchase', 'sale', 'damage']:
            try:
                AccountingService.post_inventory_transaction(instance)
            except Exception as e:
                # Log error but don't fail transaction creation
                import logging
                logger = logging.getLogger(__name__)
                logger.error(
                    f"Failed to post accounting entry for inventory transaction {instance.pk}: {e}",
                    exc_info=True
                )


# Note: Part sync is on-demand when used in invoices/POs
# Disabled auto-sync signal due to UOM issues - parts sync when needed
# Use sync_django_ledger command to manually sync parts if needed
#
# @receiver(post_save, sender=Part)
# def part_post_save(sender, instance, created, **kwargs):
#     """
#     Sync Part to Django Ledger ItemModel in all entities when Part is created
#     
#     Parts sync on-demand when used in invoices/POs, or via sync_django_ledger command.
#     """
#     pass

