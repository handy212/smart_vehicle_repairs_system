from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.db.models import Sum, Count, F, Q, Avg
from django.utils import timezone
from datetime import date
from decimal import Decimal

from .models import (
    PartCategory, Supplier, Part, PurchaseOrder, 
    PurchaseOrderItem, InventoryTransaction
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
    InventoryValueReportSerializer
)


class PartCategoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for part categories with hierarchical structure
    """
    queryset = PartCategory.objects.prefetch_related('subcategories', 'parts')
    serializer_class = PartCategorySerializer
    permission_classes = [IsAuthenticated]
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
        
        # Custom filter: low stock
        if self.request.query_params.get('low_stock') == 'true':
            queryset = queryset.filter(quantity_in_stock__lte=F('reorder_point'))
        
        # Custom filter: out of stock
        if self.request.query_params.get('out_of_stock') == 'true':
            queryset = queryset.filter(quantity_in_stock=0)
        
        # Custom filter: needs reorder
        if self.request.query_params.get('needs_reorder') == 'true':
            queryset = queryset.filter(
                quantity_in_stock__lte=F('reorder_point'),
                quantity_in_stock__gt=0
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
        parts = self.queryset.filter(quantity_in_stock__lte=F('reorder_point'))
        page = self.paginate_queryset(parts)
        if page is not None:
            serializer = PartListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = PartListSerializer(parts, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def out_of_stock(self, request):
        """Get all parts that are out of stock"""
        parts = self.queryset.filter(quantity_in_stock=0)
        page = self.paginate_queryset(parts)
        if page is not None:
            serializer = PartListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = PartListSerializer(parts, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def needs_reorder(self, request):
        """Get all parts that need to be reordered"""
        parts = self.queryset.filter(
            quantity_in_stock__lte=F('reorder_point'),
            quantity_in_stock__gt=0
        )
        page = self.paginate_queryset(parts)
        if page is not None:
            serializer = PartListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = PartListSerializer(parts, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def adjust_stock(self, request, pk=None):
        """Manually adjust stock quantity"""
        part = self.get_object()
        serializer = PartStockAdjustmentSerializer(data=request.data)
        
        if serializer.is_valid():
            quantity = serializer.validated_data['quantity']
            reason = serializer.validated_data['reason']
            notes = serializer.validated_data.get('notes', '')
            
            # Create inventory transaction
            InventoryTransaction.objects.create(
                part=part,
                transaction_type='adjustment',
                quantity=quantity,
                balance_after=part.quantity_in_stock + quantity,
                reason=reason,
                notes=notes,
                created_by=request.user
            )
            
            return Response({
                'status': 'Stock adjusted successfully',
                'new_quantity': part.quantity_in_stock,
                'adjustment': quantity
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

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
        parts = self.queryset.filter(
            is_active=True,
            quantity_in_stock__lte=F('reorder_point')
        ).select_related('category', 'preferred_supplier')
        
        report_data = []
        for part in parts:
            report_data.append({
                'part_id': part.id,
                'part_number': part.part_number,
                'part_name': part.name,
                'category_name': part.category.name if part.category else '',
                'quantity_in_stock': part.quantity_in_stock,
                'reorder_point': part.reorder_point,
                'quantity_on_order': part.quantity_on_order,
                'needs_reorder': part.needs_reorder,
                'preferred_supplier_name': part.preferred_supplier.name if part.preferred_supplier else ''
            })
        
        serializer = LowStockReportSerializer(report_data, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def inventory_value(self, request):
        """Get total inventory value and breakdown by category"""
        parts = self.queryset.filter(is_active=True)
        
        total_parts = parts.count()
        total_quantity = parts.aggregate(total=Sum('quantity_in_stock'))['total'] or 0
        
        # Calculate total value
        total_value = Decimal('0.00')
        for part in parts:
            total_value += part.total_value
        
        # Breakdown by category
        by_category = []
        categories = PartCategory.objects.filter(is_active=True)
        for category in categories:
            category_parts = parts.filter(category=category)
            category_value = Decimal('0.00')
            category_qty = 0
            
            for part in category_parts:
                category_value += part.total_value
                category_qty += part.quantity_in_stock
            
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
        
        if part.available_quantity < quantity:
            return Response(
                {'error': f'Insufficient stock. Available: {part.available_quantity}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        part.quantity_reserved += quantity
        part.save()
        
        return Response({
            'status': 'Quantity reserved',
            'reserved': quantity,
            'total_reserved': part.quantity_reserved,
            'available': part.available_quantity
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
        
        if part.quantity_reserved < quantity:
            return Response(
                {'error': f'Cannot release more than reserved. Reserved: {part.quantity_reserved}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        part.quantity_reserved -= quantity
        part.save()
        
        return Response({
            'status': 'Reservation released',
            'released': quantity,
            'total_reserved': part.quantity_reserved,
            'available': part.available_quantity
        })


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    """
    ViewSet for purchase orders with workflow management
    """
    queryset = PurchaseOrder.objects.select_related(
        'supplier', 'created_by', 'submitted_by', 'received_by'
    ).prefetch_related('items__part')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'supplier', 'order_date']
    search_fields = ['po_number', 'supplier__name', 'notes']
    ordering_fields = ['po_number', 'order_date', 'expected_delivery_date', 'total', 'created_at']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return PurchaseOrderCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return PurchaseOrderUpdateSerializer
        elif self.action == 'retrieve':
            return PurchaseOrderDetailSerializer
        return PurchaseOrderListSerializer

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit purchase order to supplier"""
        po = self.get_object()
        
        if po.status != 'draft':
            return Response(
                {'error': 'Only draft purchase orders can be submitted'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        po.status = 'submitted'
        po.submitted_by = request.user
        po.submitted_at = timezone.now()
        po.save()
        
        return Response({'status': 'Purchase order submitted'})

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirm purchase order (supplier confirmed receipt)"""
        po = self.get_object()
        
        if po.status != 'submitted':
            return Response(
                {'error': 'Only submitted purchase orders can be confirmed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        po.status = 'confirmed'
        po.save()
        
        return Response({'status': 'Purchase order confirmed'})

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
        
        # Clear quantity_on_order for all items
        for item in po.items.all():
            item.part.quantity_on_order = max(0, item.part.quantity_on_order - item.remaining_quantity)
            item.part.save()
        
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
            po.calculate_totals()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def pending(self, request):
        """Get all pending purchase orders (submitted or confirmed)"""
        orders = self.queryset.filter(status__in=['submitted', 'confirmed'])
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
            status__in=['submitted', 'confirmed'],
            expected_delivery_date__lt=today
        )
        serializer = PurchaseOrderListSerializer(orders, many=True)
        return Response(serializer.data)


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
            
            if quantity_received > item.remaining_quantity:
                return Response(
                    {'error': f'Cannot receive more than ordered. Remaining: {item.remaining_quantity}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Update item
            item.quantity_received += quantity_received
            if not item.received_date and item.is_fully_received:
                item.received_date = date.today()
            if notes:
                item.notes = f"{item.notes}\n{notes}" if item.notes else notes
            item.save()
            
            # Create inventory transaction
            InventoryTransaction.objects.create(
                part=item.part,
                transaction_type='purchase',
                quantity=quantity_received,
                balance_after=item.part.quantity_in_stock,
                unit_cost=item.unit_cost,
                total_cost=item.unit_cost * quantity_received,
                purchase_order=item.purchase_order,
                reason=f"Received from PO {item.purchase_order.po_number}",
                notes=notes,
                created_by=request.user
            )
            
            # Update purchase order status
            po = item.purchase_order
            if po.is_fully_received:
                po.status = 'received'
                po.received_date = date.today()
                po.received_by = request.user
            elif po.is_partially_received:
                po.status = 'partially_received'
            po.save()
            
            # Update part quantity_on_order
            item.part.quantity_on_order = max(0, item.part.quantity_on_order - quantity_received)
            item.part.save()
            
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

