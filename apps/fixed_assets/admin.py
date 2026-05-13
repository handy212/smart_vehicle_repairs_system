from django.contrib import admin
from .models import (
    AssetCategory,
    FixedAsset,
    DepreciationSchedule,
    AssetMaintenance,
    AssetAcquisitionRequest,
    AssetAcquisitionApproval,
)


@admin.register(AssetCategory)
class AssetCategoryAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'default_useful_life_years', 'default_depreciation_method',
        'is_active', 'created_at'
    ]
    list_filter = ['is_active', 'default_depreciation_method']
    search_fields = ['name', 'description']
    ordering = ['name']


@admin.register(FixedAsset)
class FixedAssetAdmin(admin.ModelAdmin):
    list_display = [
        'asset_number', 'name', 'category', 'acquisition_cost',
        'net_book_value', 'status', 'branch', 'acquisition_date'
    ]
    list_filter = ['status', 'category', 'branch', 'depreciation_method']
    search_fields = ['asset_number', 'name', 'serial_number', 'description']
    readonly_fields = ['accumulated_depreciation', 'net_book_value', 'last_depreciation_date']
    ordering = ['-created_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('asset_number', 'name', 'description', 'category', 'status')
        }),
        ('Financial Information', {
            'fields': (
                'acquisition_cost', 'acquisition_date', 'salvage_value',
                'accumulated_depreciation', 'net_book_value', 'last_depreciation_date'
            )
        }),
        ('Depreciation Settings', {
            'fields': (
                'depreciation_method', 'useful_life_years', 'depreciation_start_date',
                'declining_balance_rate', 'total_units', 'units_produced'
            )
        }),
        ('GL Account Codes', {
            'fields': (
                'gl_asset_account_code', 'gl_depreciation_expense_account_code',
                'gl_accumulated_depreciation_account_code'
            ),
            'classes': ('collapse',)
        }),
        ('Location & Details', {
            'fields': (
                'branch', 'location', 'manufacturer', 'model_number',
                'serial_number', 'purchase_order', 'supplier', 'warranty_expiration'
            )
        }),
        ('Disposal Information', {
            'fields': (
                'disposal_date', 'disposal_method', 'disposal_proceeds', 'disposal_notes'
            ),
            'classes': ('collapse',)
        }),
        ('Additional', {
            'fields': ('notes', 'created_by'),
            'classes': ('collapse',)
        }),
    )


@admin.register(DepreciationSchedule)
class DepreciationScheduleAdmin(admin.ModelAdmin):
    list_display = [
        'asset', 'period_start_date', 'period_end_date',
        'depreciation_amount', 'closing_book_value', 'is_posted', 'posted_at'
    ]
    list_filter = ['is_posted', 'period_start_date']
    search_fields = ['asset__asset_number', 'asset__name']
    readonly_fields = [
        'opening_book_value', 'depreciation_amount', 'accumulated_depreciation',
        'closing_book_value', 'posted_at', 'journal_entry_id'
    ]
    ordering = ['-period_start_date']


@admin.register(AssetMaintenance)
class AssetMaintenanceAdmin(admin.ModelAdmin):
    list_display = [
        'asset', 'maintenance_type', 'maintenance_date',
        'cost', 'performed_by', 'next_maintenance_date'
    ]
    list_filter = ['maintenance_type', 'maintenance_date']
    search_fields = ['asset__asset_number', 'asset__name', 'description', 'performed_by']
    ordering = ['-maintenance_date']
    
    fieldsets = (
        ('Maintenance Information', {
            'fields': (
                'asset', 'maintenance_type', 'maintenance_date',
                'description', 'cost', 'performed_by'
            )
        }),
        ('Scheduling', {
            'fields': ('next_maintenance_date', 'notes')
        }),
        ('Links', {
            'fields': ('invoice', 'created_by'),
            'classes': ('collapse',)
        }),
    )


class AssetAcquisitionApprovalInline(admin.TabularInline):
    model = AssetAcquisitionApproval
    extra = 0
    readonly_fields = ['approver', 'status', 'approved_at', 'rejected_at', 'created_at']


@admin.register(AssetAcquisitionRequest)
class AssetAcquisitionRequestAdmin(admin.ModelAdmin):
    list_display = [
        'request_number',
        'status',
        'title',
        'proposed_asset_name',
        'branch',
        'expected_acquisition_cost',
        'requested_by',
        'created_at',
    ]
    list_filter = ['status', 'branch', 'category']
    search_fields = ['request_number', 'title', 'proposed_asset_name']
    readonly_fields = ['request_number', 'created_at', 'updated_at']
    inlines = [AssetAcquisitionApprovalInline]
    ordering = ['-created_at']


@admin.register(AssetAcquisitionApproval)
class AssetAcquisitionApprovalAdmin(admin.ModelAdmin):
    list_display = ['acquisition_request', 'approver', 'status', 'created_at']
    list_filter = ['status']
