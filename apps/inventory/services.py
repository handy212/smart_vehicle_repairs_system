from django.db import transaction
from django.utils import timezone
from decimal import Decimal
import logging

from apps.inventory.models import Part, InventoryTransaction, StockItem, Transfer, TransferItem, StockAlert
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

            if not part:
                raise ValueError("Part is required for inventory transactions")
            
            # Validate quantity
            if quantity == 0:
                raise ValueError("Quantity cannot be zero")
            
            # Determine unit cost if not provided
            if unit_cost is None:
                unit_cost = part.cost_price or Decimal('0.00')
            
            # Find or create StockItem for this branch
            stock_item, created = StockItem.objects.get_or_create(
                part=part,
                branch=branch,
                defaults={
                    'reorder_point': part.reorder_point,
                    'reorder_quantity': part.reorder_quantity,
                    'minimum_stock': part.minimum_stock,
                }
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
                # Physical movement - validate stock availability for negative quantities
                if quantity < 0:
                    available = stock_item.quantity_in_stock - stock_item.quantity_reserved
                    if abs(quantity) > available:
                        raise ValueError(
                            f"Insufficient available stock. Available: {available}, "
                            f"Requested: {abs(quantity)}"
                        )
                
                stock_item.quantity_in_stock = max(0, stock_item.quantity_in_stock + quantity)
                inv_trans.balance_after = stock_item.quantity_in_stock
            
            stock_item.save()
            inv_trans.save(update_fields=['balance_after'])
            
            logger.info(f"Recorded inventory transaction: {inv_trans} for part {part.part_number} at branch {branch.name}")
            return inv_trans
            
        except ValueError as e:
            # Re-raise validation errors as-is
            logger.warning(f"Validation error in inventory transaction: {e}")
            raise
        except Exception as e:
            logger.error(f"Failed to record inventory transaction for part {part.part_number if part else 'unknown'}: {e}", exc_info=True)
            raise

    @classmethod
    def reserve_parts_for_work_order(cls, work_order, user=None):
        """
        Reserve all parts linked to a Work Order.
        Should be called when WO moves to 'In Progress'.
        
        Returns:
            dict: {'success': bool, 'reserved': int, 'failed': list, 'errors': list}
        """
        try:
            from apps.workorders.models import WorkOrderPart
            
            if not work_order.branch:
                raise ValueError(f"Work Order {work_order.work_order_number} must have a branch assigned")
            
            # Get parts that are not yet installed/issued
            # We filter for parts that have an inventory link
            wo_parts = work_order.parts.filter(
                inventory_part__isnull=False
            ).exclude(
                status__in=['installed', 'received', 'returned']
            )
            
            reserved_count = 0
            failed_parts = []
            errors = []
            
            with transaction.atomic():
                for wo_part in wo_parts:
                    try:
                        inv_part = wo_part.inventory_part
                        qty_to_reserve = int(wo_part.quantity)
                        
                        if qty_to_reserve <= 0:
                            errors.append(f"Invalid quantity for part {inv_part.name}: {qty_to_reserve}")
                            failed_parts.append({
                                'part': inv_part.name,
                                'part_number': inv_part.part_number,
                                'quantity': qty_to_reserve,
                                'error': 'Invalid quantity'
                            })
                            continue
                        
                        # Check available stock before reserving
                        stock_item, created = StockItem.objects.get_or_create(
                            part=inv_part,
                            branch=work_order.branch,
                            defaults={'quantity_in_stock': 0, 'quantity_reserved': 0}
                        )
                        
                        available_qty = stock_item.quantity_in_stock - stock_item.quantity_reserved
                        
                        if available_qty < qty_to_reserve:
                            error_msg = (
                                f"Insufficient stock for {inv_part.name} "
                                f"(Available: {available_qty}, Required: {qty_to_reserve})"
                            )
                            errors.append(error_msg)
                            failed_parts.append({
                                'part': inv_part.name,
                                'part_number': inv_part.part_number,
                                'quantity': qty_to_reserve,
                                'available': available_qty,
                                'error': 'Insufficient stock'
                            })
                            continue
                        
                        # Create reservation transaction
                        cls.record_transaction(
                            part=inv_part,
                            quantity=qty_to_reserve,
                            transaction_type='reserve',
                            user=user,
                            work_order=work_order,
                            branch=work_order.branch,
                            reason=f"Reserved for WO #{work_order.work_order_number}",
                            notes=f"WorkOrderPart ID: {wo_part.id}"
                        )
                        
                        # Update WorkOrderPart status to 'ready' after successful reservation
                        wo_part.status = 'ready'
                        wo_part.save(update_fields=['status'])
                        
                        reserved_count += 1
                        
                    except ValueError as ve:
                        error_msg = f"Validation error for part {wo_part.inventory_part.name if wo_part.inventory_part else 'Unknown'}: {str(ve)}"
                        errors.append(error_msg)
                        failed_parts.append({
                            'part': wo_part.inventory_part.name if wo_part.inventory_part else 'Unknown',
                            'error': str(ve)
                        })
                    except Exception as e:
                        error_msg = f"Error reserving part {wo_part.inventory_part.name if wo_part.inventory_part else 'Unknown'}: {str(e)}"
                        logger.error(error_msg)
                        errors.append(error_msg)
                        failed_parts.append({
                            'part': wo_part.inventory_part.name if wo_part.inventory_part else 'Unknown',
                            'error': str(e)
                        })
            
            result = {
                'success': reserved_count > 0 and len(failed_parts) == 0,
                'reserved': reserved_count,
                'failed': failed_parts,
                'errors': errors
            }
            
            if reserved_count > 0:
                logger.info(f"Reserved {reserved_count} parts for WO #{work_order.work_order_number}")
            if failed_parts:
                logger.warning(f"Failed to reserve {len(failed_parts)} parts for WO #{work_order.work_order_number}")
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to reserve parts for WO {work_order.work_order_number}: {e}")
            raise e

    @classmethod
    def consume_parts_for_work_order(cls, work_order, user=None):
        """
        Consume (deduct from stock) parts for a Work Order.
        Should be called when WO moves to 'Completed' (or when part status changes to 'Installed').
        This converts a RESERVATION into a SALE/USAGE.
        
        Returns:
            dict: {'success': bool, 'consumed': int, 'failed': list, 'errors': list}
        """
        try:
            if not work_order.branch:
                raise ValueError(f"Work Order {work_order.work_order_number} must have a branch assigned")
            
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
            
            consumed_count = 0
            failed_parts = []
            errors = []
            
            with transaction.atomic():
                for wo_part in wo_parts:
                    try:
                        inv_part = wo_part.inventory_part
                        qty = int(wo_part.quantity)
                        
                        if qty <= 0:
                            errors.append(f"Invalid quantity for part {inv_part.name}: {qty}")
                            failed_parts.append({
                                'part': inv_part.name,
                                'part_number': inv_part.part_number,
                                'quantity': qty,
                                'error': 'Invalid quantity'
                            })
                            continue
                        
                        # Check available stock (including reserved) before consuming
                        stock_item, created = StockItem.objects.get_or_create(
                            part=inv_part,
                            branch=work_order.branch,
                            defaults={'quantity_in_stock': 0, 'quantity_reserved': 0}
                        )
                        
                        # Check if we have enough stock to consume
                        if stock_item.quantity_in_stock < qty:
                            error_msg = (
                                f"Insufficient stock for {inv_part.name} "
                                f"(Available: {stock_item.quantity_in_stock}, Required: {qty})"
                            )
                            errors.append(error_msg)
                            failed_parts.append({
                                'part': inv_part.name,
                                'part_number': inv_part.part_number,
                                'quantity': qty,
                                'available': stock_item.quantity_in_stock,
                                'error': 'Insufficient stock'
                            })
                            continue
                        
                        # 1. Release Reservation (if any was reserved)
                        if stock_item.quantity_reserved > 0:
                            release_qty = min(qty, stock_item.quantity_reserved)
                            cls.record_transaction(
                                part=inv_part,
                                quantity=release_qty,
                                transaction_type='release', # Reduces reserved count
                                user=user,
                                work_order=work_order,
                                branch=work_order.branch,
                                reason=f"Consuming reservation for WO #{work_order.work_order_number}",
                                notes=f"WorkOrderPart ID: {wo_part.id}"
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
                            unit_cost=inv_part.cost_price, # Capture cost at time of usage
                            notes=f"WorkOrderPart ID: {wo_part.id}"
                        )
                        
                        # Update WorkOrderPart status to 'installed' after successful consumption
                        wo_part.status = 'installed'
                        wo_part.installed_at = timezone.now()
                        wo_part.installed_by = user
                        wo_part.save(update_fields=['status', 'installed_at', 'installed_by'])
                        
                        consumed_count += 1
                        
                    except ValueError as ve:
                        error_msg = f"Validation error for part {wo_part.inventory_part.name if wo_part.inventory_part else 'Unknown'}: {str(ve)}"
                        errors.append(error_msg)
                        failed_parts.append({
                            'part': wo_part.inventory_part.name if wo_part.inventory_part else 'Unknown',
                            'error': str(ve)
                        })
                    except Exception as e:
                        error_msg = f"Error consuming part {wo_part.inventory_part.name if wo_part.inventory_part else 'Unknown'}: {str(e)}"
                        logger.error(error_msg)
                        errors.append(error_msg)
                        failed_parts.append({
                            'part': wo_part.inventory_part.name if wo_part.inventory_part else 'Unknown',
                            'error': str(e)
                        })
            
            result = {
                'success': consumed_count > 0 and len(failed_parts) == 0,
                'consumed': consumed_count,
                'failed': failed_parts,
                'errors': errors
            }
            
            if consumed_count > 0:
                logger.info(f"Consumed {consumed_count} parts for WO #{work_order.work_order_number}")
            if failed_parts:
                logger.warning(f"Failed to consume {len(failed_parts)} parts for WO #{work_order.work_order_number}")
            
            return result
            
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
        Create a new transfer request in 'draft' status.
        items: list of dict {'part_id': int, 'quantity': int, 'notes': str}
        """
        try:
            with transaction.atomic():
                transfer = Transfer.objects.create(
                    source_branch=source_branch,
                    destination_branch=destination_branch,
                    status='draft',
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
                
                logger.info(f"Initiated draft transfer {transfer.transfer_number}")
                return transfer
        except Exception as e:
            logger.error(f"Failed to initiate transfer: {e}")
            raise e

    @classmethod
    def submit_transfer_for_approval(cls, transfer, approver=None, user=None):
        """
        Submit transfer request for approval.
        """
        try:
            if transfer.status != 'draft':
                raise ValueError("Only draft transfers can be submitted for approval")
            
            if not transfer.items.exists():
                raise ValueError("Cannot submit transfer with no items")

            transfer.status = 'pending_approval'
            transfer.submitted_by = user
            transfer.submitted_at = timezone.now()
            if approver:
                transfer.assigned_approver = approver
            transfer.save()

            # Notification logic can be added here or in the viewset
            
            logger.info(f"Submitted transfer {transfer.transfer_number} for approval")
            return transfer
        except Exception as e:
            logger.error(f"Failed to submit transfer {transfer.id} for approval: {e}")
            raise e

    @classmethod
    def approve_transfer(cls, transfer, user=None):
        """
        Approve transfer and reserve stock at source branch.
        """
        try:
            if transfer.status not in ['requested', 'pending_approval']:
                raise ValueError("Transfer must be in 'pending_approval' or 'requested' status to approve")
                
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
    def reject_transfer(cls, transfer, reason='', user=None):
        """
        Reject transfer request.
        """
        try:
            if transfer.status != 'pending_approval':
                raise ValueError("Only transfers pending approval can be rejected")

            transfer.status = 'rejected'
            transfer.rejected_by = user
            transfer.rejected_at = timezone.now()
            transfer.rejection_reason = reason
            transfer.save()

            logger.info(f"Rejected transfer {transfer.transfer_number}")
            return transfer
        except Exception as e:
            logger.error(f"Failed to reject transfer {transfer.id}: {e}")
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
    
    @staticmethod
    def check_and_create_stock_alerts(stock_item=None, part=None, branch=None):
        """
        Check stock levels and create alerts if needed.
        
        Args:
            stock_item (StockItem, optional): Specific StockItem to check
            part (Part, optional): Part to check (requires branch)
            branch (Branch, optional): Branch to check (requires part)
        
        Returns:
            list: List of created StockAlert objects
        """
        from apps.branches.models import Branch
        
        alerts_created = []
        
        try:
            if stock_item:
                # Check specific stock item
                stock_items_to_check = [stock_item]
            elif part and branch:
                # Check specific part at specific branch
                try:
                    stock_item = StockItem.objects.get(part=part, branch=branch)
                    stock_items_to_check = [stock_item]
                except StockItem.DoesNotExist:
                    # Create stock item with 0 quantity if it doesn't exist
                    stock_item = StockItem.objects.create(
                        part=part,
                        branch=branch,
                        quantity_in_stock=0,
                        reorder_point=part.reorder_point,
                        reorder_quantity=part.reorder_quantity,
                        minimum_stock=part.minimum_stock
                    )
                    stock_items_to_check = [stock_item]
            else:
                # Check all stock items (use with caution - can be expensive)
                stock_items_to_check = StockItem.objects.select_related('part', 'branch').all()
            
            for si in stock_items_to_check:
                current_qty = si.quantity_in_stock
                reorder_point = si.reorder_point
                minimum_stock = si.minimum_stock or 0
                
                # Check for out of stock
                if current_qty == 0:
                    # Check if there's already an active out_of_stock alert
                    existing = StockAlert.objects.filter(
                        part=si.part,
                        branch=si.branch,
                        alert_type='out_of_stock',
                        status='active'
                    ).first()
                    
                    if not existing:
                        alert = StockAlert.objects.create(
                            part=si.part,
                            branch=si.branch,
                            stock_item=si,
                            alert_type='out_of_stock',
                            severity='critical',
                            current_quantity=current_qty,
                            reorder_point=reorder_point,
                            minimum_stock=minimum_stock,
                            message=f"{si.part.name} is out of stock at {si.branch.name}"
                        )
                        alerts_created.append(alert)
                        logger.info(f"Created out of stock alert for {si.part.name} at {si.branch.name}")
                
                # Check for low stock (below reorder point but not zero)
                elif current_qty > 0 and current_qty <= reorder_point:
                    # Check if there's already an active low_stock alert
                    existing = StockAlert.objects.filter(
                        part=si.part,
                        branch=si.branch,
                        alert_type='low_stock',
                        status='active'
                    ).first()
                    
                    if not existing:
                        severity = 'critical' if current_qty == 0 else 'warning'
                        alert = StockAlert.objects.create(
                            part=si.part,
                            branch=si.branch,
                            stock_item=si,
                            alert_type='low_stock',
                            severity=severity,
                            current_quantity=current_qty,
                            reorder_point=reorder_point,
                            minimum_stock=minimum_stock,
                            message=f"{si.part.name} is below reorder point ({current_qty}/{reorder_point}) at {si.branch.name}"
                        )
                        alerts_created.append(alert)
                        logger.info(f"Created low stock alert for {si.part.name} at {si.branch.name}")
                
                # Resolve existing alerts if stock is now above reorder point
                if current_qty > reorder_point:
                    # Resolve active low_stock or out_of_stock alerts
                    StockAlert.objects.filter(
                        part=si.part,
                        branch=si.branch,
                        alert_type__in=['low_stock', 'out_of_stock'],
                        status='active'
                    ).update(status='resolved', resolved_at=timezone.now())
            
            return alerts_created
            
        except Exception as e:
            logger.error(f"Error checking stock alerts: {e}")
            return alerts_created