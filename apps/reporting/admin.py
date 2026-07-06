from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from .models import DashboardWidget, ReportExportLog, ReportSchedule, SavedReport, AIAuditLog


@admin.register(ReportSchedule)
class ReportScheduleAdmin(admin.ModelAdmin):
    list_display = [
        'name', 
        'report_type_badge', 
        'frequency_badge',
        'is_active_badge',
        'next_run_date',
        'last_run_date',
        'created_by',
        'created_at'
    ]
    list_filter = ['report_type', 'frequency', 'is_active', 'created_at']
    search_fields = ['name', 'email_recipients']
    readonly_fields = ['created_at', 'updated_at', 'created_by']
    
    fieldsets = (
        ('Report Details', {
            'fields': ('name', 'report_type', 'frequency', 'email_recipients')
        }),
        ('Schedule', {
            'fields': ('is_active', 'next_run_date', 'last_run_date')
        }),
        ('Parameters', {
            'fields': ('parameters',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def report_type_badge(self, obj):
        colors = {
            'revenue': '#4CAF50',
            'work_orders': '#2196F3',
            'inventory': '#FF9800',
            'customers': '#9C27B0',
            'technician_performance': '#F44336',
            'appointments': '#00BCD4',
            'overdue_invoices': '#E91E63',
            'low_stock': '#FF5722'
        }
        color = colors.get(obj.report_type, '#757575')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px; font-weight: bold;">{}</span>',
            color,
            obj.get_report_type_display()
        )
    report_type_badge.short_description = 'Report Type'
    
    def frequency_badge(self, obj):
        colors = {
            'daily': '#4CAF50',
            'weekly': '#2196F3',
            'monthly': '#FF9800',
            'quarterly': '#9C27B0'
        }
        color = colors.get(obj.frequency, '#757575')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px;">{}</span>',
            color,
            obj.get_frequency_display()
        )
    frequency_badge.short_description = 'Frequency'
    
    def is_active_badge(self, obj):
        if obj.is_active:
            return format_html(
                '<span style="color: #4CAF50; font-weight: bold;">✓ Active</span>'
            )
        return format_html(
            '<span style="color: #F44336; font-weight: bold;">✗ Inactive</span>'
        )
    is_active_badge.short_description = 'Status'
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(SavedReport)
class SavedReportAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'report_type_badge',
        'is_public_badge',
        'created_by',
        'created_at'
    ]
    list_filter = ['report_type', 'is_public', 'created_at']
    search_fields = ['name', 'description']
    readonly_fields = ['created_at', 'updated_at', 'created_by']
    
    fieldsets = (
        ('Report Details', {
            'fields': ('name', 'report_type', 'description', 'is_public')
        }),
        ('Parameters', {
            'fields': ('parameters',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def report_type_badge(self, obj):
        colors = {
            'revenue': '#4CAF50',
            'work_orders': '#2196F3',
            'inventory': '#FF9800',
            'customers': '#9C27B0',
            'technician_performance': '#F44336',
            'appointments': '#00BCD4',
            'custom': '#607D8B'
        }
        color = colors.get(obj.report_type, '#757575')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px; font-weight: bold;">{}</span>',
            color,
            obj.get_report_type_display()
        )
    report_type_badge.short_description = 'Report Type'
    
    def is_public_badge(self, obj):
        if obj.is_public:
            return format_html(
                '<span style="color: #4CAF50; font-weight: bold;">🌐 Public</span>'
            )
        return format_html(
            '<span style="color: #757575; font-weight: bold;">🔒 Private</span>'
        )
    is_public_badge.short_description = 'Sharing'
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(DashboardWidget)
class DashboardWidgetAdmin(admin.ModelAdmin):
    list_display = [
        'user',
        'widget_type_badge',
        'position',
        'width',
        'height',
        'is_visible_badge',
        'created_at'
    ]
    list_filter = ['widget_type', 'is_visible', 'width', 'created_at']
    search_fields = ['user__email', 'user__first_name', 'user__last_name']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Widget Details', {
            'fields': ('user', 'widget_type', 'is_visible')
        }),
        ('Layout', {
            'fields': ('position', 'width', 'height')
        }),
        ('Settings', {
            'fields': ('settings',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def widget_type_badge(self, obj):
        # Group by category for colors
        metric_widgets = ['revenue_today', 'revenue_week', 'revenue_month']
        list_widgets = ['appointments_today', 'active_work_orders', 'overdue_invoices', 
                       'low_stock', 'top_technicians', 'recent_customers', 'pending_estimates']
        chart_widgets = ['chart_revenue_trend', 'chart_service_breakdown']
        
        if obj.widget_type in metric_widgets:
            color = '#4CAF50'
            icon = '📊'
        elif obj.widget_type in list_widgets:
            color = '#2196F3'
            icon = '📋'
        elif obj.widget_type in chart_widgets:
            color = '#FF9800'
            icon = '📈'
        else:
            color = '#757575'
            icon = '📦'
        
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px;">{} {}</span>',
            color,
            icon,
            obj.get_widget_type_display()
        )
    widget_type_badge.short_description = 'Widget Type'
    
    def is_visible_badge(self, obj):
        if obj.is_visible:
            return format_html(
                '<span style="color: #4CAF50; font-weight: bold;">👁 Visible</span>'
            )
        return format_html(
            '<span style="color: #757575; font-weight: bold;">👁‍🗨 Hidden</span>'
        )
    is_visible_badge.short_description = 'Visibility'


@admin.register(ReportExportLog)
class ReportExportLogAdmin(admin.ModelAdmin):
    list_display = [
        'report_type',
        'report_name',
        'export_format',
        'status',
        'created_by',
        'created_at',
    ]
    list_filter = ['report_type', 'export_format', 'status', 'created_at']
    search_fields = ['report_type', 'report_name', 'file_name', 'created_by__email']
    readonly_fields = [
        'report_type', 'report_name', 'export_format', 'status',
        'parameters', 'file_name', 'error_message', 'ip_address',
        'user_agent', 'created_by', 'created_at',
    ]


@admin.register(AIAuditLog)
class AIAuditLogAdmin(admin.ModelAdmin):
    list_display = ['feature', 'user', 'success', 'branch_id', 'created_at']
    list_filter = ['feature', 'success', 'created_at']
    search_fields = ['prompt_summary', 'output_summary', 'error_message', 'user__email']
    readonly_fields = [
        'feature', 'prompt_summary', 'output_summary', 'user', 'branch_id',
        'success', 'error_message', 'created_at',
    ]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
