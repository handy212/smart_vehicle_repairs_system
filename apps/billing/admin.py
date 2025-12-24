from django.contrib import admin
from django.utils.html import format_html
from apps.billing.models import (
    TaxRate, Estimate, EstimateLineItem, Invoice, Payment,
    CashierTill, CashCount, PaymentAllocation, Refund
)


@admin.register(TaxRate)
class TaxRateAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'rate_display', 'state', 'active_badge',
        'applies_to_labor', 'applies_to_parts', 'applies_to_sublet'
    ]
    list_filter = ['is_active', 'state', 'applies_to_labor', 'applies_to_parts']
    search_fields = ['name', 'description', 'state', 'county', 'city']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = [
        ('Basic Info', {
            'fields': ['name', 'description', 'rate']
        }),
        ('Applicability', {
            'fields': ['applies_to_labor', 'applies_to_parts', 'applies_to_sublet']
        }),
        ('Location', {
            'fields': ['state', 'county', 'city', 'zip_code']
        }),
        ('Status & Dates', {
            'fields': ['is_active', 'effective_date', 'expiration_date']
        }),
        ('Tracking', {
            'fields': ['created_by', 'created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]
    
    def rate_display(self, obj):
        return f"{obj.rate}%"
    rate_display.short_description = 'Rate'
    
    def active_badge(self, obj):
        if obj.is_active:
            return format_html('<span style="color: green;">● Active</span>')
        return format_html('<span style="color: gray;">○ Inactive</span>')
    active_badge.short_description = 'Status'
    
    def save_model(self, request, obj, form, change):
        if not change:  # New object
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


class EstimateLineItemInline(admin.TabularInline):
    model = EstimateLineItem
    extra = 1
    fields = [
        'item_type', 'description', 'part', 'part_number',
        'quantity', 'unit_price', 'total', 'is_taxable', 'order'
    ]
    readonly_fields = ['total']


@admin.register(Estimate)
class EstimateAdmin(admin.ModelAdmin):
    list_display = [
        'estimate_number', 'customer', 'vehicle_display', 'status_badge',
        'estimate_date', 'valid_until', 'total'
    ]
    list_filter = ['status', 'estimate_date', 'valid_until', 'created_at']
    search_fields = [
        'estimate_number', 'title', 'description',
        'customer__first_name', 'customer__last_name',
        'vehicle__vin', 'vehicle__license_plate'
    ]
    readonly_fields = [
        'estimate_number', 'labor_subtotal', 'parts_subtotal', 'sublet_subtotal',
        'subtotal', 'tax_amount', 'total', 'sent_at', 'viewed_at',
        'created_at', 'updated_at'
    ]
    inlines = [EstimateLineItemInline]
    
    fieldsets = [
        ('Estimate Info', {
            'fields': ['estimate_number', 'customer', 'vehicle', 'work_order', 'status']
        }),
        ('Dates', {
            'fields': ['estimate_date', 'valid_until', 'sent_at', 'viewed_at']
        }),
        ('Description', {
            'fields': ['title', 'description', 'notes', 'customer_notes']
        }),
        ('Financial', {
            'fields': [
                'labor_subtotal', 'parts_subtotal', 'sublet_subtotal', 'subtotal',
                'discount_amount', 'discount_percentage', 'discount_reason',
                'tax_amount', 'shop_supplies_fee', 'environmental_fee', 'total'
            ]
        }),
        ('Tracking', {
            'fields': ['created_by', 'sent_by', 'created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]
    
    def vehicle_display(self, obj):
        return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
    vehicle_display.short_description = 'Vehicle'
    
    def status_badge(self, obj):
        colors = {
            'draft': 'gray',
            'sent': 'blue',
            'viewed': 'cyan',
            'approved': 'green',
            'declined': 'red',
            'expired': 'orange',
            'converted': 'purple',
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="color: {};">● {}</span>',
            color,
            obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def save_model(self, request, obj, form, change):
        if not change:  # New object
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = [
        'invoice_number', 'customer', 'vehicle_display', 'work_order',
        'status_badge', 'invoice_date', 'due_date', 'total', 'amount_paid', 'amount_due'
    ]
    list_filter = ['status', 'invoice_date', 'due_date', 'created_at']
    search_fields = [
        'invoice_number',
        'customer__first_name', 'customer__last_name',
        'vehicle__vin', 'vehicle__license_plate',
        'work_order__wo_number'
    ]
    readonly_fields = [
        'invoice_number', 'labor_subtotal', 'parts_subtotal', 'sublet_subtotal',
        'subtotal', 'tax_amount', 'total', 'amount_paid', 'amount_due',
        'sent_at', 'viewed_at', 'paid_at'
    ]
    
    fieldsets = [
        ('Invoice Info', {
            'fields': [
                'invoice_number', 'customer', 'vehicle',
                'work_order', 'estimate', 'status'
            ]
        }),
        ('Dates', {
            'fields': ['invoice_date', 'due_date', 'sent_at', 'viewed_at', 'paid_at']
        }),
        ('Description', {
            'fields': ['description', 'notes', 'customer_notes', 'terms']
        }),
        ('Financial', {
            'fields': [
                'labor_subtotal', 'parts_subtotal', 'sublet_subtotal', 'subtotal',
                'discount_amount', 'discount_percentage', 'discount_reason',
                'tax_amount', 'shop_supplies_fee', 'environmental_fee', 'total'
            ]
        }),
        ('Payment', {
            'fields': ['amount_paid', 'amount_due']
        }),
        ('Void Info', {
            'fields': ['voided_at', 'voided_by', 'void_reason'],
            'classes': ['collapse']
        }),
        ('Tracking', {
            'fields': ['created_by', 'sent_by'],
            'classes': ['collapse']
        }),
    ]
    
    def vehicle_display(self, obj):
        return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
    vehicle_display.short_description = 'Vehicle'
    
    def status_badge(self, obj):
        colors = {
            'draft': 'gray',
            'sent': 'blue',
            'viewed': 'cyan',
            'partial': 'orange',
            'paid': 'green',
            'overdue': 'red',
            'void': 'darkgray',
            'refunded': 'purple',
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="color: {};">● {}</span>',
            color,
            obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def save_model(self, request, obj, form, change):
        if not change:  # New object
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = [
        'payment_number', 'invoice', 'customer_display',
        'payment_method_badge', 'status_badge', 'amount',
        'payment_date'
    ]
    list_filter = ['payment_method', 'status', 'payment_date']
    search_fields = [
        'payment_number', 'reference_number',
        'invoice__invoice_number',
        'customer__user__first_name', 'customer__user__last_name',
        'customer__company_name'
    ]
    readonly_fields = [
        'payment_number', 'refund_amount', 'net_amount',
        'created_at', 'updated_at'
    ]
    date_hierarchy = 'payment_date'
    
    fieldsets = [
        ('Payment Info', {
            'fields': [
                'payment_number', 'invoice', 'customer', 'payment_method',
                'amount', 'payment_date', 'status'
            ]
        }),
        ('Transaction Details', {
            'fields': [
                'reference_number', 'notes'
            ]
        }),
        ('Card Details', {
            'fields': ['card_last_four', 'card_type'],
            'classes': ['collapse']
        }),
        ('Refund Info', {
            'fields': [
                'refund_amount', 'refund_date', 'refund_reason', 'refunded_by', 'net_amount'
            ],
            'classes': ['collapse']
        }),
        ('Tracking', {
            'fields': ['processed_by', 'created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]
    
    def customer_display(self, obj):
        """Display customer name"""
        if obj.customer.user:
            return f"{obj.customer.user.first_name} {obj.customer.user.last_name}".strip() or obj.customer.user.username
        return obj.customer.company_name or "N/A"
    customer_display.short_description = 'Customer'
    
    def payment_method_badge(self, obj):
        colors = {
            'cash': 'green',
            'check': 'blue',
            'credit_card': 'purple',
            'debit_card': 'cyan',
            'ach': 'orange',
            'wire_transfer': 'teal',
            'paypal': 'navy',
            'other': 'gray',
        }
        color = colors.get(obj.payment_method, 'gray')
        return format_html(
            '<span style="color: {};">● {}</span>',
            color,
            obj.get_payment_method_display()
        )
    payment_method_badge.short_description = 'Method'
    
    def status_badge(self, obj):
        colors = {
            'pending': 'orange',
            'completed': 'green',
            'failed': 'red',
            'refunded': 'purple',
            'partially_refunded': 'cyan',
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="color: {};">● {}</span>',
            color,
            obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def save_model(self, request, obj, form, change):
        if not change:  # New object
            obj.processed_by = request.user
        super().save_model(request, obj, form, change)


# ==============================================================================
# PHASE 2: CASH & PAYMENT MANAGEMENT ADMIN
# ==============================================================================

class CashCountInline(admin.TabularInline):
    model = CashCount
    extra = 0
    readonly_fields = ['total']


@admin.register(CashierTill)
class CashierTillAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'branch', 'cashier', 'status', 'opened_at', 'closed_at',
        'opening_balance', 'closing_balance', 'variance'
    ]
    list_filter = ['status', 'branch', 'opened_at']
    search_fields = ['cashier__first_name', 'cashier__last_name']
    readonly_fields = ['opened_at', 'created_at', 'updated_at', 'duration', 'is_balanced']
    inlines = [CashCountInline]
    
    fieldsets = [
        ('Till Info', {
            'fields': ['branch', 'cashier', 'status']
        }),
        ('Times', {
            'fields': ['opened_at', 'closed_at', 'duration']
        }),
        ('Balances', {
            'fields': [
                'opening_balance', 'expected_balance',
                'closing_balance', 'variance', 'is_balanced'
            ]
        }),
        ('Notes', {
            'fields': ['notes']
        }),
    ]


@admin.register(PaymentAllocation)
class PaymentAllocationAdmin(admin.ModelAdmin):
    list_display = ['payment', 'invoice', 'amount', 'allocated_at', 'allocated_by']
    list_filter = ['allocated_at']
    search_fields = [
        'payment__payment_number',
        'invoice__invoice_number'
    ]
    readonly_fields = ['allocated_at']


@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    list_display = [
        'refund_number', 'customer', 'amount', 'status',
        'refund_method', 'requested_at'
    ]
    list_filter = ['status', 'refund_method', 'requested_at']
    search_fields = [
        'refund_number', 'customer__user__first_name',
        'customer__user__last_name', 'reference_number'
    ]
    readonly_fields = [
        'refund_number', 'requested_at', 'approved_at',
        'processed_at', 'created_at', 'updated_at'
    ]
    
    fieldsets = [
        ('Refund Info', {
            'fields': [
                'refund_number', 'original_payment', 'invoice',
                'customer', 'status'
            ]
        }),
        ('Details', {
            'fields': [
                'amount', 'reason', 'refund_method',
                'reference_number', 'till'
            ]
        }),
        ('Approval  & Processing', {
            'fields': [
                'requested_by', 'requested_at',
                'approved_by', 'approved_at',
                'processed_by', 'processed_at'
            ]
        }),
        ('Notes', {
            'fields': ['notes']
        }),
    ]
