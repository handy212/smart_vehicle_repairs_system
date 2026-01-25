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
from datetime import date
from decimal import Decimal

from apps.branches.utils import filter_queryset_for_user_branches

from .models import (
    PartCategory, Supplier, Part, PurchaseOrder, 
    PurchaseOrderItem, InventoryTransaction,
    ServicePackage, StockItem, Transfer, TransferItem
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
    TransferSerializer, TransferCreateSerializer
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
    def adjust(self, request, pk=None):
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
                    
                    # Create or update part
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
                                'quantity_in_stock': quantity_in_stock,
                                'minimum_stock': minimum_stock,
                                'reorder_point': reorder_point,
                                'reorder_quantity': reorder_quantity,
                                'bin_location': row.get('bin_location', '').strip() or None,
                                'is_taxable': is_taxable,
                                'is_core': is_core,
                                'core_charge': core_charge,
                                'unit_of_measure': row.get('unit_of_measure', 'each').strip() or 'each',
                                'is_active': is_active,
                                'created_by': request.user if created else None,
                            }
                        )
                        
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
        
        # Calculate inventory metrics
        total_parts = parts.count()
        total_quantity = parts.aggregate(total=Sum('quantity_in_stock'))['total'] or 0
        
        # Calculate inventory value
        total_cost_value = Decimal('0.00')
        total_selling_value = Decimal('0.00')
        potential_profit = Decimal('0.00')
        
        for part in parts:
            cost_val = part.cost_price * part.quantity_in_stock if part.cost_price else Decimal('0')
            sell_val = part.selling_price * part.quantity_in_stock if part.selling_price else Decimal('0')
            
            total_cost_value += cost_val
            total_selling_value += sell_val
            potential_profit += (sell_val - cost_val)
        
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
            
            for part in category_parts:
                cat_qty += part.quantity_in_stock
                if part.cost_price:
                    cat_cost_value += part.cost_price * part.quantity_in_stock
                if part.selling_price:
                    cat_sell_value += part.selling_price * part.quantity_in_stock
            
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
        for part in parts:
            if part.last_sold_date:
                days_since_sale = (today - part.last_sold_date).days
            elif part.created_at:
                days_since_sale = (today - part.created_at.date()).days
            else:
                days_since_sale = 0
            
            part_value = part.total_value
            
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
        pending_orders = queryset.filter(status__in=['draft', 'submitted']).count()
        time_now = timezone.now().date()
        overdue_orders = queryset.filter(
            status__in=['draft', 'submitted'], 
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

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit purchase order to supplier"""
        po = self.get_object()
        
        if po.status != 'draft':
            return Response(
                {'error': 'Only draft purchase orders can be submitted'},
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
            
            if quantity_received <= 0:
                return Response(
                    {'error': 'Received quantity must be greater than 0'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
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
    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
        # Admin or Manager sees all? Depends on strictness.
        # But filter_queryset_for_user_branches handles admin logic.
        # However, for StockItem, the user function works well.
        
        return filter_queryset_for_user_branches(
            queryset, 
            user, 
            self.request,
            use_active_branch=True
        )


class TransferViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing stock transfers between branches.
    """
    queryset = Transfer.objects.all().select_related(
        'source_branch', 'destination_branch', 
        'created_by', 'approved_by', 'received_by'
    ).prefetch_related('items__part')
    
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['status', 'source_branch', 'destination_branch']
    ordering = ['-created_at']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return TransferCreateSerializer
        return TransferSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        # Filter transfers relevant to user's branches (either source or dest)
        # This complex logic might need custom implementation if utils don't cover "OR" logic well.
        # simpler: show all if admin/manager, or filter?
        # For now, return all, relying on permission classes to restrict actions?
        return queryset

    def perform_create(self, serializer):
        # Use service to initiate transfer
        items = serializer.validated_data.pop('items')
        InventoryService.initiate_transfer(
            source_branch=serializer.validated_data['source_branch'],
            destination_branch=serializer.validated_data['destination_branch'],
            items=items,
            user=self.request.user,
            notes=serializer.validated_data.get('notes', '')
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        transfer = self.get_object()
        try:
            InventoryService.approve_transfer(transfer, user=request.user)
            return Response({'status': 'Transfer approved'})
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
        elif self.action in ['create', 'update', 'partial_update', 'destroy', 'approve', 'ship', 'receive']:
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
        InventoryService.initiate_transfer(
            source_branch=serializer.validated_data['source_branch'],
            destination_branch=serializer.validated_data['destination_branch'],
            items=items,
            user=self.request.user,
            notes=serializer.validated_data.get('notes', '')
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        transfer = self.get_object()
        try:
            InventoryService.approve_transfer(transfer, user=request.user)
            return Response({'status': 'Transfer approved'})
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
