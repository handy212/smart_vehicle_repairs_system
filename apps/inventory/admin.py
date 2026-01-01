from django.contrib import admin
from django.utils.html import format_html
from .models import (
    PartCategory, Supplier, Part, PurchaseOrder,
    PurchaseOrderItem, InventoryTransaction,
    ServicePackage, ServicePackagePart
)


@admin.register(PartCategory)
class PartCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'parent', 'full_path', 'is_active_badge', 'parts_count', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'description']
    readonly_fields = ['created_at', 'updated_at', 'full_path']
    
    def is_active_badge(self, obj):
        if obj.is_active:
            return format_html('<span style="color: green; font-weight: bold;">✓ Active</span>')
        return format_html('<span style="color: red;">✗ Inactive</span>')
    is_active_badge.short_description = 'Status'
    
    def parts_count(self, obj):
        return obj.parts.count()
    parts_count.short_description = 'Parts'


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ['name', 'supplier_code', 'supplier_type', 'contact_person', 
                    'email', 'phone', 'is_active_badge', 'is_preferred_badge', 'created_at']
    list_filter = ['supplier_type', 'is_active', 'is_preferred', 'created_at']
    search_fields = ['name', 'supplier_code', 'contact_person', 'email', 'city']
    readonly_fields = ['created_at', 'updated_at', 'created_by']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'supplier_code', 'supplier_type')
        }),
        ('Contact Information', {
            'fields': ('contact_person', 'email', 'phone', 'fax', 'website')
        }),
        ('Address', {
            'fields': ('address_line1', 'address_line2', 'city', 'state', 
                      'postal_code', 'country')
        }),
        ('Business Details', {
            'fields': ('tax_id', 'payment_terms', 'credit_limit')
        }),
        ('Status', {
            'fields': ('is_active', 'is_preferred')
        }),
        ('Notes', {
            'fields': ('notes',)
        }),
        ('Tracking', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def is_active_badge(self, obj):
        if obj.is_active:
            return format_html('<span style="color: green; font-weight: bold;">✓ Active</span>')
        return format_html('<span style="color: red;">✗ Inactive</span>')
    is_active_badge.short_description = 'Active'
    
    def is_preferred_badge(self, obj):
        if obj.is_preferred:
            return format_html('<span style="color: gold; font-weight: bold;">★ Preferred</span>')
        return ''
    is_preferred_badge.short_description = 'Preferred'
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(Part)
class PartAdmin(admin.ModelAdmin):
    list_display = ['part_number', 'name', 'category', 'quantity_in_stock', 
                    'stock_status', 'cost_price', 'selling_price', 'profit_margin',
                    'is_active_badge']
    list_filter = ['category', 'is_active', 'manufacturer', 'is_taxable', 'is_core', 'created_at']
    search_fields = ['part_number', 'name', 'description', 'manufacturer', 
                     'manufacturer_part_number', 'bin_location']
    readonly_fields = ['quantity_reserved', 'quantity_on_order', 'available_quantity',
                       'profit_margin', 'total_value', 'last_cost_update', 
                       'last_price_update', 'created_at', 'updated_at', 'created_by']
    filter_horizontal = ['suppliers']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('part_number', 'name', 'description', 'category')
        }),
        ('Manufacturer', {
            'fields': ('manufacturer', 'manufacturer_part_number')
        }),
        ('Suppliers', {
            'fields': ('suppliers', 'preferred_supplier')
        }),
        ('Inventory', {
            'fields': ('quantity_in_stock', 'quantity_reserved', 'quantity_on_order',
                      'available_quantity', 'reorder_point', 'reorder_quantity',
                      'minimum_stock', 'maximum_stock', 'unit')
        }),
        ('Pricing', {
            'fields': ('cost_price', 'selling_price', 'markup_percentage', 
                      'list_price', 'profit_margin', 'total_value')
        }),
        ('Location', {
            'fields': ('bin_location', 'shelf')
        }),
        ('Specifications', {
            'fields': ('weight', 'dimensions', 'compatible_makes', 
                      'compatible_models', 'compatible_years'),
            'classes': ('collapse',)
        }),
        ('Warranty', {
            'fields': ('warranty_months', 'warranty_notes'),
            'classes': ('collapse',)
        }),
        ('Image', {
            'fields': ('image',)
        }),
        ('Status & Flags', {
            'fields': ('is_active', 'is_taxable', 'is_core', 'core_charge')
        }),
        ('Tracking', {
            'fields': ('last_cost_update', 'last_price_update', 'created_by',
                      'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def stock_status(self, obj):
        if obj.is_out_of_stock:
            return format_html(
                '<span style="background-color: red; color: white; padding: 3px 10px; '
                'border-radius: 3px; font-weight: bold;">OUT OF STOCK</span>'
            )
        elif obj.is_low_stock:
            return format_html(
                '<span style="background-color: orange; color: white; padding: 3px 10px; '
                'border-radius: 3px; font-weight: bold;">LOW STOCK</span>'
            )
        return format_html(
            '<span style="background-color: green; color: white; padding: 3px 10px; '
            'border-radius: 3px;">✓ OK</span>'
        )
    stock_status.short_description = 'Stock Status'
    
    def is_active_badge(self, obj):
        if obj.is_active:
            return format_html('<span style="color: green; font-weight: bold;">✓</span>')
        return format_html('<span style="color: red;">✗</span>')
    is_active_badge.short_description = 'Active'
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0
    fields = ['part', 'quantity', 'quantity_received', 'unit_cost', 'total', 'notes']
    readonly_fields = ['total']


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ['po_number', 'supplier', 'status_badge', 'order_date', 
                    'expected_delivery_date', 'total_items', 'total', 'created_at']
    list_filter = ['status', 'order_date', 'expected_delivery_date', 'created_at']
    search_fields = ['po_number', 'supplier__name', 'notes']
    readonly_fields = ['po_number', 'subtotal', 'total', 'total_items', 'total_quantity',
                       'received_quantity', 'is_fully_received', 'created_at', 'updated_at',
                       'created_by', 'submitted_by', 'submitted_at', 'received_by']
    
    fieldsets = (
        ('Purchase Order Information', {
            'fields': ('po_number', 'supplier', 'status')
        }),
        ('Dates', {
            'fields': ('order_date', 'expected_delivery_date', 'received_date')
        }),
        ('Financial', {
            'fields': ('subtotal', 'tax_amount', 'shipping_cost', 'total')
        }),
        ('Status Details', {
            'fields': ('total_items', 'total_quantity', 'received_quantity', 'is_fully_received')
        }),
        ('Notes', {
            'fields': ('notes', 'internal_notes')
        }),
        ('Tracking', {
            'fields': ('created_by', 'created_at', 'submitted_by', 'submitted_at',
                      'received_by', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    inlines = [PurchaseOrderItemInline]
    
    def status_badge(self, obj):
        colors = {
            'draft': 'gray',
            'submitted': 'blue',
            'confirmed': 'cyan',
            'partially_received': 'orange',
            'received': 'green',
            'cancelled': 'red',
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px; font-weight: bold;">{}</span>',
            color, obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(PurchaseOrderItem)
class PurchaseOrderItemAdmin(admin.ModelAdmin):
    list_display = ['purchase_order', 'part', 'quantity', 'quantity_received',
                    'remaining_quantity', 'unit_cost', 'total']
    list_filter = ['purchase_order__status', 'received_date']
    search_fields = ['purchase_order__po_number', 'part__part_number', 'part__name']
    readonly_fields = ['total', 'remaining_quantity', 'is_fully_received']


@admin.register(InventoryTransaction)
class InventoryTransactionAdmin(admin.ModelAdmin):
    list_display = ['part', 'transaction_type', 'quantity', 'balance_after',
                    'total_cost', 'transaction_date', 'created_by_name']
    list_filter = ['transaction_type', 'transaction_date', 'created_at']
    search_fields = ['part__part_number', 'part__name', 'reason', 'notes']
    readonly_fields = ['balance_after', 'created_at', 'created_by']
    date_hierarchy = 'transaction_date'
    
    def created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else ''
    created_by_name.short_description = 'Created By'


class ServicePackagePartInline(admin.TabularInline):
    model = ServicePackagePart
    extra = 1
    autocomplete_fields = ['part']


@admin.register(ServicePackage)
class ServicePackageAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'estimated_labor_hours', 'total_parts_cost', 'is_active']
    list_filter = ['category', 'is_active']
    search_fields = ['name', 'description']
    inlines = [ServicePackagePartInline]

