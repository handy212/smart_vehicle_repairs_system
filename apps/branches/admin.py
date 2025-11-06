"""
Admin configuration for branches app
"""
from django.contrib import admin
from django.utils.translation import gettext_lazy as _
from .models import Branch


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    """Admin interface for Branch model"""
    
    list_display = [
        'name', 'code', 'city', 'state', 'phone', 
        'is_active', 'is_headquarters', 'staff_count', 
        'manager_count', 'created_at'
    ]
    list_filter = ['is_active', 'is_headquarters', 'state', 'city', 'created_at']
    search_fields = ['name', 'code', 'city', 'address', 'phone', 'email']
    ordering = ['name']
    date_hierarchy = 'created_at'
    
    readonly_fields = [
        'created_at', 'updated_at', 'created_by',
        'staff_count', 'manager_count', 'full_address'
    ]
    
    fieldsets = (
        (_('Basic Information'), {
            'fields': ('name', 'code', 'description')
        }),
        (_('Contact Information'), {
            'fields': ('phone', 'email', 'fax')
        }),
        (_('Address'), {
            'fields': ('address', 'city', 'state', 'zip_code', 'country', 'full_address')
        }),
        (_('Operational Settings'), {
            'fields': (
                'is_active', 'is_headquarters', 
                'opening_time', 'closing_time', 'timezone'
            )
        }),
        (_('Document Sequences'), {
            'fields': (
                'next_workorder_number', 'next_estimate_number',
                'next_invoice_number', 'next_diagnosis_number',
                'next_inspection_number'
            ),
            'classes': ('collapse',),
            'description': 'Current sequence numbers for document generation. Only modify if necessary.'
        }),
        (_('Statistics'), {
            'fields': ('staff_count', 'manager_count'),
            'classes': ('collapse',)
        }),
        (_('Metadata'), {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def save_model(self, request, obj, form, change):
        """Set created_by on new branches"""
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
    
    def get_queryset(self, request):
        """Optimize queryset with prefetch"""
        qs = super().get_queryset(request)
        return qs.prefetch_related('staff_members', 'managers')
