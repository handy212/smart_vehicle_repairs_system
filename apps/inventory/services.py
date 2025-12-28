from django.db import transaction
from django.utils import timezone
from decimal import Decimal
import logging

from apps.inventory.models import Part, InventoryTransaction
# WorkOrder import handled inside methods to avoid circular dependency

logger = logging.getLogger(__name__)

class InventoryService:
    """
    Service for managing inventory transactions, reservations, and consumption.
    """
    
    @staticmethod
    def record_transaction(part, quantity, transaction_type, user=None, 
                           work_order=None, purchase_order=None, 
                           reason='', notes='', unit_cost=None):
        """
        Record a generic inventory transaction.
        
        Args:
            part (Part): The part being moved
            quantity (int): Quantity (positive for add/reserve, negative for remove/release)
            transaction_type (str): Type from InventoryTransaction.TRANSACTION_TYPE_CHOICES
            user (User, optional): User performing the action
            work_order (WorkOrder, optional): Related Work Order
            purchase_order (PurchaseOrder, optional): Related Purchase Order
            reason (str, optional): Short reason
            notes (str, optional): Detailed notes
            unit_cost (Decimal, optional): Cost per unit for GL tracking
        
        Returns:
            InventoryTransaction: The created transaction record
        """
        try:
            # Determine unit cost if not provided
            if unit_cost is None:
                unit_cost = part.cost_price
            
            # Create transaction
            # Note: InventoryTransaction.save() handles updating the Part's stock/reserved counts
            inv_trans = InventoryTransaction.objects.create(
                part=part,
                transaction_type=transaction_type,
                quantity=quantity,
                balance_after=0, # Will be calculated in save()
                unit_cost=unit_cost,
                work_order=work_order,
                purchase_order=purchase_order,
                reason=reason,
                notes=notes,
                created_by=user
            )
            
            logger.info(f"Recorded inventory transaction: {inv_trans}")
            return inv_trans
            
        except Exception as e:
            logger.error(f"Failed to record inventory transaction for part {part.part_number}: {e}")
            raise e

    @classmethod
    def reserve_parts_for_work_order(cls, work_order, user=None):
        """
        Reserve all parts linked to a Work Order.
        Should be called when WO moves to 'In Progress'.
        """
        try:
            from apps.workorders.models import WorkOrderPart
            
            # Get parts that are not yet installed/issued
            # We filter for parts that have an inventory link
            wo_parts = work_order.parts.filter(
                inventory_part__isnull=False
            ).exclude(
                status__in=['installed', 'received', 'returned']
            )
            
            count = 0
            with transaction.atomic():
                for wo_part in wo_parts:
                    # Check if already reserved? 
                    # We don't have a flag on WorkOrderPart for "is_reserved", 
                    # but we can check if it's pending.
                    # Best practice: Idempotency. Check if we have enough reserved?
                    # For now, simplistic approach: Reserve if status is 'pending' or 'ordered'
                    
                    inv_part = wo_part.inventory_part
                    qty_to_reserve = int(wo_part.quantity)
                    
                    # Create reservation transaction
                    cls.record_transaction(
                        part=inv_part,
                        quantity=qty_to_reserve,
                        transaction_type='reserve',
                        user=user,
                        work_order=work_order,
                        reason=f"Reserved for WO #{work_order.work_order_number}",
                        notes=f"WorkOrderPart ID: {wo_part.id}"
                    )
                    count += 1
            
            logger.info(f"Reserved parts for WO #{work_order.work_order_number}: {count} items")
            return count
            
        except Exception as e:
            logger.error(f"Failed to reserve parts for WO {work_order.work_order_number}: {e}")
            raise e

    @classmethod
    def consume_parts_for_work_order(cls, work_order, user=None):
        """
        Consume (deduct from stock) parts for a Work Order.
        Should be called when WO moves to 'Completed' (or when part status changes to 'Installed').
        This converts a RESERVATION into a SALE/USAGE.
        """
        try:
            # Get parts that are linked to inventory
            # We want to process parts that were reserved (so we release reservation AND deduct stock)
            # Or just deduct stock if not reserved.
            
            # Logic:
            # 1. Release Reservation (qty_reserved -= N)
            # 2. Deduct Stock (qty_in_stock -= N)
            
            # In our system:
            # 'release' transaction: qty_reserved -= N
            # 'sale' transaction: qty_in_stock -= N
            
            # So we need to record TWO transactions for each part: Release and Sale.
            
            wo_parts = work_order.parts.filter(
                inventory_part__isnull=False
            ) # Process all linked parts to ensure accurate capture
            
            count = 0
            with transaction.atomic():
                for wo_part in wo_parts:
                    # Skip if already marked as installed/consumed in inventory?
                    # We need a way to track if this specific line item was consumed.
                    # For now, let's assume this is called once at completion.
                    # Ideally, WorkOrderPart should have `is_inventory_adjusted` flag.
                    
                    # Temporary check: Only if status is 'installed' or changing to 'installed'
                    # But if we call this broadly on WO completion, we iterate all.
                    
                    inv_part = wo_part.inventory_part
                    qty = int(wo_part.quantity)
                    
                    # 1. Release Reservation
                    cls.record_transaction(
                        part=inv_part,
                        quantity=qty,
                        transaction_type='release', # Reduces reserved count
                        user=user,
                        work_order=work_order,
                        reason=f"Consuming reservation for WO #{work_order.work_order_number}"
                    )
                    
                    # 2. Deduct from Inventory (Sale/Usage)
                    cls.record_transaction(
                        part=inv_part,
                        quantity=-qty, # Negative for removal
                        transaction_type='sale', # Reduces physical stock
                        user=user,
                        work_order=work_order,
                        reason=f"Used in WO #{work_order.work_order_number}",
                        unit_cost=inv_part.cost_price # Capture cost at time of usage
                    )
                    
                    count += 1
                    
            logger.info(f"Consumed inventory for WO #{work_order.work_order_number}: {count} items")
            return count
            
        except Exception as e:
            logger.error(f"Failed to consume parts for WO {work_order.work_order_number}: {e}")
            raise e

    @classmethod
    def release_reservations(cls, work_order, user=None):
        """
        Release reservations without consuming (e.g. WO Cancelled).
        """
        try:
            wo_parts = work_order.parts.filter(inventory_part__isnull=False)
            
            count = 0
            with transaction.atomic():
                for wo_part in wo_parts:
                    inv_part = wo_part.inventory_part
                    qty = int(wo_part.quantity)
                    
                    cls.record_transaction(
                        part=inv_part,
                        quantity=qty,
                        transaction_type='release',
                        user=user,
                        work_order=work_order,
                        reason=f"Releasing reservation (WO Cancelled)"
                    )
                    count += 1
            
            logger.info(f"Released reservations for WO #{work_order.work_order_number}")
            return count
        except Exception as e:
            logger.error(f"Failed to release reservations for WO {work_order.work_order_number}: {e}")
            raise e
