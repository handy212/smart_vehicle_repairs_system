from django.db.models import Sum, F, DecimalField, Q
from django.db.models.functions import Coalesce
from decimal import Decimal
import logging
from django.utils import timezone

logger = logging.getLogger(__name__)

class InventoryService:
    """Service for complex inventory calculations and business logic"""

    @staticmethod
    def reserve_parts_for_work_order(work_order, user=None):
        """
        Legacy work-order hook.

        Part allocation is handled explicitly through the work-order parts
        workflow, so this transition hook is intentionally non-destructive.
        It exists to keep status transitions from erroring while preserving the
        explicit stores/workshop handoff.
        """
        logger.info(
            "Skipping automatic part reservation for WO %s; explicit allocation flow owns reservation.",
            getattr(work_order, 'work_order_number', work_order),
        )
        return 0

    @staticmethod
    def consume_parts_for_work_order(work_order, user=None):
        """
        Legacy work-order hook.

        Installed parts are already deducted through explicit allocation and
        installation workflow actions, so completion does not auto-consume stock.
        """
        logger.info(
            "Skipping automatic part consumption for WO %s; explicit installation flow owns consumption.",
            getattr(work_order, 'work_order_number', work_order),
        )
        return 0
    
    @staticmethod
    def get_stock_queryset(queryset, branch=None):
        """Annotate queryset with branch-specific or global stock levels"""
        from .models import StockItem
        from django.db.models import Sum, F, Subquery, OuterRef
        from django.db.models.functions import Coalesce
        
        if branch:
            # Filter/Annotate based on specific branch
            stock_subquery = StockItem.objects.filter(
                part=OuterRef('pk'),
                branch=branch
            ).values('quantity_in_stock')[:1]
            
            reserved_subquery = StockItem.objects.filter(
                part=OuterRef('pk'),
                branch=branch
            ).values('quantity_reserved')[:1]
            
            queryset = queryset.annotate(
                current_stock=Coalesce(Subquery(stock_subquery), 0),
                current_reserved=Coalesce(Subquery(reserved_subquery), 0)
            )
        else:
            # Aggregate global stock from all branches
            queryset = queryset.annotate(
                total_stock=Coalesce(Sum('stock_items__quantity_in_stock'), 0),
                total_reserved=Coalesce(Sum('stock_items__quantity_reserved'), 0)
            ).annotate(
                current_stock=F('total_stock'),
                current_reserved=F('total_reserved')
            )
        
        return queryset

    @staticmethod
    def get_stock_valuation(queryset, branch=None):
        """Calculate total value of inventory in the queryset"""
        from django.db.models import Sum, F, DecimalField
        
        # Ensure queryset is annotated with stock
        queryset = InventoryService.get_stock_queryset(queryset, branch)
        
        result = queryset.aggregate(
            total_value=Sum(F('current_stock') * F('cost_price'), output_field=DecimalField())
        )
        return result['total_value'] or Decimal('0.00')

    @staticmethod
    def record_transaction(part, quantity, transaction_type, user, branch=None, reason='', notes='', unit_cost=None, **kwargs):
        """Record an inventory transaction and update stock levels"""
        from .models import InventoryTransaction, StockItem
        from django.db import transaction as db_transaction
        
        if not branch:
            raise ValueError("Branch is required for inventory transactions")
            
        with db_transaction.atomic():
            # Get or create stock item
            stock_item, created = StockItem.objects.get_or_create(
                part=part,
                branch=branch,
                defaults={
                    'quantity_in_stock': 0,
                    'quantity_reserved': 0,
                    'reorder_point': part.reorder_point,
                    'reorder_quantity': part.reorder_quantity,
                    'minimum_stock': part.minimum_stock,
                }
            )
            
            old_balance = stock_item.quantity_in_stock
            
            if transaction_type in ['adjustment', 'receive', 'purchase', 'transfer_in']:
                stock_item.quantity_in_stock += quantity
            elif transaction_type in ['sale', 'transfer_out']:
                stock_item.quantity_in_stock -= quantity
                # If we're selling/shipping something that was reserved, decrease reservation
                if transaction_type == 'sale':
                    stock_item.quantity_reserved = max(0, stock_item.quantity_reserved - quantity)
            elif transaction_type == 'reserve':
                if stock_item.available_quantity < quantity:
                    raise ValueError(f"Insufficient stock. Available: {stock_item.available_quantity}")
                stock_item.quantity_reserved += quantity
            elif transaction_type == 'release':
                stock_item.quantity_reserved = max(0, stock_item.quantity_reserved - quantity)
                
            stock_item.save()
            
            # Create transaction record
            transaction = InventoryTransaction.objects.create(
                part=part,
                branch=branch,
                quantity=quantity,
                transaction_type=transaction_type,
                balance_after=stock_item.quantity_in_stock,
                unit_cost=unit_cost or part.cost_price,
                created_by=user,
                reason=reason,
                notes=notes,
                **kwargs
            )
            
            # Check for stock alerts
            InventoryService.check_and_create_stock_alerts(part=part, branch=branch)
            
            return transaction

    @staticmethod
    def initiate_transfer(source_branch, destination_branch, items, user, notes=''):
        """Initiate a stock transfer between branches"""
        from .models import Transfer, TransferItem, Part
        from django.db import transaction as db_transaction
        
        with db_transaction.atomic():
            transfer = Transfer.objects.create(
                source_branch=source_branch,
                destination_branch=destination_branch,
                notes=notes,
                created_by=user,
                status='draft'
            )
            
            for item_data in items:
                part_id = item_data['part_id']
                quantity = item_data['quantity']
                part = Part.objects.get(id=part_id)
                
                TransferItem.objects.create(
                    transfer=transfer,
                    part=part,
                    quantity_requested=quantity
                )
                
            return transfer

    @staticmethod
    def submit_transfer_for_approval(transfer, approver, user):
        """Submit transfer for approval"""
        transfer.status = 'pending_approval'
        transfer.assigned_approver = approver
        transfer.submitted_by = user
        transfer.submitted_at = timezone.now()
        transfer.save()

    @staticmethod
    def approve_transfer(transfer, user):
        """Approve transfer and reserve stock"""
        from django.db import transaction as db_transaction
        
        with db_transaction.atomic():
            transfer.status = 'approved'
            transfer.approved_by = user
            transfer.approved_date = timezone.now()
            transfer.save()
            
            # Reserve stock at source branch
            for item in transfer.items.all():
                InventoryService.record_transaction(
                    part=item.part,
                    quantity=item.quantity_requested,
                    transaction_type='reserve',
                    user=user,
                    branch=transfer.source_branch,
                    transfer=transfer,
                    reason=f"Reserved for transfer {transfer.transfer_number}"
                )

    @staticmethod
    def reject_transfer(transfer, reason, user):
        """Reject transfer"""
        transfer.status = 'rejected'
        transfer.rejected_by = user
        transfer.rejected_at = timezone.now()
        transfer.rejection_reason = reason
        transfer.save()

    @staticmethod
    def ship_transfer(transfer, user):
        """Mark transfer as shipped and deduct stock"""
        from django.db import transaction as db_transaction
        
        if transfer.status != 'approved':
            raise ValueError("Only approved transfers can be shipped")
            
        with db_transaction.atomic():
            transfer.status = 'in_transit'
            transfer.shipped_date = timezone.now()
            # In some versions we might have shipped_by
            if hasattr(transfer, 'shipped_by'):
                transfer.shipped_by = user
            transfer.save()
            
            for item in transfer.items.all():
                # Release reservation and deduct stock
                InventoryService.record_transaction(
                    part=item.part,
                    quantity=item.quantity_requested,
                    transaction_type='release',
                    user=user,
                    branch=transfer.source_branch,
                    transfer=transfer,
                    reason=f"Released reservation for shipment {transfer.transfer_number}"
                )
                InventoryService.record_transaction(
                    part=item.part,
                    quantity=item.quantity_requested,
                    transaction_type='transfer_out',
                    user=user,
                    branch=transfer.source_branch,
                    transfer=transfer,
                    reason=f"Shipped in transfer {transfer.transfer_number}"
                )
                
                item.quantity_sent = item.quantity_requested
                item.save()

    @staticmethod
    def receive_transfer(transfer, items_received, user):
        """Receive transfer and add stock at destination"""
        from django.db import transaction as db_transaction
        
        if transfer.status != 'in_transit':
            raise ValueError("Only in-transit transfers can be received")
            
        with db_transaction.atomic():
            transfer.status = 'received'
            transfer.received_by = user
            transfer.received_date = timezone.now()
            transfer.save()
            
            for part_id, quantity in items_received.items():
                from .models import Part
                part = Part.objects.get(id=part_id)
                item = transfer.items.get(part=part)
                
                InventoryService.record_transaction(
                    part=part,
                    quantity=quantity,
                    transaction_type='transfer_in',
                    user=user,
                    branch=transfer.destination_branch,
                    transfer=transfer,
                    reason=f"Received from transfer {transfer.transfer_number}"
                )
                
                item.quantity_received = quantity
                item.save()

    @staticmethod
    def check_and_create_stock_alerts(part=None, branch=None):
        """Check stock levels and create alerts if below reorder point"""
        from .models import StockItem, StockAlert
        
        queryset = StockItem.objects.all()
        if part:
            queryset = queryset.filter(part=part)
        if branch:
            queryset = queryset.filter(branch=branch)
            
        alerts_created = 0
        for item in queryset:
            if item.quantity_in_stock <= item.reorder_point:
                # Create alert if one doesn't already exist for this part/branch/status=open
                alert, created = StockAlert.objects.get_or_create(
                    part=item.part,
                    branch=item.branch,
                    status='open',
                    defaults={
                        'alert_type': 'low_stock',
                        'message': f"Low stock alert for {item.part.name} at {item.branch.name}. Current: {item.quantity_in_stock}, Reorder Point: {item.reorder_point}",
                        'severity': 'medium'
                    }
                )
                if created:
                    alerts_created += 1
                    
        return alerts_created
