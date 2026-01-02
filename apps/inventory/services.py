from django.db import transaction
from django.utils import timezone
from decimal import Decimal
import logging

from apps.inventory.models import Part, InventoryTransaction, StockItem, Transfer, TransferItem
# WorkOrder import handled inside methods to avoid circular dependency

logger = logging.getLogger(__name__)

class InventoryService:
    """
    Service for managing inventory transactions, reservations, and consumption.
    """
    
    @staticmethod
    def record_transaction(part, quantity, transaction_type, user=None, 
                           work_order=None, purchase_order=None, transfer=None,
                           branch=None, reason='', notes='', unit_cost=None):
        """
        Record a generic inventory transaction and update StockItem.
        
        Args:
            part (Part): The part being moved
            quantity (int): Quantity (positive for add/reserve, negative for remove/release)
            transaction_type (str): Type from InventoryTransaction.TRANSACTION_TYPE_CHOICES
            user (User, optional): User performing the action
            work_order (WorkOrder, optional): Related Work Order
            purchase_order (PurchaseOrder, optional): Related Purchase Order
            transfer (Transfer, optional): Related Stock Transfer
            branch (Branch, required): Branch where this transaction occurred
            reason (str, optional): Short reason
            notes (str, optional): Detailed notes
            unit_cost (Decimal, optional): Cost per unit for GL tracking
        
        Returns:
            InventoryTransaction: The created transaction record
        """
        try:
            if not branch:
                raise ValueError("Branch is required for inventory transactions")

            # Determine unit cost if not provided
            if unit_cost is None:
                unit_cost = part.cost_price
            
            # Find or create StockItem for this branch
            stock_item, created = StockItem.objects.get_or_create(
                part=part,
                branch=branch
            )
            
            # Create transaction
            inv_trans = InventoryTransaction.objects.create(
                part=part,
                transaction_type=transaction_type,
                quantity=quantity,
                balance_after=0, # Will be calculated below
                unit_cost=unit_cost,
                work_order=work_order,
                purchase_order=purchase_order,
                transfer=transfer,
                branch=branch,
                reason=reason,
                notes=notes,
                created_by=user
            )
            
            # Update StockItem levels (Transaction logging)
            if transaction_type == 'reserve':
                stock_item.quantity_reserved += abs(quantity)
                inv_trans.balance_after = stock_item.quantity_in_stock
            elif transaction_type == 'release':
                stock_item.quantity_reserved = max(0, stock_item.quantity_reserved - abs(quantity))
                inv_trans.balance_after = stock_item.quantity_in_stock
            else:
                # Physical movement
                stock_item.quantity_in_stock = max(0, stock_item.quantity_in_stock + quantity)
                inv_trans.balance_after = stock_item.quantity_in_stock
            
            stock_item.save()
            inv_trans.save(update_fields=['balance_after'])
            
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
                        branch=work_order.branch, # MANDATORY: Use WO branch
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
                        branch=work_order.branch,
                        reason=f"Consuming reservation for WO #{work_order.work_order_number}"
                    )
                    
                    # 2. Deduct from Inventory (Sale/Usage)
                    cls.record_transaction(
                        part=inv_part,
                        quantity=-qty, # Negative for removal
                        transaction_type='sale', # Reduces physical stock
                        user=user,
                        work_order=work_order,
                        branch=work_order.branch,
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
                        branch=work_order.branch,
                        reason=f"Releasing reservation (WO Cancelled)"
                    )
                    count += 1
            
            logger.info(f"Released reservations for WO #{work_order.work_order_number}")
            return count
        except Exception as e:
            logger.error(f"Failed to release reservations for WO {work_order.work_order_number}: {e}")
            raise e

    @classmethod
    def initiate_transfer(cls, source_branch, destination_branch, items, user=None, notes=''):
        """
        Create a new transfer request.
        items: list of dict {'part_id': int, 'quantity': int, 'notes': str}
        """
        try:
            with transaction.atomic():
                transfer = Transfer.objects.create(
                    source_branch=source_branch,
                    destination_branch=destination_branch,
                    status='requested',
                    requested_date=timezone.now(),
                    created_by=user,
                    notes=notes
                )
                
                for item in items:
                    TransferItem.objects.create(
                        transfer=transfer,
                        part_id=item['part_id'],
                        quantity_requested=item['quantity'],
                        notes=item.get('notes', '')
                    )
                
                logger.info(f"Initiated transfer {transfer.transfer_number}")
                return transfer
        except Exception as e:
            logger.error(f"Failed to initiate transfer: {e}")
            raise e

    @classmethod
    def approve_transfer(cls, transfer, user=None):
        """
        Approve transfer and reserve stock at source branch.
        """
        try:
            if transfer.status != 'requested':
                raise ValueError("Transfer must be in 'requested' status to approve")
                
            with transaction.atomic():
                # 1. Reserve stock at source branch
                for item in transfer.items.all():
                    # Check availability (optional, enforce strict or allow negative?)
                    # For now, we allow it but log warning if insufficient
                    
                    cls.record_transaction(
                        part=item.part,
                        quantity=item.quantity_requested,
                        transaction_type='reserve',
                        user=user,
                        transfer=transfer,
                        branch=transfer.source_branch,
                        reason=f"Reserved for Transfer {transfer.transfer_number}"
                    )
                
                transfer.status = 'approved'
                transfer.approved_by = user
                transfer.approved_date = timezone.now()
                transfer.save()
                
                logger.info(f"Approved transfer {transfer.transfer_number}")
                return transfer
        except Exception as e:
            logger.error(f"Failed to approve transfer {transfer.id}: {e}")
            raise e

    @classmethod
    def ship_transfer(cls, transfer, user=None):
        """
        Mark transfer as shipped. Deduct stock from source branch.
        """
        try:
            if transfer.status != 'approved':
                raise ValueError("Transfer must be approved to ship")
                
            with transaction.atomic():
                for item in transfer.items.all():
                    item.quantity_sent = item.quantity_requested
                    item.save()
                    
                    # 1. Release Reservation
                    cls.record_transaction(
                        part=item.part,
                        quantity=item.quantity_sent,
                        transaction_type='release', 
                        user=user,
                        transfer=transfer,
                        branch=transfer.source_branch,
                        reason=f"Shipping Transfer {transfer.transfer_number}"
                    )
                    
                    # 2. Deduct Physical Stock (Transfer Out)
                    cls.record_transaction(
                        part=item.part,
                        quantity=-item.quantity_sent,
                        transaction_type='transfer',
                        user=user,
                        transfer=transfer,
                        branch=transfer.source_branch,
                        reason=f"Shipped in Transfer {transfer.transfer_number}"
                    )
                
                transfer.status = 'in_transit'
                transfer.shipped_date = timezone.now()
                transfer.save()
                
                logger.info(f"Shipped transfer {transfer.transfer_number}")
                return transfer
        except Exception as e:
            logger.error(f"Failed to ship transfer {transfer.id}: {e}")
            raise e

    @classmethod
    def receive_transfer(cls, transfer, items_received, user=None):
        """
        Receive transfer at destination branch. Add stock.
        items_received: dict {part_id: quantity_received}
        """
        try:
            if transfer.status != 'in_transit':
                raise ValueError("Transfer must be in transit to receive")
                
            with transaction.atomic():
                for item in transfer.items.all():
                    qty_received = items_received.get(item.part.id, item.quantity_sent)
                    item.quantity_received = qty_received
                    item.save()
                    
                    if qty_received > 0:
                        # Add Stock to Destination Branch
                        cls.record_transaction(
                            part=item.part,
                            quantity=qty_received,
                            transaction_type='transfer',
                            user=user,
                            transfer=transfer,
                            branch=transfer.destination_branch,
                            reason=f"Received from Transfer {transfer.transfer_number}"
                        )
                
                transfer.status = 'received'
                transfer.received_by = user
                transfer.received_date = timezone.now()
                transfer.save()
                
                logger.info(f"Received transfer {transfer.transfer_number}")
                return transfer
        except Exception as e:
            logger.error(f"Failed to receive transfer {transfer.id}: {e}")
            raise e
