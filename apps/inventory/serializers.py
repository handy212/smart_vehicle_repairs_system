from rest_framework import serializers
from django.db import transaction
from decimal import Decimal
from .models import (
    PartCategory, Supplier, Part, PurchaseOrder, 
    PurchaseOrderApproval, PurchaseOrderItem, InventoryTransaction,
    ServicePackage, ServicePackagePart,
    ServiceBundle, ServiceBundleItem,
    StockItem, Transfer, TransferApproval, TransferItem
)

from apps.accounts.models import User
from apps.branches.utils import resolve_branch


class PartCategorySerializer(serializers.ModelSerializer):
    full_path = serializers.ReadOnlyField()
    parent_name = serializers.SerializerMethodField()
    subcategories_count = serializers.SerializerMethodField()
    parts_count = serializers.SerializerMethodField()

    class Meta:
        model = PartCategory
        fields = [
            'id', 'name', 'description', 'parent', 'parent_name', 
            'full_path', 'is_active', 'subcategories_count', 'parts_count',
            'created_at', 'updated_at'
        ]

    def get_parent_name(self, obj):
        return obj.parent.name if obj.parent else None

    def get_subcategories_count(self, obj):
        return obj.subcategories.count()

    def get_parts_count(self, obj):
        return obj.parts.count()


class SupplierListSerializer(serializers.ModelSerializer):
    parts_count = serializers.SerializerMethodField()
    active_po_count = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = [
            'id', 'name', 'supplier_code', 'supplier_type', 'contact_person',
            'email', 'phone', 'city', 'state', 'is_active', 'is_preferred',
            'parts_count', 'active_po_count', 'created_at',
            'open_balance', 'overdue_payment'
        ]

    def get_parts_count(self, obj):
        return obj.parts.count()

    def get_active_po_count(self, obj):
        return obj.purchase_orders.filter(
            status__in=['pending_approval', 'approved', 'confirmed', 'partially_received']
        ).count()


class SupplierDetailSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    parts_count = serializers.SerializerMethodField()
    total_po_count = serializers.SerializerMethodField()
    
    qbo_sync_status = serializers.SerializerMethodField()
    qbo_sync_error = serializers.SerializerMethodField()
    
    open_balance = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    overdue_payment = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Supplier
        fields = '__all__'

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_parts_count(self, obj):
        return obj.parts.count()

    def get_total_po_count(self, obj):
        return obj.purchase_orders.count()

    def _get_qbo_mapping(self, obj):
        if not hasattr(self, '_qbo_mapping_cache'):
            self._qbo_mapping_cache = {}
        if obj.id not in self._qbo_mapping_cache:
            from apps.quickbooks_online.models import QBOMapping
            from django.contrib.contenttypes.models import ContentType
            self._qbo_mapping_cache[obj.id] = QBOMapping.objects.filter(
                content_type=ContentType.objects.get_for_model(obj),
                object_id=obj.id
            ).first()
        return self._qbo_mapping_cache[obj.id]

    def get_qbo_sync_status(self, obj):
        mapping = self._get_qbo_mapping(obj)
        return mapping.status if mapping else 'un-synced'

    def get_qbo_sync_error(self, obj):
        mapping = self._get_qbo_mapping(obj)
        return mapping.error_message if mapping else ''


class SupplierCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        exclude = ['created_by', 'created_at', 'updated_at']

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class PartListSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()
    category_path = serializers.SerializerMethodField()
    preferred_supplier_name = serializers.SerializerMethodField()
    available_quantity = serializers.SerializerMethodField()
    # Override quantity_in_stock to use annotated value
    quantity_in_stock = serializers.IntegerField(source='current_stock', read_only=True)
    quantity_reserved = serializers.IntegerField(source='current_reserved', read_only=True)
    is_low_stock = serializers.SerializerMethodField()
    is_out_of_stock = serializers.SerializerMethodField()
    needs_reorder = serializers.SerializerMethodField()
    profit_margin = serializers.ReadOnlyField()

    class Meta:
        model = Part
        fields = [
            'id', 'part_number', 'barcode', 'name', 'category', 'category_name', 'category_path',
            'manufacturer', 'quantity_in_stock', 'available_quantity', 'quantity_reserved',
            'quantity_on_order', 'reorder_point', 'unit', 'cost_price', 'selling_price',
            'markup_percentage', 'profit_margin', 'bin_location', 'preferred_supplier',
            'preferred_supplier_name', 'is_low_stock', 'is_out_of_stock', 'needs_reorder',
            'image', 'is_active', 'created_at'
        ]


    def get_available_quantity(self, obj):
        # Use annotated values if available, otherwise fallback (which likely returns model defaults)
        stock = getattr(obj, 'current_stock', obj.quantity_in_stock)
        reserved = getattr(obj, 'current_reserved', obj.quantity_reserved)
        # Handle None which might happen with Coalesce if something goes wrong, though Coalesce should handle it
        if stock is None: stock = 0
        if reserved is None: reserved = 0
        return max(0, stock - reserved)

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    def get_category_path(self, obj):
        return obj.category.full_path if obj.category else None

    def get_preferred_supplier_name(self, obj):
        return obj.preferred_supplier.name if obj.preferred_supplier else None

    def get_is_low_stock(self, obj):
        stock = getattr(obj, 'current_stock', obj.quantity_in_stock) or 0
        return stock <= obj.reorder_point

    def get_is_out_of_stock(self, obj):
        stock = getattr(obj, 'current_stock', obj.quantity_in_stock) or 0
        return stock == 0

    def get_needs_reorder(self, obj):
        stock = getattr(obj, 'current_stock', obj.quantity_in_stock) or 0
        return stock <= obj.reorder_point


class PartDetailSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()
    category_path = serializers.SerializerMethodField()
    preferred_supplier_name = serializers.SerializerMethodField()
    suppliers_list = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    
    # Override stock fields to use annotated values from viewset
    quantity_in_stock = serializers.IntegerField(source='current_stock', read_only=True)
    quantity_reserved = serializers.IntegerField(source='current_reserved', read_only=True)
    
    available_quantity = serializers.SerializerMethodField()
    is_low_stock = serializers.SerializerMethodField()
    is_out_of_stock = serializers.SerializerMethodField()
    needs_reorder = serializers.SerializerMethodField()
    profit_margin = serializers.ReadOnlyField()
    total_value = serializers.ReadOnlyField()

    stock_items = serializers.SerializerMethodField()

    class Meta:
        model = Part
        fields = '__all__'

    def get_available_quantity(self, obj):
        stock = getattr(obj, 'current_stock', obj.quantity_in_stock) or 0
        reserved = getattr(obj, 'current_reserved', obj.quantity_reserved) or 0
        return max(0, stock - reserved)
        
    def get_is_low_stock(self, obj):
        stock = getattr(obj, 'current_stock', obj.quantity_in_stock) or 0
        return stock <= obj.reorder_point

    def get_is_out_of_stock(self, obj):
        stock = getattr(obj, 'current_stock', obj.quantity_in_stock) or 0
        return stock == 0

    def get_needs_reorder(self, obj):
        stock = getattr(obj, 'current_stock', obj.quantity_in_stock) or 0
        # Basic logic: stock <= reorder_point. 
        # Ideally should check quantity_on_order too, but that needs annotation as well.
        return stock <= obj.reorder_point

    def get_stock_items(self, obj):
        items = obj.stock_items.select_related('branch').all()
        return StockItemSerializer(items, many=True).data

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    def get_category_path(self, obj):
        return obj.category.full_path if obj.category else None

    def get_preferred_supplier_name(self, obj):
        return obj.preferred_supplier.name if obj.preferred_supplier else None

    def get_suppliers_list(self, obj):
        return [{'id': s.id, 'name': s.name, 'supplier_code': s.supplier_code} 
                for s in obj.suppliers.all()]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None


class PartBarcodeSerializerMixin(serializers.Serializer):
    barcode = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate_barcode(self, value):
        if value is None:
            return None

        barcode = str(value).strip()
        if not barcode:
            return None

        existing_parts = Part.objects.filter(barcode__iexact=barcode)
        instance = getattr(self, 'instance', None)
        if instance and instance.pk:
            existing_parts = existing_parts.exclude(pk=instance.pk)
        if existing_parts.exists():
            raise serializers.ValidationError("A part with this barcode already exists.")

        return barcode


class PartCreateSerializer(PartBarcodeSerializerMixin, serializers.ModelSerializer):
    class Meta:
        model = Part
        exclude = ['created_by', 'last_cost_update', 'last_price_update', 
                   'created_at', 'updated_at', 'quantity_reserved', 'quantity_on_order']

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        branch = validated_data.get('branch')
        if not branch:
            request = self.context.get('request')
            if request:
                branch = resolve_branch(request)
        if branch:
            validated_data['branch'] = branch
        return super().create(validated_data)


class PartUpdateSerializer(PartBarcodeSerializerMixin, serializers.ModelSerializer):
    class Meta:
        model = Part
        fields = [
            'part_number', 'name', 'description', 'category', 'branch', 'manufacturer',
            'manufacturer_part_number', 'barcode', 'suppliers', 'preferred_supplier',
            'reorder_point', 'reorder_quantity', 'minimum_stock', 'maximum_stock',
            'unit', 'cost_price', 'selling_price', 'markup_percentage', 'list_price',
            'bin_location', 'shelf', 'weight', 'dimensions', 'compatible_makes',
            'compatible_models', 'compatible_years', 'warranty_months', 'warranty_notes',
            'image', 'is_active', 'is_taxable', 'is_core', 'core_charge'
        ]


class PartStockAdjustmentSerializer(serializers.Serializer):
    """Serializer for manual stock adjustments"""
    quantity = serializers.IntegerField()
    reason = serializers.CharField(max_length=255)
    notes = serializers.CharField(required=False, allow_blank=True)


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    part_number = serializers.SerializerMethodField()
    part_name = serializers.SerializerMethodField()
    is_fully_received = serializers.ReadOnlyField()
    remaining_quantity = serializers.ReadOnlyField()

    class Meta:
        model = PurchaseOrderItem
        fields = [
            'id', 'part', 'part_number', 'part_name', 'quantity', 
            'quantity_received', 'unit_cost', 'total', 'received_date',
            'is_fully_received', 'remaining_quantity', 'notes'
        ]

    def get_part_number(self, obj):
        return obj.part.part_number

    def get_part_name(self, obj):
        return obj.part.name


class PurchaseOrderItemCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseOrderItem
        fields = ['id', 'part', 'quantity', 'unit_cost', 'notes']

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than 0")
        return value


class PurchaseOrderApprovalSerializer(serializers.ModelSerializer):
    approver_name = serializers.SerializerMethodField()
    approver_email = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrderApproval
        fields = [
            'id', 'approver', 'approver_name', 'approver_email', 'status',
            'approved_at', 'rejected_at', 'rejection_reason', 'created_at',
            'updated_at'
        ]

    def get_approver_name(self, obj):
        return obj.approver.get_full_name() or obj.approver.username

    def get_approver_email(self, obj):
        return obj.approver.email


class PurchaseOrderListSerializer(serializers.ModelSerializer):
    supplier_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    assigned_approver_name = serializers.SerializerMethodField()
    approval_progress = serializers.SerializerMethodField()
    total_items = serializers.ReadOnlyField()
    total_quantity = serializers.ReadOnlyField()
    received_quantity = serializers.ReadOnlyField()
    is_fully_received = serializers.ReadOnlyField()

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'supplier', 'supplier_name', 'status',
            'order_date', 'expected_delivery_date', 'due_date', 'total_items',
            'total_quantity', 'received_quantity', 'subtotal', 'total',
            'is_fully_received', 'created_by_name', 'assigned_approver',
            'assigned_approver_name', 'approval_progress', 'rejected_at',
            'rejection_reason', 'created_at'
        ]

    def get_supplier_name(self, obj):
        return obj.supplier.name

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_assigned_approver_name(self, obj):
        return obj.assigned_approver.get_full_name() if obj.assigned_approver else None

    def get_approval_progress(self, obj):
        approvals = list(getattr(obj, 'approvals', []).all())
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


class PurchaseOrderDetailSerializer(serializers.ModelSerializer):
    supplier = SupplierListSerializer(read_only=True)
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    approvals = PurchaseOrderApprovalSerializer(many=True, read_only=True)
    assigned_approver_name = serializers.SerializerMethodField()
    approval_progress = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    rejected_by_name = serializers.SerializerMethodField()
    received_by_name = serializers.SerializerMethodField()
    total_items = serializers.ReadOnlyField()
    total_quantity = serializers.ReadOnlyField()
    received_quantity = serializers.ReadOnlyField()
    is_fully_received = serializers.ReadOnlyField()
    is_partially_received = serializers.ReadOnlyField()
    
    qbo_sync_status = serializers.SerializerMethodField()
    qbo_sync_error = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = '__all__'

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_submitted_by_name(self, obj):
        return obj.submitted_by.get_full_name() if obj.submitted_by else None

    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None

    def get_rejected_by_name(self, obj):
        return obj.rejected_by.get_full_name() if obj.rejected_by else None

    def get_received_by_name(self, obj):
        return obj.received_by.get_full_name() if obj.received_by else None

    def get_assigned_approver_name(self, obj):
        return obj.assigned_approver.get_full_name() if obj.assigned_approver else None

    def get_approval_progress(self, obj):
        approvals = list(obj.approvals.all())
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

    def _get_qbo_mapping(self, obj):
        if not hasattr(self, '_qbo_mapping_cache'):
            self._qbo_mapping_cache = {}
        if obj.id not in self._qbo_mapping_cache:
            from apps.quickbooks_online.models import QBOMapping
            from django.contrib.contenttypes.models import ContentType
            self._qbo_mapping_cache[obj.id] = QBOMapping.objects.filter(
                content_type=ContentType.objects.get_for_model(obj),
                object_id=obj.id
            ).first()
        return self._qbo_mapping_cache[obj.id]

    def get_qbo_sync_status(self, obj):
        mapping = self._get_qbo_mapping(obj)
        return mapping.status if mapping else 'un-synced'

    def get_qbo_sync_error(self, obj):
        mapping = self._get_qbo_mapping(obj)
        return mapping.error_message if mapping else ''


class PurchaseOrderCreateSerializer(serializers.ModelSerializer):
    items = PurchaseOrderItemCreateSerializer(many=True, required=False)

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'supplier', 'order_date', 'expected_delivery_date',
            'shipping_cost', 'tax_amount', 'notes', 'internal_notes', 'items'
        ]
        read_only_fields = ['id', 'po_number']

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        validated_data['created_by'] = self.context['request'].user
        branch = validated_data.get('branch')
        if not branch:
            request = self.context.get('request')
            if request:
                branch = resolve_branch(request)
        if branch:
            validated_data['branch'] = branch
        
        purchase_order = PurchaseOrder.objects.create(**validated_data)
        
        for item_data in items_data:
            PurchaseOrderItem.objects.create(purchase_order=purchase_order, **item_data)
        
        purchase_order.calculate_totals()
        return purchase_order


class PurchaseOrderUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseOrder
        fields = [
            'expected_delivery_date', 'shipping_cost', 'tax_amount',
            'notes', 'internal_notes'
        ]


class ReceiveItemSerializer(serializers.Serializer):
    """Serializer for receiving purchase order items"""
    quantity_received = serializers.IntegerField(min_value=1)
    notes = serializers.CharField(required=False, allow_blank=True)


class InventoryTransactionSerializer(serializers.ModelSerializer):
    part_number = serializers.SerializerMethodField()
    part_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    reference_number = serializers.SerializerMethodField()

    class Meta:
        model = InventoryTransaction
        fields = [
            'id', 'part', 'part_number', 'part_name', 'transaction_type',
            'quantity', 'balance_after', 'unit_cost', 'total_cost',
            'purchase_order', 'work_order', 'transfer', 'reason', 'notes',
            'transaction_date', 'created_by_name', 'reference_number', 'created_at'
        ]

    def get_part_number(self, obj):
        return obj.part.part_number

    def get_part_name(self, obj):
        return obj.part.name

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_reference_number(self, obj):
        if obj.purchase_order:
            return obj.purchase_order.po_number
        if obj.work_order:
            return obj.work_order.work_order_number
        if obj.transfer:
            return obj.transfer.transfer_number
        return None


class InventoryTransactionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryTransaction
        fields = [
            'part', 'transaction_type', 'quantity', 'unit_cost',
            'reason', 'notes', 'transaction_date'
        ]

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class LowStockReportSerializer(serializers.Serializer):
    """Serializer for low stock report"""
    part_id = serializers.IntegerField()
    part_number = serializers.CharField()
    part_name = serializers.CharField()
    category_name = serializers.CharField()
    quantity_in_stock = serializers.IntegerField()
    reorder_point = serializers.IntegerField()
    quantity_on_order = serializers.IntegerField()
    needs_reorder = serializers.BooleanField()
    preferred_supplier_name = serializers.CharField()


class InventoryValueReportSerializer(serializers.Serializer):
    """Serializer for inventory value report"""
    total_parts = serializers.IntegerField()
    total_quantity = serializers.IntegerField()
    total_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    by_category = serializers.ListField()


class ServicePackagePartSerializer(serializers.ModelSerializer):
    part_name = serializers.ReadOnlyField(source='part.name')
    part_number = serializers.ReadOnlyField(source='part.part_number')
    unit_price = serializers.ReadOnlyField(source='part.selling_price')
    unit = serializers.ReadOnlyField(source='part.unit')

    class Meta:
        model = ServicePackagePart
        fields = ['id', 'part', 'part_name', 'part_number', 'quantity', 'unit', 'unit_price', 'notes']


class ServicePackageSerializer(serializers.ModelSerializer):
    parts = ServicePackagePartSerializer(many=True, read_only=True)
    category_name = serializers.ReadOnlyField(source='category.name')
    total_parts_cost = serializers.ReadOnlyField()

    class Meta:
        model = ServicePackage
        fields = [
            'id', 'name', 'description', 'category', 'category_name',
            'estimated_labor_hours', 'parts', 'total_parts_cost',
            'is_active', 'created_at'
        ]


class ServicePackageCreateSerializer(serializers.ModelSerializer):
    parts = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        required=False
    )

    class Meta:
        model = ServicePackage
        fields = [
            'name', 'description', 'category', 
            'estimated_labor_hours', 'is_active', 'parts'
        ]

    @transaction.atomic
    def create(self, validated_data):
        parts_data = validated_data.pop('parts', [])
        package = ServicePackage.objects.create(**validated_data)
        
        for item in parts_data:
            ServicePackagePart.objects.create(
                service_package=package,
                part_id=item['part_id'],
                quantity=item.get('quantity', 1),
                notes=item.get('notes', '')
            )
        return package

    @transaction.atomic
    def update(self, instance, validated_data):
        parts_data = validated_data.pop('parts', None)
        
        # Update standard fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update parts if provided
        if parts_data is not None:
            instance.parts.all().delete()
            for item in parts_data:
                ServicePackagePart.objects.create(
                    service_package=instance,
                    part_id=item['part_id'],
                    quantity=item.get('quantity', 1),
                    notes=item.get('notes', '')
                )
        
        return instance


class StockItemSerializer(serializers.ModelSerializer):
    branch_name = serializers.ReadOnlyField(source='branch.name')
    branch_code = serializers.ReadOnlyField(source='branch.code')
    
    class Meta:
        model = StockItem
        fields = [
            'id', 'part', 'branch', 'branch_name', 'branch_code',
            'quantity_in_stock', 'quantity_reserved', 'quantity_on_order',
            'available_quantity', 'reorder_point', 'reorder_quantity',
            'minimum_stock', 'maximum_stock', 'bin_location', 'shelf',
            'is_low_stock', 'is_out_of_stock', 'total_value',
            'updated_at'
        ]


class TransferItemSerializer(serializers.ModelSerializer):
    part_number = serializers.ReadOnlyField(source='part.part_number')
    part_name = serializers.ReadOnlyField(source='part.name')
    
    class Meta:
        model = TransferItem
        fields = [
            'id', 'transfer', 'part', 'part_number', 'part_name',
            'quantity_requested', 'quantity_sent', 'quantity_received',
            'notes'
        ]


class TransferApprovalSerializer(serializers.ModelSerializer):
    approver_name = serializers.SerializerMethodField()
    approver_email = serializers.SerializerMethodField()

    class Meta:
        model = TransferApproval
        fields = [
            'id', 'approver', 'approver_name', 'approver_email', 'status',
            'approved_at', 'rejected_at', 'rejection_reason', 'created_at',
            'updated_at'
        ]

    def get_approver_name(self, obj):
        return obj.approver.get_full_name() or obj.approver.username

    def get_approver_email(self, obj):
        return obj.approver.email


class TransferSerializer(serializers.ModelSerializer):
    source_branch_name = serializers.ReadOnlyField(source='source_branch.name')
    destination_branch_name = serializers.ReadOnlyField(source='destination_branch.name')
    created_by_name = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    assigned_approver_name = serializers.SerializerMethodField()
    rejected_by_name = serializers.SerializerMethodField()
    items = TransferItemSerializer(many=True, read_only=True)
    approvals = TransferApprovalSerializer(many=True, read_only=True)
    approval_progress = serializers.SerializerMethodField()
    
    class Meta:
        model = Transfer
        fields = [
            'id', 'transfer_number', 'source_branch', 'source_branch_name',
            'destination_branch', 'destination_branch_name', 'status',
            'requested_date', 'approved_date', 'shipped_date', 'received_date',
            'notes', 'rejection_reason', 'created_by', 'created_by_name',
            'submitted_by', 'submitted_by_name', 'submitted_at',
            'assigned_approver', 'assigned_approver_name',
            'approved_by', 'approved_by_name', 
            'rejected_by', 'rejected_by_name', 'rejected_at',
            'approvals', 'approval_progress',
            'items', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'transfer_number', 'status', 'created_by', 'submitted_by', 
            'submitted_at', 'approved_by', 'approved_date', 'rejected_by', 
            'rejected_at', 'received_by', 'received_date'
        ]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_submitted_by_name(self, obj):
        return obj.submitted_by.get_full_name() if obj.submitted_by else None

    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None
        
    def get_assigned_approver_name(self, obj):
        return obj.assigned_approver.get_full_name() if obj.assigned_approver else None
        
    def get_rejected_by_name(self, obj):
        return obj.rejected_by.get_full_name() if obj.rejected_by else None

    def get_approval_progress(self, obj):
        approvals = list(obj.approvals.all())
        return {
            'total': len(approvals),
            'approved': sum(1 for approval in approvals if approval.status == 'approved'),
            'pending': sum(1 for approval in approvals if approval.status == 'pending'),
            'rejected': sum(1 for approval in approvals if approval.status == 'rejected'),
        }


class TransferCreateSerializer(serializers.ModelSerializer):
    items = serializers.ListField(
        child=serializers.DictField(),
        write_only=True
    )
    
    class Meta:
        model = Transfer
        fields = ['id', 'transfer_number', 'source_branch', 'destination_branch', 'notes', 'items']
        read_only_fields = ['id', 'transfer_number']


class BulkStockAdjustmentItemSerializer(serializers.Serializer):
    """Serializer for individual items in bulk stock adjustment"""
    part_id = serializers.IntegerField(required=True)
    quantity_change = serializers.IntegerField(required=True)
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class BulkStockAdjustmentSerializer(serializers.Serializer):
    """Serializer for bulk stock adjustment"""
    adjustments = BulkStockAdjustmentItemSerializer(many=True, required=True)
    transaction_type = serializers.ChoiceField(
        choices=['adjustment', 'correction', 'damage', 'loss', 'found'],
        default='adjustment',
        required=False
    )
    reason = serializers.CharField(required=False, allow_blank=True, default='Bulk adjustment')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class BulkTransferItemSerializer(serializers.Serializer):
    """Serializer for individual items in bulk transfer"""
    part_id = serializers.IntegerField(required=True)
    quantity = serializers.IntegerField(required=True, min_value=1)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class BulkTransferSerializer(serializers.Serializer):
    """Serializer for bulk stock transfer"""
    source_branch_id = serializers.IntegerField(required=True)
    destination_branch_id = serializers.IntegerField(required=True)
    items = BulkTransferItemSerializer(many=True, required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class StockAlertSerializer(serializers.ModelSerializer):
    """Serializer for StockAlert model"""
    part_name = serializers.CharField(source='part.name', read_only=True)
    part_number = serializers.CharField(source='part.part_number', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    acknowledged_by_name = serializers.SerializerMethodField()
    
    class Meta:
        from .models import StockAlert
        model = StockAlert
        fields = [
            'id', 'part', 'part_name', 'part_number', 'branch', 'branch_name',
            'stock_item', 'alert_type', 'severity', 'status', 'current_quantity',
            'reorder_point', 'minimum_stock', 'message', 'acknowledged_by',
            'acknowledged_by_name', 'acknowledged_at', 'resolved_at',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'acknowledged_at', 'resolved_at']
    
    def get_acknowledged_by_name(self, obj):
        return obj.acknowledged_by.get_full_name() if obj.acknowledged_by else None


class StockAlertUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating StockAlert status"""
    class Meta:
        from .models import StockAlert
        model = StockAlert
        fields = ['status']


class PhysicalCountItemSerializer(serializers.ModelSerializer):
    """Serializer for PhysicalCountItem"""
    part_name = serializers.CharField(source='part.name', read_only=True)
    part_number = serializers.CharField(source='part.part_number', read_only=True)
    reconciled_by_name = serializers.SerializerMethodField()
    
    class Meta:
        from .models import PhysicalCountItem
        model = PhysicalCountItem
        fields = [
            'id', 'session', 'part', 'part_name', 'part_number', 'stock_item',
            'system_quantity', 'physical_quantity', 'discrepancy',
            'notes', 'reconciled', 'reconciled_at', 'reconciled_by',
            'reconciled_by_name', 'created_at', 'updated_at'
        ]
        read_only_fields = ['discrepancy', 'reconciled_at', 'created_at', 'updated_at']
    
    def get_reconciled_by_name(self, obj):
        return obj.reconciled_by.get_full_name() if obj.reconciled_by else None


class PhysicalCountItemCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating PhysicalCountItem"""
    class Meta:
        from .models import PhysicalCountItem
        model = PhysicalCountItem
        fields = [
            'part', 'stock_item', 'system_quantity', 'physical_quantity', 'notes'
        ]


class PhysicalCountSessionSerializer(serializers.ModelSerializer):
    """Serializer for PhysicalCountSession"""
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    completed_by_name = serializers.SerializerMethodField()
    items = PhysicalCountItemSerializer(many=True, read_only=True)
    unreconciled_count = serializers.SerializerMethodField()
    
    class Meta:
        from .models import PhysicalCountSession
        model = PhysicalCountSession
        fields = [
            'id', 'session_number', 'branch', 'branch_name', 'status',
            'count_date', 'notes', 'total_items_counted', 'total_discrepancies',
            'created_by', 'created_by_name', 'completed_by', 'completed_by_name',
            'created_at', 'updated_at', 'completed_at', 'items', 'unreconciled_count'
        ]
        read_only_fields = [
            'session_number', 'total_items_counted', 'total_discrepancies',
            'created_at', 'updated_at', 'completed_at'
        ]
    
    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None
    
    def get_completed_by_name(self, obj):
        return obj.completed_by.get_full_name() if obj.completed_by else None
    
    def get_unreconciled_count(self, obj):
        return obj.count_items.filter(reconciled=False).count()


class PhysicalCountSessionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating PhysicalCountSession"""
    class Meta:
        from .models import PhysicalCountSession
        model = PhysicalCountSession
        fields = ['branch', 'count_date', 'notes']

class ServiceBundleItemSerializer(serializers.ModelSerializer):
    part_name = serializers.ReadOnlyField(source='part.name')
    part_number = serializers.ReadOnlyField(source='part.part_number')
    unit_price = serializers.ReadOnlyField(source='part.selling_price')
    unit = serializers.ReadOnlyField(source='part.unit')

    class Meta:
        model = ServiceBundleItem
        fields = ['id', 'part', 'part_name', 'part_number', 'quantity', 'unit', 'unit_price']


class ServiceBundleSerializer(serializers.ModelSerializer):
    items = ServiceBundleItemSerializer(many=True, read_only=True)
    service_type_name = serializers.ReadOnlyField(source='service_type.name')
    created_by_name = serializers.ReadOnlyField(source='created_by.get_full_name')

    class Meta:
        model = ServiceBundle
        fields = [
            'id', 'name', 'description', 'service_type', 'service_type_name',
            'items', 'is_active', 'created_by', 'created_by_name',
            'created_at', 'updated_at'
        ]


class ServiceBundleCreateUpdateSerializer(serializers.ModelSerializer):
    items = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        required=False
    )

    class Meta:
        model = ServiceBundle
        fields = ['name', 'description', 'service_type', 'is_active', 'items']

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        validated_data['created_by'] = self.context['request'].user
        bundle = ServiceBundle.objects.create(**validated_data)
        
        for item in items_data:
            ServiceBundleItem.objects.create(
                bundle=bundle,
                part_id=item['part_id'],
                quantity=item.get('quantity', 1)
            )
        return bundle

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        if items_data is not None:
            instance.items.all().delete()
            for item in items_data:
                ServiceBundleItem.objects.create(
                    bundle=instance,
                    part_id=item['part_id'],
                    quantity=item.get('quantity', 1)
                )
        return instance
