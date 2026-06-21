from rest_framework import viewsets, mixins, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from apps.accounts.permissions import (
    HasAnyPermission,
    HasPermission,
    IsModuleEnabled,
    filter_workorders_for_user,
    user_has_permission,
)
from apps.workorders.permission_utils import (
    WorkOrderRelatedPermissionMixin,
    workorder_edit_permissions,
    workorder_module_permissions,
    workorder_read_permissions,
    workorder_status_change_permissions,
    workorder_task_workflow_permissions,
)
from rest_framework.exceptions import ValidationError as DRFValidationError
from django.core.exceptions import ValidationError
from django.http import Http404
from django.utils import timezone
from django.db.models import Q, Sum, Count, F, Prefetch
from django_filters.rest_framework import DjangoFilterBackend
from datetime import timedelta
from decimal import Decimal, InvalidOperation

# Notification triggers
from apps.notifications_app.triggers import notification_triggers

from apps.branches.utils import resolve_branch, filter_queryset_for_user_branches
from apps.billing.models import Invoice
from apps.inspections.models import VehicleInspection

from ..models import (
    WorkOrder, ServiceTask, ServiceTaskType, WorkOrderPart,
    TechnicianTimeLog, WorkOrderNote, WorkOrderPhoto
)
from ..serializers import (
    WorkOrderListSerializer, WorkOrderDetailSerializer,
    WorkOrderCreateSerializer, WorkOrderUpdateSerializer,
    ServiceTaskSerializer, ServiceTaskCreateSerializer, ServiceTaskTypeSerializer,
    WorkOrderPartSerializer, WorkOrderPartCreateSerializer,
    TechnicianTimeLogSerializer, TechnicianTimeLogCreateSerializer,
    TechnicianTimeLogClockOutSerializer,
    WorkOrderNoteSerializer, WorkOrderNoteCreateSerializer,
    WorkOrderPhotoSerializer, WorkOrderPhotoCreateSerializer,
    TechnicianWorkloadSerializer, WorkOrderStatusSummarySerializer,
    PublicWorkOrderSerializer
)


from ..filters import WorkOrderFilter, TechnicianTimeLogFilter


from ..mixins.document_mixins import WorkOrderDocumentMixin
from ..mixins.transition_mixins import WorkOrderStateTransitionMixin

class WorkOrderPartViewSet(WorkOrderRelatedPermissionMixin, viewsets.ModelViewSet):
    """Work Order Part management"""
    queryset = WorkOrderPart.objects.all().select_related('work_order', 'task', 'installed_by')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['work_order', 'status']
    search_fields = ['part_number', 'part_name', 'description']
    ordering_fields = [
        'status', 'part_name', 'part_number', 'created_at',
        'work_order__work_order_number',
        'work_order__customer__user__last_name', 'work_order__customer__company_name',
        'work_order__vehicle__license_plate', 'work_order__vehicle__make',
    ]
    ordering = ['-created_at']

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return workorder_read_permissions()
        if self.action == 'create':
            return workorder_module_permissions() + [
                HasAnyPermission(['request_parts', 'edit_workorders'])(),
            ]
        if self.action in ('order', 'allocate'):
            return workorder_module_permissions() + [
                HasAnyPermission([
                    'request_parts',
                    'edit_workorders',
                    'manage_inventory',
                    'approve_part_requests',
                ])(),
            ]
        return workorder_edit_permissions()
    
    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """
        Get statistics for parts requests dashboard.
        """
        queryset = self.get_queryset()
        total_requests = queryset.count()
        draft_requests = queryset.filter(status='draft').count()
        pending_requests = queryset.filter(status='pending').count()
        po_created_requests = queryset.filter(status='po_created').count()
        awaiting_stock_requests = queryset.filter(status='awaiting_stock').count()
        received_requests = queryset.filter(status='received').count()
        ready_requests = queryset.filter(status='ready').count()
        
        return Response({
            'total_requests': total_requests,
            'draft_requests': draft_requests,
            'pending_requests': pending_requests,
            'po_created_requests': po_created_requests,
            'awaiting_stock_requests': awaiting_stock_requests,
            'received_requests': received_requests,
            'ready_requests': ready_requests,
        })

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a part requisition"""
        part = self.get_object()
        
        # Check permissions
        if (
            request.user.role not in ['manager', 'admin', 'service_coordinator', 'workshop_manager']
            and not user_has_permission(request.user, 'approve_part_requests')
            and not user_has_permission(request.user, 'manage_inventory')
        ):
             return Response(
                 {'error': 'You do not have permission to approve requisitions.'},
                 status=status.HTTP_403_FORBIDDEN
             )
        
        if part.approved_by:
             return Response(
                 {'error': 'This requisition is already approved.'},
                 status=status.HTTP_400_BAD_REQUEST
             )
             
        part.approved_by = request.user
        part.approved_at = timezone.now()
        part.save()
        
        # Trigger notification
        try:
            from apps.notifications_app.triggers import notification_triggers
            notification_triggers.part_requisition_approved(part)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to send part approval notification: {e}")
        
        serializer = self.get_serializer(part)
        return Response(serializer.data)

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
            return queryset.filter(work_order__customer=user.customer_profile)
        
        # Admin can view all if requested
        if getattr(user, 'role', None) == 'admin' and \
           self.request.query_params.get('all_branches', 'false').lower() == 'true':
            return queryset

        # Filter by active branch
        active_branch = resolve_branch(self.request)
        if active_branch:
            queryset = queryset.filter(work_order__branch=active_branch)
        elif getattr(user, 'role', None) != 'admin':
             # If no active branch and not admin, return empty or default restrictions
             # Usually resolve_branch returns *something* if logged in, but safe to handle.
             pass
             
        # Explicit status filtering if provided (though filterset_fields handles this usually)
        # But we ensure we DON'T filter by status unless asked
        
        return queryset

    @property
    def paginator(self):
        """
        Disable pagination if 'work_order' is in query params
        This ensures the frontend gets ALL parts for a diagnosis list.
        """
        self._paginator = super().paginator
        if 'work_order' in self.request.query_params:
            return None
        return self._paginator
    
    def get_serializer_class(self):
        if self.action == 'create':
            return WorkOrderPartCreateSerializer
        return WorkOrderPartSerializer

    def _validate_stores_fulfillment_allowed(self, wo_part):
        user = self.request.user
        if (
            user.role not in ['manager', 'admin', 'service_coordinator', 'workshop_manager']
            and not user_has_permission(user, 'manage_inventory')
            and not user_has_permission(user, 'approve_part_requests')
        ):
            return (
                False,
                "You do not have permission to fulfill part requests in Stores."
            )
        if not wo_part.approved_by_id:
            return (
                False,
                "Part requisition approval is required before Stores can order or allocate this part."
            )
        work_order = wo_part.work_order
        if not work_order.is_approved:
            return (
                False,
                "Customer approval is required before Stores can order or allocate this part."
            )
        if work_order.status not in {'approved', 'in_progress', 'paused'}:
            return (
                False,
                f"Stores fulfillment is not allowed while the work order is {work_order.status.replace('_', ' ')}."
            )
        return True, None
    
    @action(detail=True, methods=['post'])
    def allocate(self, request, pk=None):
        """Allocate part from inventory"""
        from apps.inventory.models import StockItem
        from apps.inventory.services import InventoryService
        
        wo_part = self.get_object()
        allowed, error = self._validate_stores_fulfillment_allowed(wo_part)
        if not allowed:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)

        if wo_part.status not in ['pending', 'draft', 'po_created', 'awaiting_stock', 'received', 'ordered']: # 'ordered' kept for backward compatibility
             return Response(
                 {'error': f'Cannot allocate part in {wo_part.status} status'},
                 status=status.HTTP_400_BAD_REQUEST
             )

        if not wo_part.part_number:
            return Response(
                {'error': 'Part number is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if wo_part.quantity != wo_part.quantity.to_integral_value():
            return Response(
                {'error': 'Inventory allocation quantity must be a whole number'},
                status=status.HTTP_400_BAD_REQUEST
            )

        part = wo_part.resolve_inventory_part()
        if not part:
            return Response(
                {'error': 'Part not found in inventory'}, 
                status=status.HTTP_404_NOT_FOUND
            )

        branch = wo_part.work_order.branch
        if not branch:
            return Response(
                {'error': 'Work Order has no branch assigned'},
                status=status.HTTP_400_BAD_REQUEST
            )

        inventory_status = wo_part.get_inventory_status_payload()
        if not inventory_status or not inventory_status.get('available'):
            available = inventory_status.get('quantity', 0) if inventory_status else 0
            return Response(
                {'error': f'Insufficient stock. Required: {wo_part.quantity}, Available: {available}'},
                status=status.HTTP_400_BAD_REQUEST
            )
             
        # Execute Allocation
        from django.db import transaction
        try:
            with transaction.atomic():
                part = wo_part.resolve_inventory_part()
                stock_item, _ = StockItem.objects.select_for_update().get_or_create(
                    part=part,
                    branch=branch,
                    defaults={
                        'quantity_in_stock': int(getattr(part, 'quantity_in_stock', 0) or 0),
                        'quantity_reserved': int(getattr(part, 'quantity_reserved', 0) or 0),
                        'reorder_point': part.reorder_point,
                        'reorder_quantity': part.reorder_quantity,
                        'minimum_stock': part.minimum_stock,
                    }
                )

                if Decimal(str(stock_item.available_quantity)) < wo_part.quantity:
                    return Response(
                        {'error': f'Insufficient stock. Required: {wo_part.quantity}, Available: {stock_item.available_quantity}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                allocation_quantity = int(wo_part.quantity)
                InventoryService.record_transaction(
                    part=part,
                    quantity=allocation_quantity,
                    transaction_type='sale',
                    user=request.user,
                    branch=branch,
                    work_order=wo_part.work_order,
                    reason=f"Allocated to WO #{wo_part.work_order.id}",
                )
                
                wo_part.status = 'ready'
                wo_part.inventory_part = part
                wo_part.save()
            
            serializer = self.get_serializer(wo_part)
            return Response(serializer.data)
        except Exception as e:
            import logging
            import traceback
            logging.getLogger(__name__).error(
                "Error in allocate: %s\n%s", e, traceback.format_exc(), exc_info=True
            )
            from django.conf import settings
            msg = f"Allocation failed: {str(e)}" if settings.DEBUG else "Part allocation failed."
            return Response(
                {'error': msg},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def order(self, request, pk=None):
        """Create/Add to Purchase Order"""
        from apps.inventory.models import PurchaseOrder, PurchaseOrderItem
        
        wo_part = self.get_object()
        allowed, error = self._validate_stores_fulfillment_allowed(wo_part)
        if not allowed:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validation
        if wo_part.status not in ['pending', 'draft', 'po_created']: # 'po_created' allows re-triggering/updating PO
             return Response(
                 {'error': f'Cannot order part in {wo_part.status} status'},
                 status=status.HTTP_400_BAD_REQUEST
             )
        
        if wo_part.quantity <= 0:
             return Response(
                 {'error': 'Quantity must be greater than 0 to order'},
                 status=status.HTTP_400_BAD_REQUEST
             )
             
        if not wo_part.part_number:
             return Response(
                 {'error': 'Part number is required to order'},
                 status=status.HTTP_400_BAD_REQUEST
             )

        # Identify Part & Supplier
        part = wo_part.resolve_inventory_part()
        if not part:
             # Instead of error, return flag for frontend to handle
             return Response(
                 {
                     'error': f"Part '{wo_part.part_number}' not found in Inventory.",
                     'needs_inventory_item': True,
                     'part_data': {
                         'part_name': wo_part.part_name,
                         'part_number': wo_part.part_number,
                         'description': wo_part.description
                     }
                 },
                 status=status.HTTP_404_NOT_FOUND
             )

        inventory_status = wo_part.get_inventory_status_payload()
        if inventory_status and inventory_status.get('available'):
            return Response(
                {'error': f"Part '{wo_part.part_number}' is in stock. Allocate it instead of creating a PO."},
                status=status.HTTP_400_BAD_REQUEST
            )
             
        supplier = part.preferred_supplier
        if not supplier:
            # Fallback: Check if part has any suppliers
            supplier = part.suppliers.first()
            
        if not supplier:
             return Response(
                 {'error': 'Part has no supplier defined. Please assign a supplier in Inventory.'},
                 status=status.HTTP_400_BAD_REQUEST
             )

        # Identify Branch (Order for the branch where WO exists)
        branch = wo_part.work_order.branch
        if not branch:
             return Response({'error': 'Work Order has no branch assigned'}, status=status.HTTP_400_BAD_REQUEST)

        # Find Open PO (Draft) or Create New
        po = PurchaseOrder.objects.filter(
            supplier=supplier,
            branch=branch,
            status='draft'
        ).first()
        
        created_new_po = False
        if not po:
            po = PurchaseOrder.objects.create(
                supplier=supplier,
                branch=branch,
                status='draft',
                created_by=request.user,
                notes=f"Auto-generated for Work Orders"
            )
            created_new_po = True
            
        # Create/Update PO Item
        # Check if item already exists in this PO
        po_item = PurchaseOrderItem.objects.filter(
            purchase_order=po,
            part=part
        ).first()
        
        if po_item:
            po_item.quantity += wo_part.quantity
            po_item.save()
        else:
            unit_cost = Decimal(str(part.cost_price or getattr(part, 'last_cost', None) or '0.01'))
            if unit_cost <= 0:
                unit_cost = Decimal('0.01')
            po_item = PurchaseOrderItem.objects.create(
                purchase_order=po,
                part=part,
                quantity=int(wo_part.quantity),
                unit_cost=unit_cost,
            )

        # Link WO Part to PO Item and set status to 'po_created'
        wo_part.purchase_order_item = po_item
        wo_part.status = 'po_created'
        wo_part.save()
        
        return Response({
            'status': 'po_created',
            'po_number': po.po_number,
            'po_id': po.id,
            'message': f"{'Created new' if created_new_po else 'Added to'} PO {po.po_number}"
        })
    
    @action(detail=True, methods=['post'])
    def create_and_order(self, request, pk=None):
        """Create inventory part and add to Purchase Order"""
        from apps.inventory.models import Part, PurchaseOrder, PurchaseOrderItem, Supplier, PartCategory
        from decimal import Decimal
        
        wo_part = self.get_object()
        allowed, error = self._validate_stores_fulfillment_allowed(wo_part)
        if not allowed:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validation
        # Validation
        if wo_part.status not in ['pending', 'draft', 'po_created']:
            return Response(
                {'error': f'Cannot order part in {wo_part.status} status'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if wo_part.quantity <= 0:
             return Response(
                 {'error': 'Quantity must be greater than 0 to order'},
                 status=status.HTTP_400_BAD_REQUEST
             )
        
        # Required data from request
        part_data = request.data
        required_fields = ['part_name', 'part_number', 'cost_price', 'supplier_id']
        missing = [f for f in required_fields if not part_data.get(f)]
        if missing:
            return Response(
                {'error': f'Missing required fields: {", ".join(missing)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if part already exists
        existing_part = Part.objects.filter(part_number=part_data['part_number']).first()
        if existing_part:
            return Response(
                {'error': f'Part with number {part_data["part_number"]} already exists'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get supplier
        try:
            supplier = Supplier.objects.get(id=part_data['supplier_id'])
        except Supplier.DoesNotExist:
            return Response(
                {'error': 'Supplier not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Identify Branch
        branch = wo_part.work_order.branch
        if not branch:
            return Response({'error': 'Work Order has no branch assigned'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get or create default category
        category_name = part_data.get('category', 'Uncategorized')
        category, _ = PartCategory.objects.get_or_create(name=category_name)

        # Create Part in Inventory
        part = Part.objects.create(
            name=part_data['part_name'],
            part_number=part_data['part_number'],
            description=part_data.get('description', wo_part.description or ''),
            category=category,
            cost_price=Decimal(str(part_data.get('cost_price') or 0)),
            selling_price=Decimal(str(part_data.get('selling_price') or part_data.get('cost_price') or 0)),
            quantity_in_stock=0,  # Initially 0, will be updated when PO is received
            minimum_stock=int(part_data.get('minimum_stock_level', 1)),
            branch=branch,
            preferred_supplier=supplier,
            created_by=request.user
        )
        
        # Add supplier to part's suppliers
        part.suppliers.add(supplier)
        
        # Find Open PO (Draft) or Create New
        po = PurchaseOrder.objects.filter(
            supplier=supplier,
            branch=branch,
            status='draft'
        ).first()
        
        created_new_po = False
        if not po:
            po = PurchaseOrder.objects.create(
                supplier=supplier,
                branch=branch,
                status='draft',
                created_by=request.user,
                notes=f"Auto-generated for Work Orders"
            )
            created_new_po = True
        
        # Create PO Item
        unit_cost = Decimal(str(part.cost_price or '0.01'))
        if unit_cost <= 0:
            unit_cost = Decimal('0.01')
        po_item = PurchaseOrderItem.objects.create(
            purchase_order=po,
            part=part,
            quantity=int(wo_part.quantity),
            unit_cost=unit_cost,
        )
        
        # Link WO Part to PO Item and update inventory reference
        wo_part.inventory_part = part
        wo_part.part_name = part.name
        wo_part.part_number = part.part_number
        if wo_part.unit_cost == 0 and part.cost_price:
            wo_part.unit_cost = part.cost_price
        wo_part.purchase_order_item = po_item
        wo_part.status = 'po_created'
        wo_part.save()
        
        return Response({
            'status': 'po_created',
            'po_number': po.po_number,
            'po_id': po.id,
            'part_id': part.id,
            'message': f"Created part '{part.name}' and {'new' if created_new_po else 'added to'} PO {po.po_number}"
        })

    @action(detail=False, methods=['post'])
    def bulk_order(self, request):
        """Bulk create/add to Purchase Orders for multiple parts"""
        from apps.inventory.models import PurchaseOrder, PurchaseOrderItem
        
        ids = request.data.get('ids', [])
        if not ids:
             return Response({'error': 'No IDs provided'}, status=status.HTTP_400_BAD_REQUEST)
             
        parts_to_order = WorkOrderPart.objects.filter(id__in=ids, status__in=['pending', 'draft', 'po_created'])
        
        results = {
            'processed': 0,
            'po_numbers': set(),
            'errors': []
        }
        
        for wo_part in parts_to_order:
            allowed, error = self._validate_stores_fulfillment_allowed(wo_part)
            if not allowed:
                results['errors'].append(f"Part {wo_part.id}: {error}")
                continue

            if wo_part.quantity <= 0:
                results['errors'].append(f"Part {wo_part.id}: Quantity must be positive")
                continue

            if not wo_part.part_number:
                results['errors'].append(f"Part {wo_part.id}: Missing part number")
                continue
                
            if wo_part.purchase_order_item_id:
                results['errors'].append(f"Part {wo_part.part_number}: Already linked to a purchase order")
                continue

            # Identify Part & Supplier
            part = wo_part.resolve_inventory_part()
            if not part:
                 results['errors'].append(f"Part {wo_part.part_number}: Not found in inventory")
                 continue

            inventory_status = wo_part.get_inventory_status_payload()
            if inventory_status and inventory_status.get('available'):
                 results['errors'].append(f"Part {wo_part.part_number}: In stock; allocate instead")
                 continue
                 
            supplier = part.preferred_supplier or part.suppliers.first()
            if not supplier:
                 results['errors'].append(f"Part {wo_part.part_number}: No supplier")
                 continue
                 
            branch = wo_part.work_order.branch
            if not branch:
                 results['errors'].append(f"WO {wo_part.work_order.id}: No branch")
                 continue
                 
            # Find/Create PO
            po = PurchaseOrder.objects.filter(
                supplier=supplier,
                branch=branch,
                status='draft'
            ).first()
            
            if not po:
                po = PurchaseOrder.objects.create(
                    supplier=supplier,
                    branch=branch,
                    status='draft',
                    created_by=request.user,
                    notes=f"Auto-generated for Work Orders"
                )
                
            results['po_numbers'].add(po.po_number)
            
            # Create/Update PO Item
            po_item = PurchaseOrderItem.objects.filter(purchase_order=po, part=part).first()
            if po_item:
                po_item.quantity += wo_part.quantity
                po_item.save()

            else:
                unit_cost = Decimal(str(part.cost_price or getattr(part, 'last_cost', None) or '0.01'))
                if unit_cost <= 0:
                    unit_cost = Decimal('0.01')
                po_item = PurchaseOrderItem.objects.create(
                    purchase_order=po,
                    part=part,
                    quantity=int(wo_part.quantity),
                    unit_cost=unit_cost,
                )
                
            wo_part.purchase_order_item = po_item
            wo_part.status = 'po_created'
            wo_part.save()
            results['processed'] += 1
            
        return Response({
            'status': 'success',
            'processed': results['processed'],
            'po_numbers': list(results['po_numbers']),
            'errors': results['errors']
        })

    def perform_create(self, serializer):
        part = serializer.save()
        work_order = part.work_order

        if work_order.status in {'approved', 'in_progress', 'paused'}:
            try:
                work_order.transition_to('additional_work_found', user=self.request.user)
                part.additional_work_triggered = True
                WorkOrderNote.objects.create(
                    work_order=work_order,
                    note_type='parts',
                    note=(
                        f"Additional part requested after customer approval: "
                        f"{part.part_name} x{part.quantity}. Customer approval is required before repairs continue."
                    ),
                    created_by=self.request.user,
                    is_important=True,
                    is_customer_visible=False,
                )
            except ValidationError as exc:
                raise DRFValidationError({'error': '; '.join(exc.messages) if hasattr(exc, 'messages') else str(exc)})
        
        # Trigger notification
        try:
            from apps.notifications_app.triggers import notification_triggers
            notification_triggers.part_requisition_created(part)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to send part requisition notification: {e}")
    @action(detail=True, methods=['post'])
    def mark_installed(self, request, pk=None):
        """Mark part as installed"""
        part = self.get_object()
        if part.status not in ['ready', 'received']:
            return Response(
                {'error': f'Only allocated or received parts can be marked as installed. Current status: {part.status}.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        part.status = 'installed'
        part.installed_at = timezone.now()
        part.installed_by = request.user
        part.save()
        
        serializer = self.get_serializer(part)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def mark_returned(self, request, pk=None):
        """Mark part as returned to stores with a reason."""
        from apps.inventory.models import InventoryTransaction, Part

        part = self.get_object()
        if part.status in ['installed', 'returned']:
            return Response(
                {'error': f'Cannot return a part in {part.status} status.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response(
                {'error': 'A return reason is required when a part is not used.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        previous_status = part.status
        part.status = 'returned'
        part.resolution_notes = reason
        part.save()

        if previous_status == 'ready' and part.inventory_part_id:
            inventory_part = Part.objects.filter(id=part.inventory_part_id).first()
            if inventory_part:
                InventoryTransaction.objects.create(
                    part=inventory_part,
                    transaction_type='adjustment',
                    quantity=part.quantity,
                    balance_after=inventory_part.quantity_in_stock + part.quantity,
                    work_order=part.work_order,
                    reason=f"Returned from WO #{part.work_order.id}: {reason}",
                    created_by=request.user,
                )

        serializer = self.get_serializer(part)
        return Response(serializer.data)
