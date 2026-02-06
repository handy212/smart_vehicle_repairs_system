from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import HasPermission
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.db.models import Sum, Count, F, Q, Avg
from django.utils import timezone
from django.db import connection, models
from django.db.models import Sum, Count, F, Q, Avg, Subquery, OuterRef, Value
from django.db.models.functions import Coalesce
from datetime import date, datetime, timedelta
from decimal import Decimal

from apps.branches.utils import filter_queryset_for_user_branches

from .models import (
    PartCategory, Supplier, Part, PurchaseOrder, 
    PurchaseOrderItem, InventoryTransaction,
    ServicePackage, StockItem, Transfer, TransferItem, StockAlert,
    PhysicalCountSession, PhysicalCountItem, ServiceBundle, ServiceBundleItem
)
from .serializers import (
    PartCategorySerializer, SupplierListSerializer, SupplierDetailSerializer,
    SupplierCreateSerializer, PartListSerializer, PartDetailSerializer,
    PartCreateSerializer, PartUpdateSerializer, PartStockAdjustmentSerializer,
    PurchaseOrderListSerializer, PurchaseOrderDetailSerializer,
    PurchaseOrderCreateSerializer, PurchaseOrderUpdateSerializer,
    PurchaseOrderItemSerializer, PurchaseOrderItemCreateSerializer,
    ReceiveItemSerializer, InventoryTransactionSerializer,
    InventoryTransactionCreateSerializer, LowStockReportSerializer,
    InventoryValueReportSerializer, ServicePackageSerializer,
    ServicePackageCreateSerializer, StockItemSerializer,
    TransferSerializer, TransferCreateSerializer,
    StockAlertSerializer, StockAlertUpdateSerializer,
    PhysicalCountSessionSerializer, PhysicalCountSessionCreateSerializer,
    PhysicalCountItemSerializer, PhysicalCountItemCreateSerializer,
    ServiceBundleSerializer, ServiceBundleCreateUpdateSerializer
)
from .services import InventoryService


class PartCategoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for part categories with hierarchical structure
    """
    queryset = PartCategory.objects.prefetch_related('subcategories', 'parts')
    serializer_class = PartCategorySerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve', 'root_categories', 'dashboard_stats', 'subcategories', 'parts_list']:
            return [IsAuthenticated(), HasPermission('view_inventory')]
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), HasPermission('manage_categories')]
        return [IsAuthenticated()]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active', 'parent']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']

    @action(detail=False, methods=['get'])
    def root_categories(self, request):
        """Get only root categories (no parent)"""
        categories = self.queryset.filter(parent__isnull=True)
        serializer = self.get_serializer(categories, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """
        Get statistics for category dashboard.
        """
        total_categories = self.get_queryset().count()
        return Response({
            'total_categories': total_categories
        })

    @action(detail=True, methods=['get'])
    def subcategories(self, request, pk=None):
        """Get subcategories of a category"""
        category = self.get_object()
        subcategories = category.subcategories.all()
        serializer = self.get_serializer(subcategories, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def parts_list(self, request, pk=None):
        """Get all parts in this category"""
        category = self.get_object()
        parts = category.parts.filter(is_active=True)
        from .serializers import PartListSerializer
        serializer = PartListSerializer(parts, many=True)
        return Response(serializer.data)


class SupplierViewSet(viewsets.ModelViewSet):
    """
    ViewSet for supplier management
    """
    queryset = Supplier.objects.all()
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), HasPermission('view_suppliers')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('manage_suppliers')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('manage_suppliers')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('manage_suppliers')]
        return [IsAuthenticated()]
    
    """
    ViewSet for suppliers with filtering and custom actions
    """
    queryset = Supplier.objects.prefetch_related('parts', 'purchase_orders')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['supplier_type', 'is_active', 'is_preferred']
    search_fields = ['name', 'supplier_code', 'contact_person', 'email', 'city']
    ordering_fields = ['name', 'supplier_code', 'created_at']
    ordering = ['name']

    def get_serializer_class(self):
        if self.action == 'create':
            return SupplierCreateSerializer
        elif self.action in ['retrieve', 'update', 'partial_update']:
            return SupplierDetailSerializer
        return SupplierListSerializer

    @action(detail=False, methods=['get'])
    def preferred(self, request):
        """Get list of preferred suppliers"""
        suppliers = self.queryset.filter(is_preferred=True, is_active=True)
        serializer = SupplierListSerializer(suppliers, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def parts_list(self, request, pk=None):
        """Get all parts from this supplier"""
        supplier = self.get_object()
        parts = supplier.parts.filter(is_active=True)
        from .serializers import PartListSerializer
        serializer = PartListSerializer(parts, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def purchase_orders_list(self, request, pk=None):
        """Get all purchase orders for this supplier"""
        supplier = self.get_object()
        orders = supplier.purchase_orders.all()
        serializer = PurchaseOrderListSerializer(orders, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """
        Get statistics for supplier dashboard.
        """
        queryset = self.get_queryset()
        total_suppliers = queryset.count()
        active_suppliers = queryset.filter(is_active=True).count()
        preferred_suppliers = queryset.filter(is_preferred=True).count()
        
        return Response({
            'total_suppliers': total_suppliers,
            'active_suppliers': active_suppliers,
            'preferred_suppliers': preferred_suppliers
        })

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Activate supplier"""
        supplier = self.get_object()
        supplier.is_active = True
        supplier.save()
        return Response({'status': 'Supplier activated'})

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Deactivate supplier"""
        supplier = self.get_object()
        supplier.is_active = False
        supplier.save()
        return Response({'status': 'Supplier deactivated'})


class PartViewSet(viewsets.ModelViewSet):
    """
    ViewSet for parts inventory with extensive filtering and stock management
    """
    queryset = Part.objects.select_related('category', 'preferred_supplier', 'created_by').prefetch_related('suppliers')
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """
        Get statistics for parts dashboard.
        """
        queryset = self.get_queryset()
        total_parts = queryset.count()
        low_stock = queryset.filter(current_stock__lte=F('reorder_point')).count()
        out_of_stock = queryset.filter(current_stock=0).count()
        
        # Calculate total inventory value
        # Note: total_value property on Part uses simple cost * quantity.
        # But we want to use the annotated stock level.
        total_value = 0
        
        # Optimization: Aggregate in DB if possible, but total_value depends on cost_price * current_stock
        # Since cost_price is on Part and current_stock is annotated
        val_agg = queryset.aggregate(
            total_val=Sum(F('cost_price') * F('current_stock'), output_field=models.DecimalField())
        )
        total_value = val_agg['total_val'] or 0
            
        return Response({
            'total_parts': total_parts,
            'low_stock': low_stock,
            'out_of_stock': out_of_stock,
            'total_value': total_value
        })

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), HasPermission('view_inventory')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('create_parts')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('edit_parts')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('delete_parts')]
        return [IsAuthenticated()]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = [
        'category', 'is_active', 'manufacturer', 'preferred_supplier', 'is_taxable', 'is_core'
    ]
    search_fields = [
        'part_number', 'name', 'description', 'manufacturer',
        'manufacturer_part_number', 'bin_location', 'compatible_makes'
    ]
    ordering_fields = [
        'part_number', 'name', 'quantity_in_stock', 'cost_price',
        'selling_price', 'reorder_point', 'created_at'
    ]
    ordering = ['part_number']

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Use centralized branch resolution
        from apps.branches.utils import resolve_branch
        branch = resolve_branch(self.request)
        branch_id = branch.id if branch else None
        
        if branch_id:
            # Filter/Annotate based on specific branch
            stock_subquery = StockItem.objects.filter(
                part=OuterRef('pk'),
                branch_id=branch_id
            ).values('quantity_in_stock')[:1]
            
            reserved_subquery = StockItem.objects.filter(
                part=OuterRef('pk'),
                branch_id=branch_id
            ).values('quantity_reserved')[:1]
            
            queryset = queryset.annotate(
                branch_stock=Coalesce(Subquery(stock_subquery), 0),
                branch_reserved=Coalesce(Subquery(reserved_subquery), 0)
            ).annotate(
                current_stock=F('branch_stock'),
                current_reserved=F('branch_reserved')
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
        
        # Custom filter: low stock
        if self.request.query_params.get('low_stock') == 'true':
            queryset = queryset.filter(current_stock__lte=F('reorder_point'))
        
        # Custom filter: out of stock
        if self.request.query_params.get('out_of_stock') == 'true':
            queryset = queryset.filter(current_stock=0)
        
        # Custom filter: needs reorder
        if self.request.query_params.get('needs_reorder') == 'true':
            queryset = queryset.filter(
                current_stock__lte=F('reorder_point'),
                # quantity_on_order=0  # Simple logic, can be improved
            )
            
        return queryset

    def get_serializer_class(self):
        if self.action == 'create':
            return PartCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return PartUpdateSerializer
        elif self.action == 'retrieve':
            return PartDetailSerializer
        return PartListSerializer

    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        """Get all parts with low stock"""
        # Use get_queryset() to ensure we use branch-specific stock if filtered
        parts = self.get_queryset().filter(current_stock__lte=F('reorder_point'))
        
        page = self.paginate_queryset(parts)
        if page is not None:
            serializer = PartListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = PartListSerializer(parts, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def out_of_stock(self, request):
        """Get all parts that are out of stock"""
        # Use get_queryset() to ensure we use branch-specific stock if filtered
        parts = self.get_queryset().filter(current_stock=0)
        
        page = self.paginate_queryset(parts)
        if page is not None:
            serializer = PartListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = PartListSerializer(parts, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def needs_reorder(self, request):
        """Get all parts that need to be reordered"""
        # Use get_queryset() which provides annotated current_stock
        parts = self.get_queryset().filter(
            current_stock__lte=F('reorder_point'),
            current_stock__gt=0
        )
        page = self.paginate_queryset(parts)
        if page is not None:
            serializer = PartListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = PartListSerializer(parts, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def adjust(self, request, pk=None):
        """Manually adjust stock quantity"""
        part = self.get_object()
        serializer = PartStockAdjustmentSerializer(data=request.data)
        
        if serializer.is_valid():
            quantity = serializer.validated_data['quantity']
            reason = serializer.validated_data['reason']
            notes = serializer.validated_data.get('notes', '')
            
            # Resolve branch from request
            from apps.branches.utils import resolve_branch
            branch = resolve_branch(request)
            if not branch:
                return Response(
                    {'error': 'Branch is required for stock adjustments. Please select an active branch.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Get current stock from StockItem
            from .models import StockItem
            stock_item, _ = StockItem.objects.get_or_create(
                part=part,
                branch=branch,
                defaults={
                    'reorder_point': part.reorder_point,
                    'reorder_quantity': part.reorder_quantity,
                    'minimum_stock': part.minimum_stock,
                }
            )
            
            # Calculate new balance (prevent negative stock)
            old_balance = stock_item.quantity_in_stock
            new_balance = max(0, old_balance + quantity)
            actual_change = new_balance - old_balance
            
            # Use InventoryService to record transaction
            # For adjustments, we need to set balance_after explicitly
            inv_trans = InventoryService.record_transaction(
                part=part,
                quantity=actual_change,
                transaction_type='adjustment',
                user=request.user,
                branch=branch,
                reason=reason,
                notes=notes
            )
            
            # Update balance_after to the calculated value
            inv_trans.balance_after = new_balance
            inv_trans.save(update_fields=['balance_after'])
            
            # Refresh stock_item to get updated values
            stock_item.refresh_from_db()
            
            return Response({
                'status': 'Stock adjusted successfully',
                'new_quantity': stock_item.quantity_in_stock,
                'adjustment': actual_change,
                'branch': branch.name
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def bulk_adjust(self, request):
        """
        Bulk stock adjustment for multiple parts
        """
        from .serializers import BulkStockAdjustmentSerializer
        from apps.branches.utils import resolve_branch
        from django.db import transaction as db_transaction
        
        serializer = BulkStockAdjustmentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        branch = resolve_branch(request)
        if not branch:
            return Response(
                {'error': 'Branch is required for bulk stock adjustments. Please select an active branch.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        adjustments = serializer.validated_data['adjustments']
        transaction_type = serializer.validated_data.get('transaction_type', 'adjustment')
        default_reason = serializer.validated_data.get('reason', 'Bulk adjustment')
        default_notes = serializer.validated_data.get('notes', '')
        
        results = {
            'successful': [],
            'failed': [],
            'total_requested': len(adjustments),
            'total_successful': 0,
            'total_failed': 0
        }
        
        with db_transaction.atomic():
            for adj in adjustments:
                try:
                    part_id = adj['part_id']
                    quantity_change = adj['quantity_change']
                    reason = adj.get('reason') or default_reason
                    notes = adj.get('notes') or default_notes
                    
                    # Get part
                    try:
                        part = Part.objects.get(id=part_id)
                    except Part.DoesNotExist:
                        results['failed'].append({
                            'part_id': part_id,
                            'error': 'Part not found'
                        })
                        results['total_failed'] += 1
                        continue
                    
                    # Get or create stock item
                    stock_item, created = StockItem.objects.get_or_create(
                        part=part,
                        branch=branch,
                        defaults={'quantity_in_stock': 0}
                    )
                    
                    # Check if adjustment would result in negative stock
                    if quantity_change < 0 and abs(quantity_change) > stock_item.quantity_in_stock:
                        results['failed'].append({
                            'part_id': part_id,
                            'part_name': part.name,
                            'part_number': part.part_number,
                            'error': f'Insufficient stock. Current: {stock_item.quantity_in_stock}, Requested: {quantity_change}'
                        })
                        results['total_failed'] += 1
                        continue
                    
                    # Record transaction
                    inv_transaction = InventoryService.record_transaction(
                        part=part,
                        quantity=quantity_change,
                        transaction_type=transaction_type,
                        user=request.user,
                        branch=branch,
                        reason=reason,
                        notes=notes,
                        unit_cost=part.cost_price
                    )
                    
                    # Refresh stock item
                    stock_item.refresh_from_db()
                    
                    results['successful'].append({
                        'part_id': part_id,
                        'part_name': part.name,
                        'part_number': part.part_number,
                        'quantity_change': quantity_change,
                        'new_quantity': stock_item.quantity_in_stock,
                        'transaction_id': inv_transaction.id
                    })
                    results['total_successful'] += 1
                    
                except ValueError as ve:
                    results['failed'].append({
                        'part_id': adj.get('part_id', 'unknown'),
                        'error': str(ve)
                    })
                    results['total_failed'] += 1
                except Exception as e:
                    results['failed'].append({
                        'part_id': adj.get('part_id', 'unknown'),
                        'error': f'Unexpected error: {str(e)}'
                    })
                    results['total_failed'] += 1
        
        return Response(results, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def transaction_history(self, request, pk=None):
        """Get transaction history for a part"""
        part = self.get_object()
        transactions = part.transactions.all()[:50]  # Last 50 transactions
        serializer = InventoryTransactionSerializer(transactions, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def low_stock_report(self, request):
        """Generate low stock report"""
        # Use get_queryset() to get parts with annotated current_stock
        parts = self.get_queryset().filter(
            is_active=True
        ).select_related('category', 'preferred_supplier')
        
        # Filter for low stock using annotated current_stock
        low_stock_parts = []
        for part in parts:
            stock = getattr(part, 'current_stock', 0) or 0
            if stock <= part.reorder_point:
                # Get quantity_on_order from StockItem if branch is specified
                from apps.branches.utils import resolve_branch
                branch = resolve_branch(request)
                quantity_on_order = 0
                if branch:
                    from .models import StockItem
                    try:
                        stock_item = StockItem.objects.get(part=part, branch=branch)
                        quantity_on_order = stock_item.quantity_on_order
                    except StockItem.DoesNotExist:
                        pass
                
                low_stock_parts.append({
                'part_id': part.id,
                'part_number': part.part_number,
                'part_name': part.name,
                'category_name': part.category.name if part.category else '',
                    'quantity_in_stock': stock,
                'reorder_point': part.reorder_point,
                    'quantity_on_order': quantity_on_order,
                    'needs_reorder': stock <= part.reorder_point and stock > 0,
                'preferred_supplier_name': part.preferred_supplier.name if part.preferred_supplier else ''
            })
        
        serializer = LowStockReportSerializer(low_stock_parts, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def inventory_value(self, request):
        """Get total inventory value and breakdown by category"""
        # Use get_queryset() to get parts with annotated current_stock
        parts = self.get_queryset().filter(is_active=True)
        
        # Resolve branch for StockItem aggregation
        from apps.branches.utils import resolve_branch
        branch = resolve_branch(request)
        
        total_parts = parts.count()
        total_quantity = 0
        total_value = Decimal('0.00')
        
        # Aggregate from StockItem if branch is specified, otherwise aggregate from all branches
        if branch:
            from .models import StockItem
            stock_items = StockItem.objects.filter(
                part__in=parts,
                branch=branch
            ).select_related('part', 'part__category')
            
            for stock_item in stock_items:
                qty = stock_item.quantity_in_stock
                total_quantity += qty
                if stock_item.part.cost_price:
                    total_value += stock_item.part.cost_price * qty
        else:
            # Aggregate from all branches
            from .models import StockItem
            stock_items = StockItem.objects.filter(
                part__in=parts
            ).select_related('part', 'part__category').values('part', 'part__category').annotate(
                total_qty=Sum('quantity_in_stock')
            )
            
            for item in stock_items:
                part = Part.objects.get(id=item['part'])
                qty = item['total_qty']
                total_quantity += qty
                if part.cost_price:
                    total_value += part.cost_price * qty
        
        # Breakdown by category
        by_category = []
        categories = PartCategory.objects.filter(is_active=True)
        
        for category in categories:
            category_parts = parts.filter(category=category)
            category_value = Decimal('0.00')
            category_qty = 0
            
            if branch:
                category_stock = StockItem.objects.filter(
                    part__category=category,
                    part__in=category_parts,
                    branch=branch
                )
                for stock_item in category_stock:
                    qty = stock_item.quantity_in_stock
                    category_qty += qty
                    if stock_item.part.cost_price:
                        category_value += stock_item.part.cost_price * qty
            else:
                category_stock = StockItem.objects.filter(
                    part__category=category,
                    part__in=category_parts
                ).values('part').annotate(total_qty=Sum('quantity_in_stock'))
                
                for item in category_stock:
                    part = Part.objects.get(id=item['part'])
                    qty = item['total_qty']
                    category_qty += qty
                    if part.cost_price:
                        category_value += part.cost_price * qty
            
            if category_qty > 0:
                by_category.append({
                    'category_name': category.name,
                    'parts_count': category_parts.count(),
                    'total_quantity': category_qty,
                    'total_value': float(category_value)
                })
        
        report = {
            'total_parts': total_parts,
            'total_quantity': total_quantity,
            'total_value': float(total_value),
            'by_category': by_category
        }
        
        serializer = InventoryValueReportSerializer(report)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def reserve(self, request, pk=None):
        """Reserve quantity for a work order"""
        part = self.get_object()
        quantity = request.data.get('quantity', 0)
        
        if quantity <= 0:
            return Response(
                {'error': 'Quantity must be greater than 0'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Resolve branch from request
        from apps.branches.utils import resolve_branch
        branch = resolve_branch(request)
        if not branch:
            return Response(
                {'error': 'Branch is required for reservations. Please select an active branch.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get StockItem to check availability
        from .models import StockItem
        stock_item, _ = StockItem.objects.get_or_create(
            part=part,
            branch=branch,
            defaults={
                'reorder_point': part.reorder_point,
                'reorder_quantity': part.reorder_quantity,
                'minimum_stock': part.minimum_stock,
            }
        )
        
        available_qty = stock_item.available_quantity
        if available_qty < quantity:
            return Response(
                {'error': f'Insufficient stock. Available: {available_qty}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Use InventoryService to reserve
        InventoryService.record_transaction(
            part=part,
            quantity=quantity,
            transaction_type='reserve',
            user=request.user,
            branch=branch,
            reason=request.data.get('reason', 'Manual reservation'),
            notes=request.data.get('notes', '')
        )
        
        # Refresh to get updated values
        stock_item.refresh_from_db()
        
        return Response({
            'status': 'Quantity reserved',
            'reserved': quantity,
            'total_reserved': stock_item.quantity_reserved,
            'available': stock_item.available_quantity,
            'branch': branch.name
        })

    @action(detail=True, methods=['post'])
    def release_reservation(self, request, pk=None):
        """Release reserved quantity"""
        part = self.get_object()
        quantity = request.data.get('quantity', 0)
        
        if quantity <= 0:
            return Response(
                {'error': 'Quantity must be greater than 0'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Resolve branch from request
        from apps.branches.utils import resolve_branch
        branch = resolve_branch(request)
        if not branch:
            return Response(
                {'error': 'Branch is required for releasing reservations. Please select an active branch.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get StockItem to check reserved quantity
        from .models import StockItem
        try:
            stock_item = StockItem.objects.get(part=part, branch=branch)
        except StockItem.DoesNotExist:
            return Response(
                {'error': 'No stock item found for this branch'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if stock_item.quantity_reserved < quantity:
            return Response(
                {'error': f'Cannot release more than reserved. Reserved: {stock_item.quantity_reserved}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Use InventoryService to release
        InventoryService.record_transaction(
            part=part,
            quantity=quantity,
            transaction_type='release',
            user=request.user,
            branch=branch,
            reason=request.data.get('reason', 'Manual release'),
            notes=request.data.get('notes', '')
        )
        
        # Refresh to get updated values
        stock_item.refresh_from_db()
        
        return Response({
            'status': 'Reservation released',
            'released': quantity,
            'total_reserved': stock_item.quantity_reserved,
            'available': stock_item.available_quantity,
            'branch': branch.name
        })
    
    @action(detail=False, methods=['post'])
    def import_csv(self, request):
        """Import parts from CSV file"""
        import csv
        from django.db import transaction
        from apps.accounts.admin_views import log_audit
        
        if 'file' not in request.FILES:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        csv_file = request.FILES['file']
        filename = csv_file.name
        
        try:
            imported_count = 0
            skipped_count = 0
            errors = []
            
            # Read CSV file
            decoded_file = csv_file.read().decode('utf-8').splitlines()
            reader = csv.DictReader(decoded_file)
            
            # Required headers
            required_headers = ['part_number', 'name']
            
            # Check if required headers exist
            if not all(header in reader.fieldnames for header in required_headers):
                return Response({
                    'error': f'CSV file must contain these columns: {", ".join(required_headers)}'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Process each row
            for row_num, row in enumerate(reader, start=2):
                try:
                    part_number = row.get('part_number', '').strip()
                    name = row.get('name', '').strip()
                    
                    # Validate required fields
                    if not part_number or not name:
                        errors.append(f"Row {row_num}: Missing part_number or name")
                        skipped_count += 1
                        continue
                    
                    # Get or create category
                    category = None
                    if row.get('category'):
                        category_name = row.get('category', '').strip()
                        category, _ = PartCategory.objects.get_or_create(
                            name=category_name,
                            defaults={'created_by': request.user, 'is_active': True}
                        )
                    
                    # Parse numeric fields
                    cost_price = None
                    if row.get('cost_price'):
                        try:
                            cost_price = Decimal(row.get('cost_price', '0'))
                        except:
                            pass
                    
                    selling_price = None
                    if row.get('selling_price'):
                        try:
                            selling_price = Decimal(row.get('selling_price', '0'))
                        except:
                            pass
                    
                    quantity_in_stock = int(row.get('quantity_in_stock', 0)) if row.get('quantity_in_stock') else 0
                    minimum_stock = int(row.get('minimum_stock', 0)) if row.get('minimum_stock') else 0
                    reorder_point = int(row.get('reorder_point', 0)) if row.get('reorder_point') else 0
                    reorder_quantity = int(row.get('reorder_quantity', 0)) if row.get('reorder_quantity') else 0
                    
                    # Parse boolean fields
                    is_taxable = row.get('is_taxable', 'false').lower() == 'true'
                    is_core = row.get('is_core', 'false').lower() == 'true'
                    is_active = row.get('is_active', 'true').lower() != 'false'
                    
                    core_charge = None
                    if row.get('core_charge'):
                        try:
                            core_charge = Decimal(row.get('core_charge', '0'))
                        except:
                            pass
                    
                    # Resolve branch for StockItem creation
                    from apps.branches.utils import resolve_branch
                    branch = resolve_branch(request)
                    if not branch:
                        errors.append(f"Row {row_num}: Branch is required for inventory import. Please select an active branch.")
                        skipped_count += 1
                        continue
                    
                    # Create or update part (don't set deprecated quantity_in_stock)
                    with transaction.atomic():
                        part, created = Part.objects.update_or_create(
                            part_number=part_number,
                            defaults={
                                'name': name,
                                'description': row.get('description', '').strip() or None,
                                'category': category,
                                'manufacturer': row.get('manufacturer', '').strip() or None,
                                'manufacturer_part_number': row.get('manufacturer_part_number', '').strip() or None,
                                'cost_price': cost_price,
                                'selling_price': selling_price,
                                'minimum_stock': minimum_stock,
                                'reorder_point': reorder_point,
                                'reorder_quantity': reorder_quantity,
                                'bin_location': row.get('bin_location', '').strip() or None,
                                'is_taxable': is_taxable,
                                'is_core': is_core,
                                'core_charge': core_charge,
                                'unit': row.get('unit', row.get('unit_of_measure', 'piece')).strip() or 'piece',  # Support both field names
                                'is_active': is_active,
                                'created_by': request.user if created else None,
                            }
                        )
                        
                        # Create or update StockItem for this branch
                        from .models import StockItem
                        stock_item, stock_created = StockItem.objects.get_or_create(
                            part=part,
                            branch=branch,
                            defaults={
                                'quantity_in_stock': quantity_in_stock,
                                'minimum_stock': minimum_stock,
                                'reorder_point': reorder_point,
                                'reorder_quantity': reorder_quantity,
                                'bin_location': row.get('bin_location', '').strip() or None,
                            }
                        )
                        
                        # Update stock if part already existed
                        if not stock_created and quantity_in_stock > 0:
                            stock_item.quantity_in_stock = quantity_in_stock
                            stock_item.save()
                        
                        if created:
                            imported_count += 1
                        else:
                            skipped_count += 1
                            
                except Exception as e:
                    errors.append(f"Row {row_num}: {str(e)}")
                    skipped_count += 1
            
            # Log import to audit log
            log_audit(
                user=request.user,
                action='import',
                model_name='Part',
                object_repr=f'CSV Import: {filename}',
                changes={
                    'imported': imported_count,
                    'skipped': skipped_count,
                    'total_errors': len(errors),
                    'filename': filename,
                },
                request=request
            )
            
            return Response({
                'imported': imported_count,
                'skipped': skipped_count,
                'errors': errors[:50]  # Limit errors to 50
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            # Log failed import
            log_audit(
                user=request.user,
                action='import',
                model_name='Part',
                object_repr=f'CSV Import Failed: {filename}',
                changes={
                    'error': str(e),
                    'filename': filename,
                },
                request=request
            )
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def inventory_accounting_report(self, request):
        """
        Comprehensive Inventory Accounting Report
        
        Query params:
        - date_from: Start date (YYYY-MM-DD), defaults to beginning of current month
        - date_to: End date (YYYY-MM-DD), defaults to today
        - category: Filter by category ID
        - include_inactive: Include inactive parts (default: false)
        """
        from django.db.models import ExpressionWrapper, DecimalField
        from datetime import datetime, timedelta
        
        # Date filtering
        date_from_str = request.query_params.get('date_from')
        date_to_str = request.query_params.get('date_to')
        
        if not date_from_str:
            # Default to beginning of current month
            today = timezone.now().date()
            date_from = today.replace(day=1)
        else:
            date_from = datetime.strptime(date_from_str, '%Y-%m-%d').date()
        
        if not date_to_str:
            date_to = timezone.now().date()
        else:
            date_to = datetime.strptime(date_to_str, '%Y-%m-%d').date()
        
        # Part filtering
        parts = self.queryset
        
        if request.query_params.get('include_inactive', 'false').lower() != 'true':
            parts = parts.filter(is_active=True)
        
        category_id = request.query_params.get('category')
        if category_id:
            parts = parts.filter(category_id=category_id)
        
        # Resolve branch for StockItem aggregation
        from apps.branches.utils import resolve_branch
        branch = resolve_branch(request)
        
        # Calculate inventory metrics from StockItem
        total_parts = parts.count()
        total_quantity = 0
        total_cost_value = Decimal('0.00')
        total_selling_value = Decimal('0.00')
        potential_profit = Decimal('0.00')
        
        # Aggregate from StockItem
        from .models import StockItem
        if branch:
            stock_items = StockItem.objects.filter(
                part__in=parts,
                branch=branch
            ).select_related('part')
            
            for stock_item in stock_items:
                qty = stock_item.quantity_in_stock
                total_quantity += qty
                if stock_item.part.cost_price:
                    total_cost_value += stock_item.part.cost_price * qty
                if stock_item.part.selling_price:
                    total_selling_value += stock_item.part.selling_price * qty
        else:
            # Aggregate from all branches
            stock_items = StockItem.objects.filter(
                part__in=parts
            ).values('part').annotate(total_qty=Sum('quantity_in_stock'))
            
            for item in stock_items:
                part = Part.objects.get(id=item['part'])
                qty = item['total_qty']
                total_quantity += qty
                if part.cost_price:
                    total_cost_value += part.cost_price * qty
                if part.selling_price:
                    total_selling_value += part.selling_price * qty
        
        potential_profit = total_selling_value - total_cost_value
        
        # Get COGS for the period
        transactions = InventoryTransaction.objects.filter(
            transaction_type='sale',
            transaction_date__date__gte=date_from,
            transaction_date__date__lte=date_to
        ).select_related('part')
        
        cogs = Decimal('0.00')
        units_sold = 0
        
        for txn in transactions:
            if txn.unit_cost:
                cogs += abs(txn.quantity) * txn.unit_cost
            elif txn.part and txn.part.cost_price:
                cogs += abs(txn.quantity) * txn.part.cost_price
            units_sold += abs(txn.quantity)
        
        # Calculate turnover ratio
        avg_inventory_value = total_cost_value  # Simplified - should be (beginning + ending) / 2
        inventory_turnover = (cogs / avg_inventory_value) if avg_inventory_value > 0 else Decimal('0')
        
        # Days inventory outstanding
        days_in_period = (date_to - date_from).days or 1
        dio = (avg_inventory_value / cogs * days_in_period) if cogs > 0 else Decimal('0')
        
        # Category breakdown
        by_category = []
        categories = PartCategory.objects.filter(is_active=True)
        
        for category in categories:
            category_parts = parts.filter(category=category)
            if not category_parts.exists():
                continue
            
            cat_qty = 0
            cat_cost_value = Decimal('0.00')
            cat_sell_value = Decimal('0.00')
            
            if branch:
                category_stock = StockItem.objects.filter(
                    part__category=category,
                    part__in=category_parts,
                    branch=branch
                )
                for stock_item in category_stock:
                    qty = stock_item.quantity_in_stock
                    cat_qty += qty
                    if stock_item.part.cost_price:
                        cat_cost_value += stock_item.part.cost_price * qty
                    if stock_item.part.selling_price:
                        cat_sell_value += stock_item.part.selling_price * qty
            else:
                category_stock = StockItem.objects.filter(
                    part__category=category,
                    part__in=category_parts
                ).values('part').annotate(total_qty=Sum('quantity_in_stock'))
                
                for item in category_stock:
                    part = Part.objects.get(id=item['part'])
                    qty = item['total_qty']
                    cat_qty += qty
                if part.cost_price:
                        cat_cost_value += part.cost_price * qty
                if part.selling_price:
                        cat_sell_value += part.selling_price * qty
            
            by_category.append({
                'category_id': category.id,
                'category_name': category.name,
                'parts_count': category_parts.count(),
                'total_quantity': cat_qty,
                'cost_value': float(cat_cost_value),
                'selling_value': float(cat_sell_value),
                'potential_profit': float(cat_sell_value - cat_cost_value),
                'margin_percent': float((cat_sell_value - cat_cost_value) / cat_sell_value * 100) if cat_sell_value > 0 else 0
            })
        
        # Stock aging analysis
        aging_categories = {
            '0-90_days': {'count': 0, 'value': Decimal('0')},
            '91-180_days': {'count': 0, 'value': Decimal('0')},
            '181-365_days': {'count': 0, 'value': Decimal('0')},
            'over_365_days': {'count': 0, 'value': Decimal('0')},
        }
        
        today = timezone.now().date()
        # Use StockItem for aging analysis
        if branch:
            stock_items = StockItem.objects.filter(
                part__in=parts,
                branch=branch
            ).select_related('part')
            
            for stock_item in stock_items:
                part = stock_item.part
            if part.last_sold_date:
                days_since_sale = (today - part.last_sold_date).days
            elif part.created_at:
                days_since_sale = (today - part.created_at.date()).days
            else:
                days_since_sale = 0
            
                # Calculate value from StockItem
                qty = stock_item.quantity_in_stock
                part_value = part.cost_price * qty if part.cost_price else Decimal('0')
                
                if days_since_sale <= 90:
                    aging_categories['0-90_days']['count'] += 1
                    aging_categories['0-90_days']['value'] += part_value
                elif days_since_sale <= 180:
                    aging_categories['91-180_days']['count'] += 1
                    aging_categories['91-180_days']['value'] += part_value
                elif days_since_sale <= 365:
                    aging_categories['181-365_days']['count'] += 1
                    aging_categories['181-365_days']['value'] += part_value
                else:
                    aging_categories['over_365_days']['count'] += 1
                    aging_categories['over_365_days']['value'] += part_value
        else:
            # Aggregate from all branches
            stock_items = StockItem.objects.filter(
                part__in=parts
            ).values('part').annotate(total_qty=Sum('quantity_in_stock'))
            
            for item in stock_items:
                part = Part.objects.get(id=item['part'])
                qty = item['total_qty']
                
                if part.last_sold_date:
                    days_since_sale = (today - part.last_sold_date).days
                elif part.created_at:
                    days_since_sale = (today - part.created_at.date()).days
                else:
                    days_since_sale = 0
                
                part_value = part.cost_price * qty if part.cost_price else Decimal('0')
            
            if days_since_sale <= 90:
                aging_categories['0-90_days']['count'] += 1
                aging_categories['0-90_days']['value'] += part_value
            elif days_since_sale <= 180:
                aging_categories['91-180_days']['count'] += 1
                aging_categories['91-180_days']['value'] += part_value
            elif days_since_sale <= 365:
                aging_categories['181-365_days']['count'] += 1
                aging_categories['181-365_days']['value'] += part_value
            else:
                aging_categories['over_365_days']['count'] += 1
                aging_categories['over_365_days']['value'] += part_value
        
        return Response({
            'period': {
                'date_from': str(date_from),
                'date_to': str(date_to),
                'days': days_in_period
            },
            'inventory_summary': {
                'total_parts': total_parts,
                'total_quantity': total_quantity,
                'total_cost_value': float(total_cost_value),
                'total_selling_value': float(total_selling_value),
                'potential_profit': float(potential_profit),
                'potential_margin_percent': float(potential_profit / total_selling_value * 100) if total_selling_value > 0 else 0
            },
            'cogs_analysis': {
                'cogs': float(cogs),
                'units_sold': units_sold,
                'avg_cost_per_unit': float(cogs / units_sold) if units_sold > 0 else 0,
                'inventory_turnover_ratio': float(inventory_turnover),
                'days_inventory_outstanding': float(dio)
            },
            'by_category': sorted(by_category, key=lambda x: x['cost_value'], reverse=True),
            'stock_aging': [
                {
                    'age_range': '0-90 days',
                    'parts_count': aging_categories['0-90_days']['count'],
                    'value': float(aging_categories['0-90_days']['value'])
                },
                {
                    'age_range': '91-180 days',
                    'parts_count': aging_categories['91-180_days']['count'],
                    'value': float(aging_categories['91-180_days']['value'])
                },
                {
                    'age_range': '181-365 days',
                    'parts_count': aging_categories['181-365_days']['count'],
                    'value': float(aging_categories['181-365_days']['value'])
                },
                {
                    'age_range': 'Over 365 days',
                    'parts_count': aging_categories['over_365_days']['count'],
                    'value': float(aging_categories['over_365_days']['value'])
                }
            ]
        })

    @action(detail=False, methods=['get'])
    def stock_movement_report(self, request):
        """
        Stock movement report - shows in/out movements by date range
        """
        from datetime import datetime, timedelta
        from apps.branches.utils import resolve_branch
        
        # Get date range from query params
        date_from_str = request.query_params.get('date_from')
        date_to_str = request.query_params.get('date_to')
        
        if date_from_str:
            try:
                date_from = datetime.strptime(date_from_str, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'error': 'Invalid date_from format. Use YYYY-MM-DD'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            date_from = date.today() - timedelta(days=30)  # Default: last 30 days
        
        if date_to_str:
            try:
                date_to = datetime.strptime(date_to_str, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'error': 'Invalid date_to format. Use YYYY-MM-DD'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            date_to = date.today()
        
        branch = resolve_branch(request)
        
        # Get transactions in date range
        transactions = InventoryTransaction.objects.filter(
            created_at__date__gte=date_from,
            created_at__date__lte=date_to
        ).select_related('part', 'part__category', 'created_by', 'branch')
        
        if branch:
            transactions = transactions.filter(branch=branch)
        
        # Aggregate by transaction type
        movement_summary = {}
        part_movements = {}
        
        for trans in transactions:
            trans_type = trans.transaction_type
            part_id = trans.part.id
            
            # Initialize summary
            if trans_type not in movement_summary:
                movement_summary[trans_type] = {
                    'count': 0,
                    'total_quantity': 0,
                    'total_value': Decimal('0.00')
                }
            
            movement_summary[trans_type]['count'] += 1
            movement_summary[trans_type]['total_quantity'] += abs(trans.quantity)
            if trans.total_cost:
                movement_summary[trans_type]['total_value'] += trans.total_cost
            
            # Track per-part movements
            if part_id not in part_movements:
                part_movements[part_id] = {
                    'part_id': part_id,
                    'part_number': trans.part.part_number,
                    'part_name': trans.part.name,
                    'category': trans.part.category.name if trans.part.category else '',
                    'in': 0,
                    'out': 0,
                    'net': 0,
                    'transactions': []
                }
            
            if trans.quantity > 0:
                part_movements[part_id]['in'] += trans.quantity
            else:
                part_movements[part_id]['out'] += abs(trans.quantity)
            
            part_movements[part_id]['net'] = part_movements[part_id]['in'] - part_movements[part_id]['out']
            part_movements[part_id]['transactions'].append({
                'date': trans.created_at.date().isoformat(),
                'type': trans_type,
                'quantity': trans.quantity,
                'reason': trans.reason
            })
        
        # Convert to list and sort by net movement
        part_movements_list = list(part_movements.values())
        part_movements_list.sort(key=lambda x: abs(x['net']), reverse=True)
        
        return Response({
            'period': {
                'date_from': date_from.isoformat(),
                'date_to': date_to.isoformat(),
                'days': (date_to - date_from).days + 1
            },
            'branch': branch.name if branch else 'All Branches',
            'summary_by_type': movement_summary,
            'part_movements': part_movements_list[:100],  # Top 100 by movement
            'total_parts': len(part_movements)
        })

    @action(detail=False, methods=['get'])
    def turnover_report(self, request):
        """
        Stock turnover analysis - shows how quickly inventory is being sold/used
        """
        from datetime import datetime, timedelta
        from apps.branches.utils import resolve_branch
        
        # Get date range (default: last 90 days)
        days = int(request.query_params.get('days', 90))
        date_from = date.today() - timedelta(days=days)
        date_to = date.today()
        
        branch = resolve_branch(request)
        
        # Get current stock levels
        if branch:
            stock_items = StockItem.objects.filter(
                branch=branch
            ).select_related('part', 'part__category')
        else:
            # Aggregate across all branches
            stock_items = StockItem.objects.select_related(
                'part', 'part__category'
            ).values('part').annotate(
                total_qty=Sum('quantity_in_stock')
            )
        
        # Get sales/usage transactions in period
        sales_transactions = InventoryTransaction.objects.filter(
            transaction_type__in=['sale', 'usage'],
            created_at__date__gte=date_from,
            created_at__date__lte=date_to
        ).select_related('part', 'branch')
        
        if branch:
            sales_transactions = sales_transactions.filter(branch=branch)
        
        # Aggregate sales by part
        sales_by_part = {}
        for trans in sales_transactions:
            part_id = trans.part.id
            if part_id not in sales_by_part:
                sales_by_part[part_id] = {
                    'part_id': part_id,
                    'quantity_sold': 0,
                    'total_cost': Decimal('0.00')
                }
            sales_by_part[part_id]['quantity_sold'] += abs(trans.quantity)
            if trans.total_cost:
                sales_by_part[part_id]['total_cost'] += trans.total_cost
        
        # Calculate turnover for each part
        turnover_data = []
        
        if branch:
            for stock_item in stock_items:
                part = stock_item.part
                current_stock = stock_item.quantity_in_stock
                sales = sales_by_part.get(part.id, {'quantity_sold': 0, 'total_cost': Decimal('0.00')})
                
                avg_stock = current_stock  # Simplified - could use average over period
                turnover_ratio = sales['quantity_sold'] / avg_stock if avg_stock > 0 else 0
                days_to_sell = avg_stock / (sales['quantity_sold'] / days) if sales['quantity_sold'] > 0 else float('inf')
                
                turnover_data.append({
                    'part_id': part.id,
                    'part_number': part.part_number,
                    'part_name': part.name,
                    'category': part.category.name if part.category else '',
                    'current_stock': current_stock,
                    'quantity_sold': sales['quantity_sold'],
                    'avg_stock': avg_stock,
                    'turnover_ratio': float(turnover_ratio),
                    'days_to_sell': float(days_to_sell) if days_to_sell != float('inf') else None,
                    'cost_of_goods_sold': float(sales['total_cost'])
                })
        else:
            # Handle aggregated case
            for item in stock_items:
                part = Part.objects.get(id=item['part'])
                current_stock = item['total_qty']
                sales = sales_by_part.get(part.id, {'quantity_sold': 0, 'total_cost': Decimal('0.00')})
                
                avg_stock = current_stock
                turnover_ratio = sales['quantity_sold'] / avg_stock if avg_stock > 0 else 0
                days_to_sell = avg_stock / (sales['quantity_sold'] / days) if sales['quantity_sold'] > 0 else float('inf')
                
                turnover_data.append({
                    'part_id': part.id,
                    'part_number': part.part_number,
                    'part_name': part.name,
                    'category': part.category.name if part.category else '',
                    'current_stock': current_stock,
                    'quantity_sold': sales['quantity_sold'],
                    'avg_stock': avg_stock,
                    'turnover_ratio': float(turnover_ratio),
                    'days_to_sell': float(days_to_sell) if days_to_sell != float('inf') else None,
                    'cost_of_goods_sold': float(sales['total_cost'])
                })
        
        # Sort by turnover ratio (descending)
        turnover_data.sort(key=lambda x: x['turnover_ratio'], reverse=True)
        
        # Categorize: Fast-moving (high turnover), Slow-moving (low turnover), Non-moving (no sales)
        fast_moving = [x for x in turnover_data if x['turnover_ratio'] >= 2.0]
        slow_moving = [x for x in turnover_data if 0 < x['turnover_ratio'] < 2.0]
        non_moving = [x for x in turnover_data if x['turnover_ratio'] == 0]
        
        return Response({
            'period': {
                'date_from': date_from.isoformat(),
                'date_to': date_to.isoformat(),
                'days': days
            },
            'branch': branch.name if branch else 'All Branches',
            'summary': {
                'total_parts': len(turnover_data),
                'fast_moving': len(fast_moving),
                'slow_moving': len(slow_moving),
                'non_moving': len(non_moving)
            },
            'turnover_data': turnover_data,
            'fast_moving': fast_moving[:50],
            'slow_moving': slow_moving[:50],
            'non_moving': non_moving[:50]
        })

    @action(detail=False, methods=['get'])
    def abc_analysis(self, request):
        """
        ABC Analysis - categorizes inventory by value (A=high, B=medium, C=low)
        """
        from apps.branches.utils import resolve_branch
        
        branch = resolve_branch(request)
        
        # Get stock items with values
        if branch:
            stock_items = StockItem.objects.filter(
                branch=branch
            ).select_related('part', 'part__category')
        else:
            stock_items = StockItem.objects.select_related(
                'part', 'part__category'
            ).values('part').annotate(
                total_qty=Sum('quantity_in_stock')
            )
        
        # Calculate value for each part
        parts_data = []
        total_value = Decimal('0.00')
        
        if branch:
            for stock_item in stock_items:
                part = stock_item.part
                qty = stock_item.quantity_in_stock
                if part.cost_price:
                    value = part.cost_price * qty
                    parts_data.append({
                        'part_id': part.id,
                        'part_number': part.part_number,
                        'part_name': part.name,
                        'category': part.category.name if part.category else '',
                        'quantity': qty,
                        'unit_cost': float(part.cost_price),
                        'total_value': float(value)
                    })
                    total_value += value
        else:
            for item in stock_items:
                part = Part.objects.get(id=item['part'])
                qty = item['total_qty']
                if part.cost_price:
                    value = part.cost_price * qty
                    parts_data.append({
                        'part_id': part.id,
                        'part_number': part.part_number,
                        'part_name': part.name,
                        'category': part.category.name if part.category else '',
                        'quantity': qty,
                        'unit_cost': float(part.cost_price),
                        'total_value': float(value)
                    })
                    total_value += value
        
        # Sort by value (descending)
        parts_data.sort(key=lambda x: x['total_value'], reverse=True)
        
        # Calculate cumulative percentages and assign ABC categories
        cumulative_value = Decimal('0.00')
        category_a = []
        category_b = []
        category_c = []
        
        for part_data in parts_data:
            cumulative_value += Decimal(str(part_data['total_value']))
            cumulative_percent = (cumulative_value / total_value * 100) if total_value > 0 else 0
            
            part_data['cumulative_value'] = float(cumulative_value)
            part_data['cumulative_percent'] = float(cumulative_percent)
            
            if cumulative_percent <= 80:
                part_data['abc_category'] = 'A'
                category_a.append(part_data)
            elif cumulative_percent <= 95:
                part_data['abc_category'] = 'B'
                category_b.append(part_data)
            else:
                part_data['abc_category'] = 'C'
                category_c.append(part_data)
        
        # Calculate summary
        a_value = sum(x['total_value'] for x in category_a)
        b_value = sum(x['total_value'] for x in category_b)
        c_value = sum(x['total_value'] for x in category_c)
        
        return Response({
            'branch': branch.name if branch else 'All Branches',
            'total_value': float(total_value),
            'summary': {
                'category_a': {
                    'count': len(category_a),
                    'value': float(a_value),
                    'percent_of_total': float(a_value / total_value * 100) if total_value > 0 else 0
                },
                'category_b': {
                    'count': len(category_b),
                    'value': float(b_value),
                    'percent_of_total': float(b_value / total_value * 100) if total_value > 0 else 0
                },
                'category_c': {
                    'count': len(category_c),
                    'value': float(c_value),
                    'percent_of_total': float(c_value / total_value * 100) if total_value > 0 else 0
                }
            },
            'category_a': category_a,
            'category_b': category_b,
            'category_c': category_c,
            'all_parts': parts_data
        })

    @action(detail=False, methods=['get'])
    def multi_location_stock(self, request):
        """
        Multi-location stock view - shows stock levels across all branches for parts
        """
        from apps.branches.utils import get_user_accessible_branches
        
        part_id = request.query_params.get('part_id')
        category_id = request.query_params.get('category_id')
        search = request.query_params.get('search', '')
        
        user = request.user
        accessible_branches = get_user_accessible_branches(user)
        
        # Get stock items
        stock_items = StockItem.objects.filter(
            branch__in=accessible_branches
        ).select_related('part', 'part__category', 'branch')
        
        # Filter by part if specified
        if part_id:
            try:
                part = Part.objects.get(id=part_id)
                stock_items = stock_items.filter(part=part)
            except Part.DoesNotExist:
                return Response(
                    {'error': 'Part not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
        
        # Filter by category if specified
        if category_id:
            stock_items = stock_items.filter(part__category_id=category_id)
        
        # Filter by search term
        if search:
            stock_items = stock_items.filter(
                Q(part__name__icontains=search) |
                Q(part__part_number__icontains=search)
            )
        
        # Group by part
        parts_data = {}
        
        for stock_item in stock_items:
            part = stock_item.part
            branch = stock_item.branch
            
            if part.id not in parts_data:
                parts_data[part.id] = {
                    'part_id': part.id,
                    'part_number': part.part_number,
                    'part_name': part.name,
                    'category': part.category.name if part.category else '',
                    'unit': part.get_unit_display(),
                    'cost_price': float(part.cost_price) if part.cost_price else 0,
                    'selling_price': float(part.selling_price) if part.selling_price else 0,
                    'locations': [],
                    'total_quantity': 0,
                    'total_value': Decimal('0.00'),
                    'total_reserved': 0,
                    'total_on_order': 0
                }
            
            # Add location data
            location_data = {
                'branch_id': branch.id,
                'branch_name': branch.name,
                'quantity_in_stock': stock_item.quantity_in_stock,
                'quantity_reserved': stock_item.quantity_reserved,
                'quantity_on_order': stock_item.quantity_on_order,
                'available_quantity': stock_item.quantity_in_stock - stock_item.quantity_reserved,
                'reorder_point': stock_item.reorder_point,
                'minimum_stock': stock_item.minimum_stock or 0,
                'is_low_stock': stock_item.quantity_in_stock <= stock_item.reorder_point,
                'is_out_of_stock': stock_item.quantity_in_stock == 0,
                'value': float(stock_item.part.cost_price * stock_item.quantity_in_stock) if stock_item.part.cost_price else 0
            }
            
            parts_data[part.id]['locations'].append(location_data)
            parts_data[part.id]['total_quantity'] += stock_item.quantity_in_stock
            parts_data[part.id]['total_reserved'] += stock_item.quantity_reserved
            parts_data[part.id]['total_on_order'] += stock_item.quantity_on_order
            if part.cost_price:
                parts_data[part.id]['total_value'] += part.cost_price * stock_item.quantity_in_stock
        
        # Convert to list and sort
        parts_list = list(parts_data.values())
        
        # Sort by total quantity (descending) or by part name
        sort_by = request.query_params.get('sort_by', 'total_quantity')
        if sort_by == 'name':
            parts_list.sort(key=lambda x: x['part_name'])
        elif sort_by == 'total_value':
            parts_list.sort(key=lambda x: x['total_value'], reverse=True)
        else:
            parts_list.sort(key=lambda x: x['total_quantity'], reverse=True)
        
        # Calculate summary statistics
        total_parts = len(parts_list)
        total_locations = sum(len(p['locations']) for p in parts_list)
        total_quantity_all = sum(p['total_quantity'] for p in parts_list)
        total_value_all = sum(Decimal(str(p['total_value'])) for p in parts_list)
        
        # Count parts with stock issues
        low_stock_count = sum(1 for p in parts_list if any(loc['is_low_stock'] for loc in p['locations']))
        out_of_stock_count = sum(1 for p in parts_list if any(loc['is_out_of_stock'] for loc in p['locations']))
        
        return Response({
            'summary': {
                'total_parts': total_parts,
                'total_locations': total_locations,
                'total_quantity': total_quantity_all,
                'total_value': float(total_value_all),
                'low_stock_parts': low_stock_count,
                'out_of_stock_parts': out_of_stock_count,
                'accessible_branches': [{'id': b.id, 'name': b.name} for b in accessible_branches]
            },
            'parts': parts_list,
            'filters': {
                'part_id': part_id,
                'category_id': category_id,
                'search': search,
                'sort_by': sort_by
            }
        })

    @action(detail=True, methods=['get'])
    def stock_by_location(self, request, pk=None):
        """
        Get stock levels for a specific part across all accessible branches
        """
        from apps.branches.utils import get_user_accessible_branches
        
        part = self.get_object()
        user = request.user
        accessible_branches = get_user_accessible_branches(user)
        
        # Get stock items for this part across all accessible branches
        stock_items = StockItem.objects.filter(
            part=part,
            branch__in=accessible_branches
        ).select_related('branch')
        
        locations = []
        total_quantity = 0
        total_reserved = 0
        total_on_order = 0
        total_value = Decimal('0.00')
        
        for stock_item in stock_items:
            location_data = {
                'branch_id': stock_item.branch.id,
                'branch_name': stock_item.branch.name,
                'quantity_in_stock': stock_item.quantity_in_stock,
                'quantity_reserved': stock_item.quantity_reserved,
                'quantity_on_order': stock_item.quantity_on_order,
                'available_quantity': stock_item.quantity_in_stock - stock_item.quantity_reserved,
                'reorder_point': stock_item.reorder_point,
                'minimum_stock': stock_item.minimum_stock or 0,
                'reorder_quantity': stock_item.reorder_quantity,
                'is_low_stock': stock_item.quantity_in_stock <= stock_item.reorder_point,
                'is_out_of_stock': stock_item.quantity_in_stock == 0,
                'value': float(part.cost_price * stock_item.quantity_in_stock) if part.cost_price else 0
            }
            
            locations.append(location_data)
            total_quantity += stock_item.quantity_in_stock
            total_reserved += stock_item.quantity_reserved
            total_on_order += stock_item.quantity_on_order
            if part.cost_price:
                total_value += part.cost_price * stock_item.quantity_in_stock
        
        # Sort by quantity (descending)
        locations.sort(key=lambda x: x['quantity_in_stock'], reverse=True)
        
        return Response({
            'part': {
                'id': part.id,
                'part_number': part.part_number,
                'name': part.name,
                'category': part.category.name if part.category else '',
                'unit': part.get_unit_display(),
                'cost_price': float(part.cost_price) if part.cost_price else 0,
                'selling_price': float(part.selling_price) if part.selling_price else 0
            },
            'summary': {
                'total_quantity': total_quantity,
                'total_reserved': total_reserved,
                'total_on_order': total_on_order,
                'total_available': total_quantity - total_reserved,
                'total_value': float(total_value),
                'locations_count': len(locations)
            },
            'locations': locations
        })


class ServicePackageViewSet(viewsets.ModelViewSet):
    """
    ViewSet for service packages (Job Kits)
    """
    queryset = ServicePackage.objects.select_related('category').prefetch_related('parts', 'parts__part')
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('view_inventory')]
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), HasPermission('manage_inventory')]
        return [IsAuthenticated()]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ServicePackageCreateSerializer
        return ServicePackageSerializer



class PurchaseOrderViewSet(viewsets.ModelViewSet):
    """
    ViewSet for purchase orders with workflow management
    """
    queryset = PurchaseOrder.objects.select_related(
        'supplier', 'created_by', 'submitted_by', 'received_by'
    ).prefetch_related('items__part')
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), HasPermission('view_inventory')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('create_purchase_orders')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('edit_purchase_orders')]
        return [IsAuthenticated()]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'supplier', 'order_date']
    search_fields = ['po_number', 'supplier__name', 'notes']
    ordering_fields = ['po_number', 'order_date', 'expected_delivery_date', 'total', 'created_at']
    ordering = ['-created_at']

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """
        Get statistics for purchase order dashboard.
        """
        queryset = self.get_queryset()
        total_orders = queryset.count()
        pending_orders = queryset.filter(status__in=['draft', 'pending_approval', 'approved']).count()
        time_now = timezone.now().date()
        overdue_orders = queryset.filter(
            status__in=['draft', 'pending_approval', 'approved'], 
            expected_delivery_date__lt=time_now
        ).count()
        completed_orders = queryset.filter(status='received').count()
        
        return Response({
            'total_orders': total_orders,
            'pending_orders': pending_orders,
            'overdue_orders': overdue_orders,
            'completed_orders': completed_orders
        })

    def get_queryset(self):
        queryset = super().get_queryset()
        return filter_queryset_for_user_branches(queryset, self.request.user, self.request)

    def get_serializer_class(self):
        if self.action == 'create':
            return PurchaseOrderCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return PurchaseOrderUpdateSerializer
        elif self.action == 'retrieve':
            return PurchaseOrderDetailSerializer
        return PurchaseOrderListSerializer

    @action(detail=True, methods=['post'], url_path='submit-for-approval')
    def submit_for_approval(self, request, pk=None):
        """Submit purchase order for approval"""
        po = self.get_object()
        
        if po.status != 'draft':
            return Response(
                {'error': 'Only draft purchase orders can be submitted for approval'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        if not po.items.exists():
             return Response(
                 {'error': 'Cannot submit purchase order with no items'},
                 status=status.HTTP_400_BAD_REQUEST
             )
             
        # Check for invalid quantities (0 or less)
        invalid_items = po.items.filter(quantity__lte=0)
        if invalid_items.exists():
             return Response(
                 {'error': f'Cannot submit PO with invalid quantity items ({invalid_items.count()} items with 0 qty)'},
                 status=status.HTTP_400_BAD_REQUEST
             )
        
        # Handle approver assignment
        approver_id = request.data.get('approver_id')
        if approver_id:
            from apps.accounts.models import User
            try:
                approver = User.objects.get(id=approver_id)
                po.assigned_approver = approver
            except User.DoesNotExist:
                return Response(
                    {'error': 'Selected approver not found'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        po.status = 'pending_approval'
        po.submitted_by = request.user
        po.submitted_at = timezone.now()
        po.save()

        # Send notification to assigned approver
        if po.assigned_approver:
            try:
                from apps.notifications_app.services import NotificationHelper, NotificationService
                notification = NotificationHelper.purchase_order_approval_request(po, po.assigned_approver)
                NotificationService().send_notification(notification)
            except Exception as e:
                # specific validation error logging could go here
                pass

        return Response({'status': 'Purchase order submitted for approval'})
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve purchase order (allows sending to supplier)"""
        po = self.get_object()
        
        if po.status != 'pending_approval':
            return Response(
                {'error': 'Only purchase orders pending approval can be approved'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        po.status = 'approved'
        po.approved_by = request.user
        po.approved_at = timezone.now()
        po.save()
        
        return Response({'status': 'Purchase order approved'})

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirm purchase order (after phone confirmation with supplier)"""
        po = self.get_object()
        
        if po.status != 'approved':
            return Response(
                {'error': 'Only approved purchase orders can be confirmed (after supplier acknowledgment)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        po.status = 'confirmed'
        po.save()
        
        return Response({'status': 'Purchase order confirmed with supplier'})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel purchase order"""
        po = self.get_object()
        
        if po.status in ['received', 'partially_received']:
            return Response(
                {'error': 'Cannot cancel purchase order that has been received'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        po.status = 'cancelled'
        po.save()
        
        # Clear quantity_on_order for all items (using StockItem, not deprecated part.quantity_on_order)
        from .models import StockItem
        from django.db.models import Sum, F
        branch = po.branch
        if branch:
            for item in po.items.all():
                # Recalculate total on order for this part at this branch (excluding this cancelled PO)
                total_on_order = PurchaseOrderItem.objects.filter(
                    part=item.part,
                    purchase_order__status__in=['pending_approval', 'approved', 'confirmed'],
                    purchase_order__branch=branch
                ).exclude(
                    purchase_order=po
                ).aggregate(
                    total=Sum(F('quantity') - F('quantity_received'))
                )['total'] or 0
                
                stock_item, _ = StockItem.objects.get_or_create(
                    part=item.part,
                    branch=branch,
                    defaults={
                        'reorder_point': item.part.reorder_point,
                        'reorder_quantity': item.part.reorder_quantity,
                        'minimum_stock': item.part.minimum_stock,
                    }
                )
                stock_item.quantity_on_order = max(0, total_on_order)
                stock_item.save()
        
        return Response({'status': 'Purchase order cancelled'})

    @action(detail=True, methods=['post'])
    def add_item(self, request, pk=None):
        """Add item to purchase order"""
        po = self.get_object()
        
        if po.status not in ['draft']:
            return Response(
                {'error': 'Can only add items to draft purchase orders'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = PurchaseOrderItemCreateSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(purchase_order=po)
            # Invalidate prefetch cache to ensure new item is included in totals
            if hasattr(po, '_prefetched_objects_cache'):
                po._prefetched_objects_cache = {}
            po.calculate_totals()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='update_item')
    def update_item(self, request, pk=None):
        """Update an existing item in the purchase order"""
        po = self.get_object()
        
        if po.status not in ['draft']:
            return Response(
                {'error': 'Can only update items in draft purchase orders'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        item_id = request.data.get('item_id')
        if not item_id:
            return Response(
                {'error': 'item_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            item = po.items.get(id=item_id)
        except PurchaseOrderItem.DoesNotExist:
            return Response(
                {'error': 'Item not found in this purchase order'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Update quantity if provided
        if 'quantity' in request.data:
            quantity = request.data['quantity']
            if quantity <= 0:
                return Response(
                    {'error': 'Quantity must be greater than 0'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            item.quantity = quantity
        
        # Update unit_cost if provided
        if 'unit_cost' in request.data:
            item.unit_cost = request.data['unit_cost']
        
        # Update notes if provided
        if 'notes' in request.data:
            item.notes = request.data['notes']
        
        item.save()  # This will trigger calculate_totals via the model save method
        
        serializer = PurchaseOrderItemSerializer(item)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='remove_item')
    def remove_item(self, request, pk=None):
        """Remove an item from the purchase order"""
        po = self.get_object()
        
        if po.status not in ['draft']:
            return Response(
                {'error': 'Can only remove items from draft purchase orders'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        item_id = request.data.get('item_id')
        if not item_id:
            return Response(
                {'error': 'item_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            item = po.items.get(id=item_id)
            item.delete()  # This will trigger calculate_totals via the signal or save method
            po.calculate_totals()
            return Response({'status': 'Item removed successfully'})
        except PurchaseOrderItem.DoesNotExist:
            return Response(
                {'error': 'Item not found in this purchase order'},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=False, methods=['get'])
    def pending(self, request):
        """Get all pending purchase orders (pending approval, approved, or confirmed)"""
        orders = self.queryset.filter(status__in=['pending_approval', 'approved', 'confirmed'])
        page = self.paginate_queryset(orders)
        if page is not None:
            serializer = PurchaseOrderListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = PurchaseOrderListSerializer(orders, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """Get overdue purchase orders"""
        today = date.today()
        orders = self.queryset.filter(
            status__in=['pending_approval', 'approved', 'confirmed'],
            expected_delivery_date__lt=today
        )
        serializer = PurchaseOrderListSerializer(orders, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Generate PDF for purchase order"""
        from apps.core.services.print_service import generate_purchase_order_pdf
        
        po = self.get_object()
        return generate_purchase_order_pdf(po)


class PurchaseOrderItemViewSet(viewsets.ModelViewSet):
    """
    ViewSet for purchase order items
    """
    queryset = PurchaseOrderItem.objects.select_related('purchase_order', 'part')
    serializer_class = PurchaseOrderItemSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['purchase_order', 'part']
    ordering = ['id']

    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        """Receive quantity for this item"""
        item = self.get_object()
        serializer = ReceiveItemSerializer(data=request.data)
        
        if serializer.is_valid():
            quantity_received = serializer.validated_data['quantity_received']
            notes = serializer.validated_data.get('notes', '')
            
            # Validate quantity is greater than 0
            if quantity_received <= 0:
                return Response(
                    {'error': 'Received quantity must be greater than 0'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check PO status allows receiving
            po = item.purchase_order
            if po.status not in ['confirmed', 'partially_received']:
                return Response(
                    {'error': f'Cannot receive items for PO in {po.get_status_display()} status. PO must be confirmed first.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if quantity_received > item.remaining_quantity:
                return Response(
                    {'error': f'Cannot receive more than ordered. Remaining: {item.remaining_quantity}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Get branch from purchase order
            po = item.purchase_order
            branch = po.branch
            if not branch:
                # Fallback to resolving branch from request
                from apps.branches.utils import resolve_branch
                branch = resolve_branch(request)
                if not branch:
                    return Response(
                        {'error': 'Branch is required for receiving inventory. Please set branch on purchase order or select active branch.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Update item
            item.quantity_received += quantity_received
            if not item.received_date and item.is_fully_received:
                item.received_date = date.today()
            if notes:
                item.notes = f"{item.notes}\n{notes}" if item.notes else notes
            item.save()
            
            # Use InventoryService to record transaction and update StockItem
            InventoryService.record_transaction(
                part=item.part,
                quantity=quantity_received,
                transaction_type='purchase',
                user=request.user,
                purchase_order=po,
                branch=branch,
                unit_cost=item.unit_cost,
                reason=f"Received from PO {po.po_number}",
                notes=notes
            )
            
            # Update StockItem quantity_on_order
            from .models import StockItem
            stock_item, _ = StockItem.objects.get_or_create(
                part=item.part,
                branch=branch,
                defaults={
                    'quantity_on_order': 0,
                    'reorder_point': item.part.reorder_point,
                    'reorder_quantity': item.part.reorder_quantity,
                    'minimum_stock': item.part.minimum_stock,
                }
            )
            # Recalculate total on order for this part at this branch
            from django.db.models import Sum, F
            total_on_order = PurchaseOrderItem.objects.filter(
                part=item.part,
                purchase_order__status__in=['pending_approval', 'approved', 'confirmed'],
                purchase_order__branch=branch
            ).aggregate(
                total=Sum(F('quantity') - F('quantity_received'))
            )['total'] or 0
            stock_item.quantity_on_order = max(0, total_on_order)
            stock_item.save()
            
            # Update purchase order status
            if po.is_fully_received:
                po.status = 'received'
                po.received_date = date.today()
                po.received_by = request.user
            elif po.is_partially_received:
                po.status = 'partially_received'
            po.save()
            
            return Response({
                'status': 'Items received successfully',
                'quantity_received': quantity_received,
                'total_received': item.quantity_received,
                'remaining': item.remaining_quantity,
                'is_fully_received': item.is_fully_received
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class InventoryTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing inventory transactions (read-only)
    """
    queryset = InventoryTransaction.objects.select_related(
        'part', 'purchase_order', 'work_order', 'created_by'
    )
    serializer_class = InventoryTransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        return [IsAuthenticated(), HasPermission('view_inventory')]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['part', 'transaction_type', 'purchase_order', 'work_order']
    ordering_fields = ['transaction_date', 'created_at']
    ordering = ['-transaction_date']

    @action(detail=False, methods=['get'])
    def recent(self, request):
        """Get recent transactions (last 100)"""
        transactions = self.queryset.all()[:100]
        serializer = self.get_serializer(transactions, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_date_range(self, request):
        """Get transactions within date range"""
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        if not start_date or not end_date:
            return Response(
                {'error': 'start_date and end_date parameters required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        transactions = self.queryset.filter(
            transaction_date__date__gte=start_date,
            transaction_date__date__lte=end_date
        )
        
        serializer = self.get_serializer(transactions, many=True)
        return Response(serializer.data)


class StockItemViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing stock levels per branch.
    """
    queryset = StockItem.objects.all().select_related('part', 'branch')
    serializer_class = StockItemSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('view_inventory')]
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), HasPermission('manage_inventory')]
        return [IsAuthenticated()]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['branch', 'is_low_stock', 'is_out_of_stock']
    search_fields = ['part__part_number', 'part__name', 'bin_location']
    ordering_fields = ['quantity_in_stock', 'total_value']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
        # Filter by branch (handled by permission utility or manual)
        # Assuming we want users to only see stock for their accessible branches
        # Or all branches if they have permission?
        # For now, let's filter by user branches utility
        try:
             # Need to implement filtering based on StockItem.branch, not StockItem directly
             queryset = filter_queryset_for_user_branches(
            queryset, 
            user, 
            self.request,
                branch_field='branch'
        )
        except Exception:
            pass
            
        return queryset


class TransferViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing stock transfers between branches.
    """
    queryset = Transfer.objects.all().select_related(
        'source_branch', 'destination_branch', 
        'created_by', 'approved_by', 'received_by'
    ).prefetch_related('items__part')
    
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('view_inventory')]
        elif self.action in ['create', 'update', 'partial_update', 'destroy', 'approve', 'ship', 'receive', 'submit_for_approval', 'reject']:
            return [IsAuthenticated(), HasPermission('transfer_inventory')]
        return [IsAuthenticated()]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['status', 'source_branch', 'destination_branch']
    ordering = ['-created_at']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return TransferCreateSerializer
        return TransferSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
        if not user or not user.is_authenticated:
            return queryset.none()
            
        if user.role == 'admin':
            return queryset
            
        # For transfers, we want to see items where source OR destination is in our accessible branches
        from apps.branches.utils import get_user_accessible_branches, resolve_branch
        
        # If strict active branch filtering is desired:
        # active_branch = resolve_branch(self.request)
        # if active_branch:
        #     return queryset.filter(Q(source_branch=active_branch) | Q(destination_branch=active_branch))
            
        # Broader approach: any transfer involving any of my branches
        my_branches = get_user_accessible_branches(user)
        return queryset.filter(
            Q(source_branch__in=my_branches) | 
            Q(destination_branch__in=my_branches)
        ).distinct()

    def perform_create(self, serializer):
        # Use service to initiate transfer
        items = serializer.validated_data.pop('items')
        transfer = InventoryService.initiate_transfer(
            source_branch=serializer.validated_data['source_branch'],
            destination_branch=serializer.validated_data['destination_branch'],
            items=items,
            user=self.request.user,
            notes=serializer.validated_data.get('notes', '')
        )
        # Assign the created transfer to serializer.instance so it's returned
        serializer.instance = transfer

    @action(detail=True, methods=['post'], url_path='submit-for-approval')
    def submit_for_approval(self, request, pk=None):
        transfer = self.get_object()
        approver_id = request.data.get('approver_id')
        approver = None
        if approver_id:
            from apps.accounts.models import User
            try:
                approver = User.objects.get(id=approver_id)
            except User.DoesNotExist:
                return Response({'error': 'Approver not found'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            InventoryService.submit_transfer_for_approval(transfer, approver=approver, user=request.user)
            
            # Send notification to assigned approver if exists
            if transfer.assigned_approver:
                try:
                    from apps.notifications_app.services import NotificationHelper, NotificationService
                    notification = NotificationHelper.stock_transfer_approval_request(transfer, transfer.assigned_approver)
                    NotificationService().send_notification(notification)
                except Exception as e:
                    # Log but don't fail
                    logger.warning(f"Failed to send transfer approval notification: {e}")
            
            return Response({'status': 'Transfer submitted for approval'})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        transfer = self.get_object()
        try:
            InventoryService.approve_transfer(transfer, user=request.user)
            return Response({'status': 'Transfer approved'})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        transfer = self.get_object()
        reason = request.data.get('reason', '')
        try:
            InventoryService.reject_transfer(transfer, reason=reason, user=request.user)
            return Response({'status': 'Transfer rejected'})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def ship(self, request, pk=None):
        transfer = self.get_object()
        try:
            InventoryService.ship_transfer(transfer, user=request.user)
            return Response({'status': 'Transfer marked as shipped'})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        transfer = self.get_object()
        items_received = request.data.get('items', {})
        # items_received expected format: {part_id: quantity}
        # But JSON keys are strings, so we might need to parse keys to int
        
        parsed_items = {}
        for k, v in items_received.items():
            try:
                parsed_items[int(k)] = int(v)
            except:
                pass
                
        try:
            InventoryService.receive_transfer(transfer, parsed_items, user=request.user)
            return Response({'status': 'Transfer received'})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class StockAlertViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing stock alerts (low stock, out of stock, etc.)
    """
    queryset = StockAlert.objects.select_related('part', 'branch', 'stock_item', 'acknowledged_by')
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('view_inventory')]
        elif self.action in ['update', 'partial_update', 'acknowledge', 'resolve', 'dismiss']:
            return [IsAuthenticated(), HasPermission('manage_inventory')]
        return [IsAuthenticated()]
    
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['status', 'alert_type', 'severity', 'branch', 'part']
    ordering_fields = ['created_at', 'severity', 'status']
    ordering = ['-created_at', '-severity']
    
    def get_serializer_class(self):
        if self.action in ['update', 'partial_update']:
            return StockAlertUpdateSerializer
        return StockAlertSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
        if not user or not user.is_authenticated:
            return queryset.none()
        
        # Filter by accessible branches
        from apps.branches.utils import get_user_accessible_branches
        accessible_branches = get_user_accessible_branches(user)
        
        if user.role == 'admin':
            return queryset

        return queryset.filter(branch__in=accessible_branches)
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get all active alerts"""
        alerts = self.get_queryset().filter(status='active')
        serializer = self.get_serializer(alerts, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def critical(self, request):
        """Get all critical alerts"""
        alerts = self.get_queryset().filter(severity='critical', status='active')
        serializer = self.get_serializer(alerts, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get alert statistics"""
        queryset = self.get_queryset()
        
        total = queryset.count()
        active = queryset.filter(status='active').count()
        critical = queryset.filter(severity='critical', status='active').count()
        low_stock = queryset.filter(alert_type='low_stock', status='active').count()
        out_of_stock = queryset.filter(alert_type='out_of_stock', status='active').count()
        
        by_type = queryset.filter(status='active').values('alert_type').annotate(
            count=Count('id')
        )
        by_severity = queryset.filter(status='active').values('severity').annotate(
            count=Count('id')
        )
        
        return Response({
            'total': total,
            'active': active,
            'critical': critical,
            'low_stock': low_stock,
            'out_of_stock': out_of_stock,
            'by_type': {item['alert_type']: item['count'] for item in by_type},
            'by_severity': {item['severity']: item['count'] for item in by_severity}
        })
    
    @action(detail=True, methods=['post'])
    def acknowledge(self, request, pk=None):
        """Acknowledge an alert"""
        alert = self.get_object()
        alert.acknowledge(request.user)
        serializer = self.get_serializer(alert)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """Resolve an alert"""
        alert = self.get_object()
        alert.resolve()
        serializer = self.get_serializer(alert)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def dismiss(self, request, pk=None):
        """Dismiss an alert"""
        alert = self.get_object()
        alert.dismiss()
        serializer = self.get_serializer(alert)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def check_all(self, request):
        """
        Manually trigger stock alert check for all stock items
        (or specific part/branch if provided)
        """
        part_id = request.data.get('part_id')
        branch_id = request.data.get('branch_id')
        
        from apps.branches.models import Branch
        
        if part_id and branch_id:
            try:
                part = Part.objects.get(id=part_id)
                branch = Branch.objects.get(id=branch_id)
                alerts = InventoryService.check_and_create_stock_alerts(part=part, branch=branch)
            except (Part.DoesNotExist, Branch.DoesNotExist):
                return Response(
                    {'error': 'Part or branch not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            # Check all stock items (use with caution)
            alerts = InventoryService.check_and_create_stock_alerts()
        
        serializer = StockAlertSerializer(alerts, many=True)
        return Response({
            'alerts_created': len(alerts),
            'alerts': serializer.data
        })


class PhysicalCountSessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing physical inventory count sessions
    """
    queryset = PhysicalCountSession.objects.select_related(
        'branch', 'created_by', 'completed_by'
    ).prefetch_related('count_items__part', 'count_items__stock_item')
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('view_inventory')]
        elif self.action in ['create', 'update', 'partial_update', 'start', 'complete', 'cancel']:
            return [IsAuthenticated(), HasPermission('manage_inventory')]
        return [IsAuthenticated()]
    
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['status', 'branch', 'count_date']
    ordering_fields = ['created_at', 'count_date', 'status']
    ordering = ['-created_at']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return PhysicalCountSessionCreateSerializer
        return PhysicalCountSessionSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
        if not user or not user.is_authenticated:
            return queryset.none()
            
        # Filter by accessible branches
        from apps.branches.utils import get_user_accessible_branches
        accessible_branches = get_user_accessible_branches(user)
        
        if user.role == 'admin':
            return queryset
            
        return queryset.filter(branch__in=accessible_branches)

    def perform_create(self, serializer):
        """Create a new physical count session"""
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """Start a physical count session"""
        session = self.get_object()
        try:
            session.start()
            serializer = self.get_serializer(session)
            return Response(serializer.data)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Complete a physical count session"""
        session = self.get_object()
        try:
            session.complete(request.user)
            serializer = self.get_serializer(session)
            return Response(serializer.data)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a physical count session"""
        session = self.get_object()
        try:
            session.cancel()
            serializer = self.get_serializer(session)
            return Response(serializer.data)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'])
    def discrepancies(self, request, pk=None):
        """Get all items with discrepancies in this session"""
        session = self.get_object()
        items = session.count_items.filter(
            discrepancy__isnull=False
        ).exclude(discrepancy=0).select_related('part', 'stock_item')
        
        serializer = PhysicalCountItemSerializer(items, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def unreconciled(self, request, pk=None):
        """Get all unreconciled items in this session"""
        session = self.get_object()
        items = session.count_items.filter(reconciled=False).select_related('part', 'stock_item')
        
        serializer = PhysicalCountItemSerializer(items, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def add_item(self, request, pk=None):
        """Add a count item to the session"""
        session = self.get_object()
        
        if session.status not in ['draft', 'in_progress']:
            return Response(
                {'error': 'Can only add items to draft or in-progress sessions'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = PhysicalCountItemCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        part = serializer.validated_data['part']
        stock_item = serializer.validated_data['stock_item']
        
        # Validate stock_item belongs to session branch
        if stock_item.branch != session.branch:
            return Response(
                {'error': 'StockItem must belong to the session branch'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate part matches stock_item
        if stock_item.part != part:
            return Response(
                {'error': 'Part must match the StockItem part'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get system quantity
        system_quantity = stock_item.quantity_in_stock
        physical_quantity = serializer.validated_data['physical_quantity']
        
        # Create or update count item
        count_item, created = PhysicalCountItem.objects.update_or_create(
            session=session,
            part=part,
            stock_item=stock_item,
            defaults={
                'system_quantity': system_quantity,
                'physical_quantity': physical_quantity,
                'notes': serializer.validated_data.get('notes', '')
            }
        )
        
        serializer = PhysicalCountItemSerializer(count_item)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class PhysicalCountItemViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing physical count items
    """
    queryset = PhysicalCountItem.objects.select_related(
        'session', 'part', 'stock_item', 'reconciled_by'
    )
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('view_inventory')]
        elif self.action in ['update', 'partial_update', 'reconcile']:
            return [IsAuthenticated(), HasPermission('manage_inventory')]
        return [IsAuthenticated()]
    
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['session', 'part', 'reconciled']
    ordering_fields = ['discrepancy', 'created_at']
    ordering = ['-discrepancy']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return PhysicalCountItemCreateSerializer
        return PhysicalCountItemSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
        if not user or not user.is_authenticated:
            return queryset.none()
        
        # Filter by accessible branches through session
        from apps.branches.utils import get_user_accessible_branches
        accessible_branches = get_user_accessible_branches(user)
        
        if user.role == 'admin':
            return queryset
        
        return queryset.filter(session__branch__in=accessible_branches)
    
    @action(detail=True, methods=['post'])
    def reconcile(self, request, pk=None):
        """Reconcile a count item (create adjustment if needed)"""
        count_item = self.get_object()
        
        if count_item.reconciled:
            return Response(
                {'error': 'Item is already reconciled'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        create_adjustment = request.data.get('create_adjustment', True)
        
        try:
            count_item.reconcile(request.user, create_adjustment=create_adjustment)
            serializer = self.get_serializer(count_item)
            return Response(serializer.data)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def bulk_reconcile(self, request):
        """Bulk reconcile multiple count items"""
        item_ids = request.data.get('item_ids', [])
        create_adjustment = request.data.get('create_adjustment', True)
        
        if not item_ids:
            return Response(
                {'error': 'No item IDs provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        items = self.get_queryset().filter(id__in=item_ids, reconciled=False)
        
        reconciled_count = 0
        failed = []
        
        for item in items:
            try:
                item.reconcile(request.user, create_adjustment=create_adjustment)
                reconciled_count += 1
            except Exception as e:
                failed.append({
                    'item_id': item.id,
                    'error': str(e)
                })
        
        return Response({
            'reconciled': reconciled_count,
            'failed': failed,
            'total_requested': len(item_ids)
        })


class ServiceBundleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Service Bundles management
    """
    queryset = ServiceBundle.objects.prefetch_related('items', 'items__part', 'service_type').all()
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active', 'service_type']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at']

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ServiceBundleCreateUpdateSerializer
        return ServiceBundleSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), HasPermission('inventory.manage_bundles')]
        return [IsAuthenticated()]

    @action(detail=False, methods=['get'])
    def forecast(self, request):
        """
        Calculates how many of each active bundle can be fulfilled based on current branch stock.
        Usage: /api/inventory/service-bundles/forecast/?branch=<branch_id>
        """
        branch_id = request.query_params.get('branch')
        if not branch_id:
            # Try to get active branch from user's session/context if possible
            # For now, we'll require it as a query param or return error
            return Response({'error': 'Branch ID is required for forecasting.'}, status=status.HTTP_400_BAD_REQUEST)
            
        bundles = ServiceBundle.objects.filter(is_active=True).prefetch_related('items__part', 'service_type')
        
        results = []
        for bundle in bundles:
            full_bundles_possible = float('inf')
            part_breakdown = []
            
            items = bundle.items.all()
            if not items:
                full_bundles_possible = 0
            
            for item in items:
                stock_item = StockItem.objects.filter(part=item.part, branch_id=branch_id).first()
                in_stock = stock_item.quantity_in_stock if stock_item else 0
                reserved = stock_item.quantity_reserved if stock_item else 0
                available = in_stock - reserved
                
                # How many of THIS part do we have to fulfill THIS bundle?
                possible_contribution = available // item.quantity if item.quantity > 0 else 0
                full_bundles_possible = min(full_bundles_possible, possible_contribution)
                
                part_breakdown.append({
                    'part_name': item.part.name,
                    'part_number': item.part.part_number,
                    'required_qty': item.quantity,
                    'available_qty': available,
                    'potential_contribution': int(possible_contribution)
                })
            
            if full_bundles_possible == float('inf'):
                full_bundles_possible = 0
                
            results.append({
                'id': bundle.id,
                'name': bundle.name,
                'service_type': bundle.service_type.name if bundle.service_type else None,
                'bundles_available': int(full_bundles_possible),
                'part_breakdown': part_breakdown
            })
            
        return Response(results)
