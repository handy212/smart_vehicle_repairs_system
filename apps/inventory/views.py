from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
import logging
from apps.accounts.permissions import (
    HasAnyPermission,
    HasPermission,
    IsModuleEnabled,
    user_can_access_all_branches,
    user_can_approve_purchase_orders,
    user_has_permission,
)
from apps.accounts.permission_utils import action_permission_instances
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.db.models import Sum, Count, F, Q, Avg
from django.utils import timezone
from django.db import connection, models, transaction
from django.db.models import Sum, Count, F, Q, Avg, Subquery, OuterRef, Value
from django.db.models.functions import Coalesce
from datetime import date, datetime, timedelta
from decimal import Decimal

from apps.branches.utils import filter_queryset_for_user_branches

from .models import (
    PartCategory, Supplier, Part, PurchaseOrder, 
    PurchaseOrderApproval, PurchaseOrderItem, InventoryTransaction,
    ServicePackage, StockItem, Transfer, TransferApproval, TransferItem, StockAlert,
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
    PhysicalCountSessionSerializer,
    PhysicalCountSessionCreateSerializer,
    PhysicalCountItemSerializer, PhysicalCountItemCreateSerializer,
    ServiceBundleSerializer, ServiceBundleCreateUpdateSerializer
)
from .services import InventoryService
from .filters import StockItemFilter

logger = logging.getLogger(__name__)

PART_STOCK_MUTATION_ACTIONS = frozenset({
    'adjust', 'bulk_adjust', 'reserve', 'release_reservation',
})
PART_IMPORT_ACTIONS = frozenset({'import_excel', 'import_csv'})
PART_REPORT_ACTIONS = frozenset({
    'dashboard_stats', 'low_stock', 'out_of_stock', 'inventory_value',
    'inventory_accounting_report', 'stock_movement_report', 'turnover_report',
    'abc_analysis', 'multi_location_stock', 'stock_by_location', 'transaction_history',
})


class PartCategoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for part categories with hierarchical structure
    """
    queryset = PartCategory.objects.prefetch_related('subcategories', 'parts')
    serializer_class = PartCategorySerializer
    permission_classes = [IsAuthenticated, IsModuleEnabled('inventory')]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve', 'root_categories', 'dashboard_stats', 'subcategories', 'parts_list']:
            return [IsAuthenticated(), IsModuleEnabled('inventory'), HasPermission('view_inventory')]
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsModuleEnabled('inventory'), HasPermission('manage_categories')]
        return [IsAuthenticated(), IsModuleEnabled('inventory')]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active', 'parent']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'is_active', 'created_at']
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
    permission_classes = [IsAuthenticated, IsModuleEnabled('inventory')]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), IsModuleEnabled('inventory'), HasPermission('view_suppliers')]
        elif self.action == 'create':
            return [IsAuthenticated(), IsModuleEnabled('inventory'), HasPermission('manage_suppliers')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), IsModuleEnabled('inventory'), HasPermission('manage_suppliers')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), IsModuleEnabled('inventory'), HasPermission('manage_suppliers')]
        elif self.action in ['activate', 'deactivate', 'preferred', 'parts_list', 'purchase_orders_list', 'dashboard_stats']:
            if self.action in ['activate', 'deactivate']:
                return [IsAuthenticated(), IsModuleEnabled('inventory'), HasPermission('manage_suppliers')]
            if self.action == 'preferred':
                return [IsAuthenticated(), IsModuleEnabled('inventory'), HasPermission('view_suppliers')]
            return [IsAuthenticated(), IsModuleEnabled('inventory'), HasPermission('view_inventory')]
        return [IsAuthenticated(), IsModuleEnabled('inventory')]
    
    """
    ViewSet for suppliers with filtering and custom actions
    """
    queryset = Supplier.objects.prefetch_related('parts', 'purchase_orders')
    permission_classes = [IsAuthenticated, IsModuleEnabled('inventory')]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['supplier_type', 'is_active', 'is_preferred']
    search_fields = ['name', 'supplier_code', 'contact_person', 'email', 'city']
    ordering_fields = ['name', 'supplier_code', 'supplier_type', 'is_active', 'city', 'created_at']
    ordering = ['name']

    def get_queryset(self):
        """Filter suppliers by user's accessible branches if branch field exists"""
        queryset = super().get_queryset()
        # Only filter if Supplier model has a branch field
        if hasattr(Supplier, 'branch'):
            queryset = filter_queryset_for_user_branches(
                queryset,
                self.request.user,
                request=self.request,
                use_active_branch=True,
                include_unassigned=True  # Include suppliers not assigned to any branch
            )
        return queryset

    def get_serializer_class(self):
        if self.action == 'create':
            return SupplierCreateSerializer
        elif self.action in ['retrieve', 'update', 'partial_update']:
            return SupplierDetailSerializer
        return SupplierListSerializer

    @action(detail=False, methods=['get'])
    def preferred(self, request):
        """Get list of preferred suppliers"""
        suppliers = self.get_queryset().filter(is_preferred=True, is_active=True)
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
        orders = filter_queryset_for_user_branches(
            supplier.purchase_orders.all(),
            request.user,
            request,
        )
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


from .mixins import StockManagementMixin, InventoryReportMixin

class PartViewSet(StockManagementMixin, InventoryReportMixin, viewsets.ModelViewSet):
    """
    ViewSet for parts inventory with extensive filtering and stock management
    """
    queryset = Part.objects.select_related('category', 'preferred_supplier', 'created_by').prefetch_related('suppliers')
    permission_classes = [IsAuthenticated, IsModuleEnabled('inventory')]
    
    # Removed redundant dashboard_stats action provided by InventoryReportMixin

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        base = [IsAuthenticated(), IsModuleEnabled('inventory')]
        if self.action in ('list', 'retrieve'):
            return base + [HasPermission('view_inventory')()]
        if self.action == 'create':
            return base + [HasPermission('create_parts')()]
        if self.action in ('update', 'partial_update'):
            return base + [HasPermission('edit_parts')()]
        if self.action == 'destroy':
            return base + [HasPermission('delete_parts')()]
        if self.action in PART_STOCK_MUTATION_ACTIONS:
            return base + [HasAnyPermission(['adjust_inventory', 'manage_inventory'])()]
        if self.action in PART_IMPORT_ACTIONS:
            return base + [HasAnyPermission(['import_inventory', 'manage_inventory'])()]
        if self.action in PART_REPORT_ACTIONS:
            return base + [HasAnyPermission(['view_inventory_reports', 'view_inventory'])()]
        return base
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = [
        'category', 'is_active', 'manufacturer', 'preferred_supplier', 'is_taxable', 'is_core'
    ]
    search_fields = [
        'part_number', 'barcode', 'name', 'description', 'manufacturer',
        'manufacturer_part_number', 'bin_location', 'compatible_makes'
    ]
    ordering_fields = [
        'part_number', 'name', 'quantity_in_stock', 'cost_price',
        'selling_price', 'reorder_point', 'category__name', 'is_active', 'created_at'
    ]
    ordering = ['part_number']

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Use centralized branch resolution
        from apps.branches.utils import resolve_branch
        branch = resolve_branch(self.request)
        
        # Use InventoryService for stock annotation
        queryset = InventoryService.get_stock_queryset(queryset, branch)
        
        # Custom filters
        if self.request.query_params.get('low_stock') == 'true':
            queryset = queryset.filter(current_stock__lte=F('reorder_point'))
        
        if self.request.query_params.get('out_of_stock') == 'true':
            queryset = queryset.filter(current_stock=0)
        
        if self.request.query_params.get('needs_reorder') == 'true':
            queryset = queryset.filter(current_stock__lte=F('reorder_point'), current_stock__gt=0)
            
        return queryset

    def get_serializer_class(self):
        if self.action == 'create':
            return PartCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return PartUpdateSerializer
        elif self.action == 'retrieve':
            return PartDetailSerializer
        return PartListSerializer

    # Removed redundant actions (adjust, bulk_adjust, reserve, etc.)
    # provided by StockManagementMixin and InventoryReportMixin
    
    def _handle_part_excel_import(self, request):
        """Import parts from an Excel workbook."""
        import openpyxl
        from django.db import transaction
        from apps.accounts.admin_views import log_audit
        
        if 'file' not in request.FILES:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        import_file = request.FILES['file']
        filename = import_file.name

        if not filename.lower().endswith('.xlsx'):
            return Response({
                'error': 'Inventory import requires a proper Excel workbook (.xlsx). Download the template and upload that format.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            imported_count = 0
            skipped_count = 0
            errors = []
            
            workbook = openpyxl.load_workbook(import_file, read_only=True, data_only=True)
            worksheet = workbook.active
            rows = worksheet.iter_rows(values_only=True)
            raw_headers = next(rows, None)
            if not raw_headers:
                return Response({'error': 'Excel file is empty'}, status=status.HTTP_400_BAD_REQUEST)

            headers = [str(header or '').strip().lower() for header in raw_headers]
            required_headers = ['part_number', 'name']

            if not all(header in headers for header in required_headers):
                return Response({
                    'error': f'Excel file must contain these columns: {", ".join(required_headers)}'
                }, status=status.HTTP_400_BAD_REQUEST)

            def clean_value(value):
                return '' if value is None else str(value).strip()

            for row_num, values in enumerate(rows, start=2):
                row = {
                    headers[index]: clean_value(value)
                    for index, value in enumerate(values)
                    if index < len(headers) and headers[index]
                }
                if not any(row.values()):
                    continue
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
                            defaults={'is_active': True}
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
                object_repr=f'Excel Import: {filename}',
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
                object_repr=f'Excel Import Failed: {filename}',
                changes={
                    'error': str(e),
                    'filename': filename,
                },
                request=request
            )
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def import_excel(self, request):
        """Import parts from an Excel workbook."""
        return self._handle_part_excel_import(request)

    @action(detail=False, methods=['post'])
    def import_csv(self, request):
        """Compatibility route for old clients; only Excel is accepted now."""
        return self._handle_part_excel_import(request)
    
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
                    qty = item['total_qty'] or 0
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
                last_sold_date = getattr(part, 'last_sold_date', None)
                if last_sold_date:
                    days_since_sale = (today - last_sold_date).days
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
                qty = item['total_qty'] or 0
                
                last_sold_date = getattr(part, 'last_sold_date', None)
                if last_sold_date:
                    days_since_sale = (today - last_sold_date).days
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
    permission_classes = [IsAuthenticated, IsModuleEnabled('inventory')]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        base = [IsAuthenticated(), IsModuleEnabled('inventory')]
        if self.action in ['list', 'retrieve']:
            return base + [HasPermission('view_inventory')()]
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return base + [HasPermission('manage_inventory')()]
        return base
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
        'supplier', 'created_by', 'submitted_by', 'received_by',
        'assigned_approver', 'approved_by', 'rejected_by'
    ).prefetch_related('items__part', 'approvals__approver')
    permission_classes = [IsAuthenticated, IsModuleEnabled('inventory')]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'list' or self.action == 'retrieve':
            return [IsAuthenticated(), IsModuleEnabled('inventory'), HasPermission('view_inventory')]
        elif self.action == 'create':
            return [IsAuthenticated(), IsModuleEnabled('inventory'), HasPermission('create_purchase_orders')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), IsModuleEnabled('inventory'), HasPermission('edit_purchase_orders')]
        elif self.action in ['submit_for_approval', 'confirm', 'cancel', 'add_item', 'update_item', 'remove_item']:
            return [IsAuthenticated(), IsModuleEnabled('inventory'), HasPermission('manage_inventory')]
        elif self.action in ['approve', 'reject']:
            return [IsAuthenticated(), IsModuleEnabled('inventory'), HasPermission('approve_purchase_orders')]
        return [IsAuthenticated(), IsModuleEnabled('inventory')]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'supplier', 'order_date']
    search_fields = ['po_number', 'supplier__name', 'notes']
    ordering_fields = ['po_number', 'order_date', 'expected_delivery_date', 'total', 'status', 'supplier__name', 'created_at']
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

    @staticmethod
    def _can_approve_purchase_order(user, po):
        if user_can_approve_purchase_orders(user) and (
            not po.approvals.exists() or po.approvals.filter(status='pending').exists()
        ):
            if po.approvals.filter(approver=user, status='pending').exists():
                return True
            if user_has_permission(user, 'manage_inventory'):
                return True
        if po.approvals.exists():
            return po.approvals.filter(approver=user, status='pending').exists()
        return po.assigned_approver_id == getattr(user, 'id', None)

    @staticmethod
    def _is_privileged_approver(user):
        return user_can_approve_purchase_orders(user)

    @staticmethod
    def _requested_approver_ids(request):
        if hasattr(request.data, 'getlist'):
            approver_ids = request.data.getlist('approver_ids')
            if not approver_ids:
                approver_id = request.data.get('approver_id')
                approver_ids = [approver_id] if approver_id else []
        else:
            approver_ids = request.data.get('approver_ids')
            if approver_ids is None:
                approver_id = request.data.get('approver_id')
                approver_ids = [approver_id] if approver_id else []
            elif not isinstance(approver_ids, list):
                approver_ids = [approver_ids]

        cleaned = []
        seen = set()
        for approver_id in approver_ids:
            try:
                cleaned_id = int(approver_id)
            except (TypeError, ValueError):
                continue
            if cleaned_id not in seen:
                cleaned.append(cleaned_id)
                seen.add(cleaned_id)
        return cleaned

    @staticmethod
    def _approval_summary(po):
        approvals = list(po.approvals.all())
        total = len(approvals)
        approved = sum(1 for approval in approvals if approval.status == 'approved')
        rejected = sum(1 for approval in approvals if approval.status == 'rejected')
        pending = sum(1 for approval in approvals if approval.status == 'pending')
        return {
            'total': total,
            'approved': approved,
            'pending': pending,
            'rejected': rejected,
        }

    @staticmethod
    def _recalculate_quantity_on_order(po):
        """Recalculate branch on-order stock for every part on this PO."""
        branch = po.branch
        if not branch:
            return

        active_statuses = ['pending_approval', 'approved', 'confirmed', 'partially_received']
        for item in po.items.select_related('part'):
            total_on_order = PurchaseOrderItem.objects.filter(
                part=item.part,
                purchase_order__status__in=active_statuses,
                purchase_order__branch=branch,
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
            stock_item.save(update_fields=['quantity_on_order', 'updated_at'])

    @staticmethod
    def _set_linked_work_order_parts_waiting(po):
        """Move work-order parts linked to this PO into the waiting-for-stock state."""
        try:
            from apps.workorders.models import WorkOrderPart
        except Exception:
            return

        WorkOrderPart.objects.filter(
            purchase_order_item__purchase_order=po,
            status='po_created',
        ).update(status='awaiting_stock')

    @staticmethod
    def _release_linked_work_order_parts(po):
        """Release work-order part requests when their PO is rejected/cancelled."""
        try:
            from apps.workorders.models import WorkOrderPart
        except Exception:
            return

        WorkOrderPart.objects.filter(
            purchase_order_item__purchase_order=po,
            status__in=['po_created', 'awaiting_stock'],
        ).update(status='pending', purchase_order_item=None)

    @staticmethod
    def _update_linked_work_order_parts_after_receipt(item):
        """Reflect received supplier stock on linked work-order part requests."""
        try:
            from apps.workorders.models import WorkOrderPart
        except Exception:
            return

        received_available = Decimal(str(item.quantity_received or 0))
        linked_parts = WorkOrderPart.objects.filter(
            purchase_order_item=item,
            status__in=['po_created', 'awaiting_stock', 'pending', 'draft'],
        ).order_by('created_at', 'id')

        for wo_part in linked_parts:
            required = Decimal(str(wo_part.quantity or 0))
            if required <= 0:
                continue
            if received_available >= required:
                if wo_part.status != 'received':
                    wo_part.status = 'received'
                    wo_part.save(update_fields=['status', 'updated_at'])
                received_available -= required
            elif wo_part.status == 'po_created':
                wo_part.status = 'awaiting_stock'
                wo_part.save(update_fields=['status', 'updated_at'])

    @action(detail=True, methods=['post'], url_path='submit-for-approval')
    @transaction.atomic
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
        
        approver_ids = self._requested_approver_ids(request)
        if not approver_ids:
            return Response(
                {'error': 'Select at least one approver before submitting this purchase order.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from apps.accounts.models import User
        approvers = list(User.objects.filter(id__in=approver_ids, is_active=True))
        approvers_by_id = {approver.id: approver for approver in approvers}
        missing_ids = [approver_id for approver_id in approver_ids if approver_id not in approvers_by_id]
        if missing_ids:
            return Response(
                {'error': 'One or more selected approvers were not found.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if request.user.id in approver_ids:
            return Response(
                {'error': 'Purchase orders must be approved by someone other than the submitter.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        invalid_approvers = [
            approver for approver in approvers
            if not user_has_permission(approver, 'approve_purchase_orders')
            and not user_has_permission(approver, 'manage_inventory')
        ]
        if invalid_approvers:
            return Response(
                {'error': 'Selected approvers must be managers, admins, or parts managers.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        ordered_approvers = [approvers_by_id[approver_id] for approver_id in approver_ids]
        po.assigned_approver = ordered_approvers[0]

        po.status = 'pending_approval'
        po.submitted_by = request.user
        po.submitted_at = timezone.now()
        po.save()
        po.approvals.all().delete()
        PurchaseOrderApproval.objects.bulk_create([
            PurchaseOrderApproval(purchase_order=po, approver=approver)
            for approver in ordered_approvers
        ])
        self._recalculate_quantity_on_order(po)

        # Send notification to every assigned approver.
        for approver in ordered_approvers:
            try:
                from apps.notifications_app.triggers import NotificationTriggers
                triggers = NotificationTriggers()
                triggers.purchase_order_approval_request(po, approver)
            except Exception as e:
                # specific validation error logging could go here
                pass

        return Response({
            'status': 'Purchase order submitted for approval',
            'approver_count': len(ordered_approvers),
        })
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve purchase order (allows sending to supplier)"""
        po = self.get_object()
        
        if po.status != 'pending_approval':
            return Response(
                {'error': 'Only purchase orders pending approval can be approved'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not self._can_approve_purchase_order(request.user, po):
            return Response(
                {'error': 'Only the assigned approver, admin, or super admin can approve this purchase order.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if po.submitted_by_id == request.user.id and not user_can_approve_purchase_orders(request.user):
            return Response(
                {'error': 'Purchase orders cannot be approved by the same user who submitted them.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        approvals = po.approvals.select_related('approver')
        if approvals.exists():
            now = timezone.now()
            user_approval = approvals.filter(approver=request.user, status='pending').first()

            if user_approval:
                user_approval.status = 'approved'
                user_approval.approved_at = now
                user_approval.save(update_fields=['status', 'approved_at', 'updated_at'])
            elif self._is_privileged_approver(request.user):
                approvals.filter(status='pending').update(status='approved', approved_at=now, updated_at=now)
            else:
                return Response(
                    {'error': 'This purchase order is waiting on a different approver.'},
                    status=status.HTTP_403_FORBIDDEN
                )

            if not approvals.filter(status='pending').exists():
                po.status = 'approved'
                po.approved_by = request.user
                po.approved_at = now
                po.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])
                self._recalculate_quantity_on_order(po)
                return Response({'status': 'Purchase order approved', 'approval_progress': self._approval_summary(po)})

            return Response({'status': 'Approval recorded', 'approval_progress': self._approval_summary(po)})

        po.status = 'approved'
        po.approved_by = request.user
        po.approved_at = timezone.now()
        po.save()
        self._recalculate_quantity_on_order(po)

        return Response({'status': 'Purchase order approved', 'approval_progress': self._approval_summary(po)})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a purchase order that is pending approval."""
        po = self.get_object()

        if po.status != 'pending_approval':
            return Response(
                {'error': 'Only purchase orders pending approval can be rejected'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not self._can_approve_purchase_order(request.user, po):
            return Response(
                {'error': 'Only the assigned approver, admin, or super admin can reject this purchase order.'},
                status=status.HTTP_403_FORBIDDEN
            )

        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response(
                {'error': 'A rejection reason is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        approvals = po.approvals.select_related('approver')
        if approvals.exists():
            now = timezone.now()
            user_approval = approvals.filter(approver=request.user, status='pending').first()
            if user_approval:
                user_approval.status = 'rejected'
                user_approval.rejected_at = now
                user_approval.rejection_reason = reason
                user_approval.save(update_fields=['status', 'rejected_at', 'rejection_reason', 'updated_at'])
            elif self._is_privileged_approver(request.user):
                approvals.filter(status='pending').update(
                    status='rejected',
                    rejected_at=now,
                    rejection_reason=reason,
                    updated_at=now,
                )

        po.status = 'rejected'
        po.rejected_by = request.user
        po.rejected_at = timezone.now()
        po.rejection_reason = reason
        po.save(update_fields=['status', 'rejected_by', 'rejected_at', 'rejection_reason', 'updated_at'])
        self._release_linked_work_order_parts(po)
        self._recalculate_quantity_on_order(po)

        return Response({'status': 'Purchase order rejected'})

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
        self._set_linked_work_order_parts_waiting(po)
        self._recalculate_quantity_on_order(po)
        
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
        self._release_linked_work_order_parts(po)
        
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
        
        self._recalculate_quantity_on_order(po)
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
        orders = self.get_queryset().filter(status__in=['pending_approval', 'approved', 'confirmed'])
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
        orders = self.get_queryset().filter(
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
    
    @action(detail=True, methods=['get'])
    def print(self, request, pk=None):
        """Return HTML for print view (same layout as PDF)."""
        from django.http import HttpResponse
        from apps.core.services.print_service import render_purchase_order_print_html
        
        po = self.get_object()
        try:
            html = render_purchase_order_print_html(po, branch=po.branch, request=request)
            return HttpResponse(html, content_type='text/html; charset=utf-8')
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Print HTML generation error: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to generate print view: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PurchaseOrderItemViewSet(viewsets.ModelViewSet):
    """
    ViewSet for purchase order items
    """
    queryset = PurchaseOrderItem.objects.select_related('purchase_order', 'part')
    serializer_class = PurchaseOrderItemSerializer
    permission_classes = [IsAuthenticated, IsModuleEnabled('inventory')]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        base = [IsAuthenticated(), IsModuleEnabled('inventory')]
        if self.action in ['list', 'retrieve']:
            return base + [HasPermission('view_inventory')()]
        if self.action == 'receive':
            return base + [HasAnyPermission(['receive_parts', 'manage_inventory'])()]
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return base + [HasPermission('manage_inventory')()]
        return base
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['purchase_order', 'part']
    ordering = ['id']

    def get_queryset(self):
        queryset = super().get_queryset()
        return filter_queryset_for_user_branches(
            queryset,
            self.request.user,
            self.request,
            branch_lookup='purchase_order__branch',
        )

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
                if not po.received_by:
                    po.received_by = request.user
            po.save()

            PurchaseOrderViewSet._recalculate_quantity_on_order(po)
            PurchaseOrderViewSet._update_linked_work_order_parts_after_receipt(item)
            
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
    permission_classes = [IsAuthenticated, IsModuleEnabled('inventory')]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        base = [IsAuthenticated(), IsModuleEnabled('inventory')]
        if self.action in ['recent', 'by_date_range', 'list', 'retrieve']:
            return base + [HasPermission('view_inventory')()]
        return base
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['part', 'transaction_type', 'purchase_order', 'work_order']
    ordering_fields = ['transaction_date', 'created_at']
    ordering = ['-transaction_date']

    def get_queryset(self):
        return filter_queryset_for_user_branches(
            super().get_queryset(),
            self.request.user,
            self.request,
            branch_lookup='branch',
        )

    @action(detail=False, methods=['get'])
    def recent(self, request):
        """Get recent transactions (last 100)"""
        qs = filter_queryset_for_user_branches(
            self.get_queryset(),
            request.user,
            request,
            branch_lookup='branch',
        )
        transactions = qs[:100]
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
        
        transactions = self.get_queryset().filter(
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
    permission_classes = [IsAuthenticated, IsModuleEnabled('inventory')]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        base = [IsAuthenticated(), IsModuleEnabled('inventory')]
        if self.action in ['list', 'retrieve']:
            return base + [HasPermission('view_inventory')()]
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return base + [HasPermission('manage_inventory')()]
        return base
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = StockItemFilter
    search_fields = ['part__part_number', 'part__name', 'bin_location']
    ordering_fields = ['quantity_in_stock', 'total_value']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
        # Filter by branch (handled by permission utility or manual)
        # Assuming we want users to only see stock for their accessible branches
        # Or all branches if they have permission?
        # For now, let's filter by user branches utility
        return filter_queryset_for_user_branches(
            queryset,
            user,
            self.request,
            branch_lookup='branch',
        )


class TransferViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing stock transfers between branches.
    """
    queryset = Transfer.objects.all().select_related(
        'source_branch', 'destination_branch', 
        'created_by', 'submitted_by', 'assigned_approver', 'approved_by', 'rejected_by', 'received_by'
    ).prefetch_related('items__part', 'approvals__approver')
    
    permission_classes = [IsAuthenticated, IsModuleEnabled('inventory')]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        base = [IsAuthenticated(), IsModuleEnabled('inventory')]
        if self.action in ['list', 'retrieve', 'pdf']:
            return base + [HasPermission('view_inventory')()]
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'approve', 'ship', 'receive', 'submit_for_approval', 'reject']:
            return base + [HasAnyPermission(['transfer_inventory', 'manage_inventory'])()]
        return base
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['status', 'source_branch', 'destination_branch']
    ordering_fields = [
        'transfer_number', 'requested_date', 'status', 'created_at',
        'source_branch__name', 'destination_branch__name',
    ]
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
            
        if user_can_access_all_branches(user):
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

    @staticmethod
    def _requested_approver_ids(request):
        if hasattr(request.data, 'getlist'):
            approver_ids = request.data.getlist('approver_ids')
            if not approver_ids:
                approver_id = request.data.get('approver_id')
                approver_ids = [approver_id] if approver_id else []
        else:
            approver_ids = request.data.get('approver_ids')
            if approver_ids is None:
                approver_id = request.data.get('approver_id')
                approver_ids = [approver_id] if approver_id else []
            elif not isinstance(approver_ids, list):
                approver_ids = [approver_ids]

        cleaned = []
        seen = set()
        for approver_id in approver_ids:
            try:
                cleaned_id = int(approver_id)
            except (TypeError, ValueError):
                continue
            if cleaned_id not in seen:
                cleaned.append(cleaned_id)
                seen.add(cleaned_id)
        return cleaned

    def destroy(self, request, *args, **kwargs):
        transfer = self.get_object()
        if transfer.status not in {'draft', 'rejected', 'cancelled'}:
            return Response(
                {'error': 'Only draft, rejected, or cancelled transfers can be deleted.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='submit-for-approval')
    def submit_for_approval(self, request, pk=None):
        transfer = self.get_object()
        approver_ids = self._requested_approver_ids(request)
        if not approver_ids:
            return Response({'error': 'Select at least one approver before submitting this transfer'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.accounts.models import User
        approvers = list(User.objects.filter(id__in=approver_ids, is_active=True))
        approvers_by_id = {approver.id: approver for approver in approvers}
        if any(approver_id not in approvers_by_id for approver_id in approver_ids):
            return Response({'error': 'One or more selected approvers were not found.'}, status=status.HTTP_400_BAD_REQUEST)
        ordered_approvers = [approvers_by_id[approver_id] for approver_id in approver_ids]
        
        try:
            InventoryService.submit_transfer_for_approval(transfer, approvers=ordered_approvers, user=request.user)
            
            # Send notification to every assigned approver.
            for approver in ordered_approvers:
                try:
                    from apps.notifications_app.triggers import NotificationTriggers
                    triggers = NotificationTriggers()
                    triggers.stock_transfer_approval_request(transfer, approver)
                except Exception as e:
                    # Log but don't fail
                    logger.warning(f"Failed to send transfer approval notification: {e}")
            
            return Response({'status': 'Transfer submitted for approval', 'approver_count': len(ordered_approvers)})
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
            except (ValueError, TypeError):
                return Response(
                    {'error': f"Invalid item data: key and value must be integers. Got key='{k}', value='{v}'"},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
        try:
            InventoryService.receive_transfer(transfer, parsed_items, user=request.user)
            return Response({'status': 'Transfer received'})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Generate PDF for transfer note"""
        from apps.core.services.print_service import generate_transfer_note_pdf
        transfer = self.get_object()
        try:
            return generate_transfer_note_pdf(transfer)
        except Exception as e:
            return Response(
                {"error": f"Failed to generate PDF: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class StockAlertViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing stock alerts (low stock, out of stock, etc.)
    """
    queryset = StockAlert.objects.select_related('part', 'branch', 'stock_item', 'acknowledged_by')
    permission_classes = [IsAuthenticated, IsModuleEnabled('inventory')]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        base = [IsAuthenticated(), IsModuleEnabled('inventory')]
        if self.action in ['list', 'retrieve', 'active', 'critical', 'stats']:
            return base + [HasAnyPermission(['view_low_stock_alerts', 'view_inventory'])()]
        if self.action in ['update', 'partial_update', 'acknowledge', 'resolve', 'dismiss', 'check_all']:
            return base + [HasPermission('manage_inventory')()]
        return base
    
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

        if user_can_access_all_branches(user):
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
    permission_classes = [IsAuthenticated, IsModuleEnabled('inventory')]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        base = [IsAuthenticated(), IsModuleEnabled('inventory')]
        if self.action in ['list', 'retrieve', 'discrepancies', 'unreconciled', 'print_count_sheet']:
            return base + [HasPermission('view_inventory')()]
        if self.action in ['create', 'update', 'partial_update', 'start', 'complete', 'cancel', 'add_item']:
            return base + [HasPermission('manage_inventory')()]
        return base
    
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['status', 'branch', 'count_date']
    ordering_fields = ['created_at', 'count_date', 'status', 'session_number', 'branch__name']
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

        if user_can_access_all_branches(user):
            return queryset

        return queryset.filter(branch__in=accessible_branches)

    def perform_create(self, serializer):
        """Create a new physical count session"""
        serializer.save(created_by=self.request.user)

    def create(self, request, *args, **kwargs):
        """Return full session payload (including id) after create."""
        create_serializer = self.get_serializer(data=request.data)
        create_serializer.is_valid(raise_exception=True)
        self.perform_create(create_serializer)
        session = create_serializer.instance
        output = PhysicalCountSessionSerializer(
            session, context=self.get_serializer_context()
        )
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)

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
        physical_quantity = int(serializer.validated_data['physical_quantity'])
        
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

    @action(detail=True, methods=['get'])
    def print_count_sheet(self, request, pk=None):
        """Generate PDF for count sheet"""
        from apps.core.services.print_service import generate_inventory_count_sheet_pdf
        session = self.get_object()
        try:
            return generate_inventory_count_sheet_pdf(session)
        except Exception as e:
            return Response(
                {"error": f"Failed to generate PDF: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PhysicalCountItemViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing physical count items
    """
    queryset = PhysicalCountItem.objects.select_related(
        'session', 'part', 'stock_item', 'reconciled_by'
    )
    permission_classes = [IsAuthenticated, IsModuleEnabled('inventory')]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        base = [IsAuthenticated(), IsModuleEnabled('inventory')]
        if self.action in ['list', 'retrieve']:
            return base + [HasPermission('view_inventory')()]
        if self.action in ['create', 'update', 'partial_update', 'reconcile', 'bulk_reconcile']:
            return base + [HasPermission('manage_inventory')()]
        return base
    
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

        if user_can_access_all_branches(user):
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
    ordering_fields = ['name', 'is_active', 'created_at', 'service_type__name']

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ServiceBundleCreateUpdateSerializer
        return ServiceBundleSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsModuleEnabled('inventory')(), HasPermission('manage_inventory')()]
        return action_permission_instances(
            'inventory', self.action, view_code='view_inventory',
            manage_code='manage_inventory', request=self.request,
        )
