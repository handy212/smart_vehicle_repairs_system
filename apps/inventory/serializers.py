from rest_framework import serializers
from django.db import transaction
from decimal import Decimal
from .models import (
    PartCategory, Supplier, Part, PurchaseOrder, 
    PurchaseOrderItem, InventoryTransaction
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
            'parts_count', 'active_po_count', 'created_at'
        ]

    def get_parts_count(self, obj):
        return obj.parts.count()

    def get_active_po_count(self, obj):
        return obj.purchase_orders.filter(status__in=['submitted', 'confirmed']).count()


class SupplierDetailSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    parts_count = serializers.SerializerMethodField()
    total_po_count = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = '__all__'

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_parts_count(self, obj):
        return obj.parts.count()

    def get_total_po_count(self, obj):
        return obj.purchase_orders.count()


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
    available_quantity = serializers.ReadOnlyField()
    is_low_stock = serializers.ReadOnlyField()
    is_out_of_stock = serializers.ReadOnlyField()
    needs_reorder = serializers.ReadOnlyField()
    profit_margin = serializers.ReadOnlyField()

    class Meta:
        model = Part
        fields = [
            'id', 'part_number', 'name', 'category', 'category_name', 'category_path',
            'manufacturer', 'quantity_in_stock', 'available_quantity', 'quantity_reserved',
            'quantity_on_order', 'reorder_point', 'unit', 'cost_price', 'selling_price',
            'markup_percentage', 'profit_margin', 'bin_location', 'preferred_supplier',
            'preferred_supplier_name', 'is_low_stock', 'is_out_of_stock', 'needs_reorder',
            'is_active', 'created_at'
        ]

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    def get_category_path(self, obj):
        return obj.category.full_path if obj.category else None

    def get_preferred_supplier_name(self, obj):
        return obj.preferred_supplier.name if obj.preferred_supplier else None


class PartDetailSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()
    category_path = serializers.SerializerMethodField()
    preferred_supplier_name = serializers.SerializerMethodField()
    suppliers_list = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    available_quantity = serializers.ReadOnlyField()
    is_low_stock = serializers.ReadOnlyField()
    is_out_of_stock = serializers.ReadOnlyField()
    needs_reorder = serializers.ReadOnlyField()
    profit_margin = serializers.ReadOnlyField()
    total_value = serializers.ReadOnlyField()

    class Meta:
        model = Part
        fields = '__all__'

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


class PartCreateSerializer(serializers.ModelSerializer):
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


class PartUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Part
        fields = [
            'name', 'description', 'category', 'branch', 'manufacturer',
            'manufacturer_part_number', 'suppliers', 'preferred_supplier',
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
        fields = ['part', 'quantity', 'unit_cost', 'notes']

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than 0")
        return value


class PurchaseOrderListSerializer(serializers.ModelSerializer):
    supplier_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    total_items = serializers.ReadOnlyField()
    total_quantity = serializers.ReadOnlyField()
    received_quantity = serializers.ReadOnlyField()
    is_fully_received = serializers.ReadOnlyField()

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'supplier', 'supplier_name', 'status',
            'order_date', 'expected_delivery_date', 'total_items',
            'total_quantity', 'received_quantity', 'subtotal', 'total',
            'is_fully_received', 'created_by_name', 'created_at'
        ]

    def get_supplier_name(self, obj):
        return obj.supplier.name

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None


class PurchaseOrderDetailSerializer(serializers.ModelSerializer):
    supplier = SupplierListSerializer(read_only=True)
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()
    received_by_name = serializers.SerializerMethodField()
    total_items = serializers.ReadOnlyField()
    total_quantity = serializers.ReadOnlyField()
    received_quantity = serializers.ReadOnlyField()
    is_fully_received = serializers.ReadOnlyField()
    is_partially_received = serializers.ReadOnlyField()

    class Meta:
        model = PurchaseOrder
        fields = '__all__'

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_submitted_by_name(self, obj):
        return obj.submitted_by.get_full_name() if obj.submitted_by else None

    def get_received_by_name(self, obj):
        return obj.received_by.get_full_name() if obj.received_by else None


class PurchaseOrderCreateSerializer(serializers.ModelSerializer):
    items = PurchaseOrderItemCreateSerializer(many=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            'supplier', 'order_date', 'expected_delivery_date',
            'shipping_cost', 'tax_amount', 'notes', 'internal_notes', 'items'
        ]

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Purchase order must have at least one item")
        return value

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items')
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

    class Meta:
        model = InventoryTransaction
        fields = [
            'id', 'part', 'part_number', 'part_name', 'transaction_type',
            'quantity', 'balance_after', 'unit_cost', 'total_cost',
            'purchase_order', 'work_order', 'reason', 'notes',
            'transaction_date', 'created_by_name', 'created_at'
        ]

    def get_part_number(self, obj):
        return obj.part.part_number

    def get_part_name(self, obj):
        return obj.part.name

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None


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
    by_category = serializers.ListField()
