"""
Admin interface for customers app
"""
from django.contrib import admin
from django.utils.html import format_html
from .models import Customer, CustomerNote


class CustomerNoteInline(admin.TabularInline):
    """Inline admin for customer notes"""
    model = CustomerNote
    extra = 0
    fields = ['note_type', 'subject', 'content', 'is_important', 'created_by', 'created_at']
    readonly_fields = ['created_by', 'created_at']
    can_delete = False


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    """Admin interface for Customer model"""
    list_display = [
        'customer_number', 'full_name', 'company_name', 'customer_type',
        'status_badge', 'vehicle_count', 'current_balance', 'customer_since'
    ]
    list_filter = ['status', 'customer_type', 'payment_terms', 'loyalty_tier', 'customer_since']
    search_fields = [
        'customer_number', 'company_name', 'user__first_name',
        'user__last_name', 'user__email', 'user__phone', 'tags'
    ]
    readonly_fields = [
        'customer_number', 'customer_since', 'created_at', 'updated_at',
        'vehicle_count', 'available_credit'
    ]
    
    fieldsets = (
        ('Customer Information', {
            'fields': (
                'user', 'customer_number', 'customer_type', 'status', 'customer_since'
            )
        }),
        ('Business Information', {
            'fields': ('company_name', 'business_type', 'tax_id'),
            'classes': ('collapse',)
        }),
        ('Service Address', {
            'fields': (
                'service_address', 'service_region', 'service_city', 'service_area'
            )
        }),
        ('Billing Address', {
            'fields': (
                'billing_address', 'billing_region', 'billing_city', 'billing_area'
            ),
            'classes': ('collapse',)
        }),
        ('Financial Information', {
            'fields': (
                'payment_terms', 'credit_limit', 'current_balance', 'available_credit'
            )
        }),
        ('Contact & Preferences', {
            'fields': (
                'preferred_contact_method', 'marketing_emails', 'marketing_sms'
            )
        }),
        ('Loyalty Program', {
            'fields': ('loyalty_points', 'loyalty_tier', 'referred_by'),
            'classes': ('collapse',)
        }),
        ('Emergency Contact', {
            'fields': (
                'emergency_contact_name', 'emergency_contact_phone',
                'emergency_contact_relationship'
            ),
            'classes': ('collapse',)
        }),
        ('Insurance Information', {
            'fields': (
                'insurance_provider', 'insurance_policy_number', 'insurance_phone'
            ),
            'classes': ('collapse',)
        }),
        ('Additional Information', {
            'fields': ('notes', 'tags', 'vehicle_count'),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    inlines = [CustomerNoteInline]
    
    def status_badge(self, obj):
        """Display status with color badge"""
        colors = {
            'active': 'green',
            'inactive': 'gray',
            'suspended': 'red'
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px;">{}</span>',
            color, obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def full_name(self, obj):
        """Display customer full name"""
        return obj.user.get_full_name() or obj.user.username
    full_name.short_description = 'Name'
    full_name.admin_order_field = 'user__first_name'
    
    def save_model(self, request, obj, form, change):
        """Save model and handle user linking"""
        super().save_model(request, obj, form, change)


@admin.register(CustomerNote)
class CustomerNoteAdmin(admin.ModelAdmin):
    """Admin interface for Customer Notes"""
    list_display = [
        'customer', 'note_type', 'subject', 'is_important', 'created_by', 'created_at'
    ]
    list_filter = ['note_type', 'is_important', 'created_at']
    search_fields = ['customer__customer_number', 'subject', 'content']
    readonly_fields = ['created_by', 'created_at']
    
    fieldsets = (
        (None, {
            'fields': ('customer', 'note_type', 'subject', 'content', 'is_important')
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at')
        }),
    )
    
    def save_model(self, request, obj, form, change):
        """Set created_by on save"""
        if not change:  # Only on creation
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
