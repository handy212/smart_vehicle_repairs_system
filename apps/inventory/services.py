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
        from .part_catalog import part_tracks_stock
        from django.db import transaction as db_transaction

        stock_affecting_types = {
            'reserve', 'release', 'purchase', 'receive', 'transfer_in', 'transfer_out',
            'sale', 'damage', 'loss', 'return', 'found', 'adjustment', 'correction', 'count',
        }
        if transaction_type in stock_affecting_types and not part_tracks_stock(part):
            item_label = getattr(part, 'get_item_type_display', lambda: 'non-inventory')()
            raise ValueError(
                f'Part {part.part_number} is a {item_label} item and does not track stock.'
            )
        
        if not branch:
            raise ValueError("Branch is required for inventory transactions")

        if transaction_type == 'sale':
            work_order = kwargs.get('work_order')
            if work_order is None:
                raise ValueError(
                    "Inventory sale/issue requires a linked approved work order."
                )
            approved_statuses = {
                'approved', 'in_progress', 'paused', 'completed',
                'ready_for_pickup', 'delivered', 'invoiced', 'closed',
            }
            if work_order.status not in approved_statuses and not getattr(
                work_order, 'is_approved', False
            ):
                raise ValueError(
                    f"Cannot issue stock while work order is {work_order.status}. "
                    "Customer approval is required first."
                )

        quantity = int(quantity)
        if transaction_type in ['reserve', 'release', 'purchase', 'receive', 'transfer_in', 'transfer_out', 'sale', 'damage', 'loss', 'return', 'found'] and quantity <= 0:
            raise ValueError("Quantity must be greater than 0")

        inbound_types = {'receive', 'purchase', 'transfer_in', 'found'}
        outbound_types = {'sale', 'transfer_out', 'damage', 'loss', 'return'}
        signed_types = {'adjustment', 'correction', 'count'}
        qbo_adjustment_types = signed_types | {'damage', 'loss', 'found'}

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
            
            transaction_quantity = quantity

            if transaction_type in inbound_types:
                stock_item.quantity_in_stock += quantity
                transaction_quantity = abs(quantity)
            elif transaction_type in outbound_types:
                quantity = abs(quantity)
                if stock_item.quantity_in_stock < quantity:
                    raise ValueError(f"Insufficient stock. Available: {stock_item.quantity_in_stock}")
                stock_item.quantity_in_stock -= quantity
                transaction_quantity = -quantity
                if transaction_type == 'sale':
                    stock_item.quantity_reserved = max(0, stock_item.quantity_reserved - quantity)
            elif transaction_type in signed_types:
                new_quantity = stock_item.quantity_in_stock + quantity
                if new_quantity < 0:
                    raise ValueError(f"Insufficient stock. Available: {stock_item.quantity_in_stock}")
                stock_item.quantity_in_stock = new_quantity
                transaction_quantity = quantity
            elif transaction_type == 'reserve':
                if stock_item.available_quantity < quantity:
                    raise ValueError(f"Insufficient stock. Available: {stock_item.available_quantity}")
                stock_item.quantity_reserved += quantity
                transaction_quantity = quantity
            elif transaction_type == 'release':
                if stock_item.quantity_reserved < quantity:
                    raise ValueError(f"Cannot release more than reserved. Reserved: {stock_item.quantity_reserved}")
                stock_item.quantity_reserved = max(0, stock_item.quantity_reserved - quantity)
                transaction_quantity = -quantity
            else:
                raise ValueError(f"Unsupported inventory transaction type: {transaction_type}")

            from apps.quickbooks_online.sync_context import suppress_qbo_item_qty_sync

            if transaction_type in qbo_adjustment_types:
                with suppress_qbo_item_qty_sync():
                    stock_item.save()
            else:
                stock_item.save()
            
            # Create transaction record
            transaction = InventoryTransaction.objects.create(
                part=part,
                branch=branch,
                quantity=transaction_quantity,
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

        if source_branch == destination_branch:
            raise ValueError("Source and destination branches must be different")
        if not items:
            raise ValueError("At least one transfer item is required")
        
        with db_transaction.atomic():
            transfer = Transfer.objects.create(
                source_branch=source_branch,
                destination_branch=destination_branch,
                notes=notes,
                created_by=user,
                status='draft'
            )
            
            seen_parts = set()
            for item_data in items:
                part_id = item_data['part_id']
                quantity = int(item_data['quantity'])
                if quantity <= 0:
                    raise ValueError("Transfer item quantity must be greater than 0")
                if part_id in seen_parts:
                    raise ValueError("Duplicate parts are not allowed in one transfer")
                seen_parts.add(part_id)
                part = Part.objects.get(id=part_id)
                
                TransferItem.objects.create(
                    transfer=transfer,
                    part=part,
                    quantity_requested=quantity
                )
                
            return transfer

    @staticmethod
    def submit_transfer_for_approval(transfer, approver=None, user=None, approvers=None):
        """Submit transfer for approval"""
        from .models import TransferApproval

        if transfer.status != 'draft':
            raise ValueError("Only draft transfers can be submitted for approval")
        if not transfer.items.exists():
            raise ValueError("Cannot submit a transfer with no items")
        selected_approvers = list(approvers) if approvers is not None else ([approver] if approver else [])
        if not selected_approvers:
            raise ValueError("Select an approver before submitting this transfer")
        if any(selected_approver.id == user.id for selected_approver in selected_approvers):
            raise ValueError("Transfers must be approved by someone other than the submitter")
        from apps.accounts.permissions import user_can_approve_transfers

        if any(not user_can_approve_transfers(selected_approver) for selected_approver in selected_approvers):
            raise ValueError("Selected approver must be a manager, admin, or parts manager")

        transfer.status = 'pending_approval'
        transfer.assigned_approver = selected_approvers[0]
        transfer.submitted_by = user
        transfer.submitted_at = timezone.now()
        transfer.save()
        transfer.approvals.all().delete()
        TransferApproval.objects.bulk_create([
            TransferApproval(transfer=transfer, approver=selected_approver)
            for selected_approver in selected_approvers
        ])

    @staticmethod
    def approve_transfer(transfer, user):
        """Approve transfer and reserve stock"""
        from django.db import transaction as db_transaction

        if transfer.status != 'pending_approval':
            raise ValueError("Only transfers pending approval can be approved")
        from apps.accounts.permissions import user_can_approve_transfers
        is_admin_approver = user_can_approve_transfers(user)
        approvals = transfer.approvals.select_related('approver')
        if approvals.exists():
            user_approval = approvals.filter(approver=user, status='pending').first()
            if not user_approval and not is_admin_approver:
                raise ValueError("Only the assigned approver, admin, or super admin can approve this transfer")
        elif transfer.assigned_approver_id and transfer.assigned_approver_id != user.id and not is_admin_approver:
            raise ValueError("Only the assigned approver, admin, or super admin can approve this transfer")
        if transfer.submitted_by_id == user.id and not is_admin_approver:
            raise ValueError("Transfers cannot be approved by the same user who submitted them")
        
        with db_transaction.atomic():
            if approvals.exists():
                now = timezone.now()
                user_approval = approvals.filter(approver=user, status='pending').first()
                if user_approval:
                    user_approval.status = 'approved'
                    user_approval.approved_at = now
                    user_approval.save(update_fields=['status', 'approved_at', 'updated_at'])
                elif is_admin_approver:
                    approvals.filter(status='pending').update(status='approved', approved_at=now, updated_at=now)

                if approvals.filter(status='pending').exists():
                    return

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
        if transfer.status != 'pending_approval':
            raise ValueError("Only transfers pending approval can be rejected")
        from apps.accounts.permissions import user_can_approve_transfers
        is_admin_approver = user_can_approve_transfers(user)
        approvals = transfer.approvals.select_related('approver')
        if approvals.exists():
            user_approval = approvals.filter(approver=user, status='pending').first()
            if not user_approval and not is_admin_approver:
                raise ValueError("Only the assigned approver, admin, or super admin can reject this transfer")
        elif transfer.assigned_approver_id and transfer.assigned_approver_id != user.id and not is_admin_approver:
            raise ValueError("Only the assigned approver, admin, or super admin can reject this transfer")
        if not (reason or '').strip():
            raise ValueError("A rejection reason is required")

        if approvals.exists():
            now = timezone.now()
            user_approval = approvals.filter(approver=user, status='pending').first()
            if user_approval:
                user_approval.status = 'rejected'
                user_approval.rejected_at = now
                user_approval.rejection_reason = reason
                user_approval.save(update_fields=['status', 'rejected_at', 'rejection_reason', 'updated_at'])
            elif is_admin_approver:
                approvals.filter(status='pending').update(
                    status='rejected',
                    rejected_at=now,
                    rejection_reason=reason,
                    updated_at=now,
                )

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
            
        if not items_received:
            raise ValueError("At least one received item is required")

        transfer_items = {item.part_id: item for item in transfer.items.all()}
        for part_id, quantity in items_received.items():
            quantity = int(quantity)
            if quantity <= 0:
                raise ValueError("Received quantity must be greater than 0")
            if part_id not in transfer_items:
                raise ValueError("Received part is not on this transfer")
            item = transfer_items[part_id]
            if item.quantity_received + quantity > item.quantity_sent:
                raise ValueError(f"Cannot receive more than shipped for {item.part.part_number}")
            
        with db_transaction.atomic():
            for part_id, quantity in items_received.items():
                item = transfer_items[part_id]
                part = item.part
                
                InventoryService.record_transaction(
                    part=part,
                    quantity=quantity,
                    transaction_type='transfer_in',
                    user=user,
                    branch=transfer.destination_branch,
                    transfer=transfer,
                    reason=f"Received from transfer {transfer.transfer_number}"
                )
                
                item.quantity_received += int(quantity)
                item.save()

            if all(item.quantity_received >= item.quantity_sent for item in transfer.items.all()):
                transfer.status = 'received'
                transfer.received_by = user
                transfer.received_date = timezone.now()
                transfer.save()

    @staticmethod
    def check_and_create_stock_alerts(part=None, branch=None):
        """Check stock levels and create alerts if below reorder point"""
        from .models import StockItem, StockAlert
        
        queryset = StockItem.objects.all()
        if part:
            queryset = queryset.filter(part=part)
        if branch:
            queryset = queryset.filter(branch=branch)
            
        alerts_created = []
        for item in queryset:
            if item.quantity_in_stock <= item.reorder_point:
                is_out = item.quantity_in_stock <= 0
                # Create alert if one doesn't already exist for this part/branch/status=open
                alert, created = StockAlert.objects.get_or_create(
                    part=item.part,
                    branch=item.branch,
                    status='active',
                    defaults={
                        'stock_item': item,
                        'alert_type': 'out_of_stock' if is_out else 'low_stock',
                        'message': f"Low stock alert for {item.part.name} at {item.branch.name}. Current: {item.quantity_in_stock}, Reorder Point: {item.reorder_point}",
                        'severity': 'critical' if is_out else 'warning',
                        'current_quantity': item.quantity_in_stock,
                        'reorder_point': item.reorder_point,
                        'minimum_stock': item.minimum_stock,
                    }
                )
                if created:
                    alerts_created.append(alert)
                    
        return alerts_created
