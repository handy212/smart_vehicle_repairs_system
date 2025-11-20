from django.contrib import admin
from django.utils.html import format_html
from .models import (
    WorkOrder, ServiceTask, WorkOrderPart,
    TechnicianTimeLog, WorkOrderNote, WorkOrderPhoto, RepeatVisitAlert
)


class ServiceTaskInline(admin.TabularInline):
    model = ServiceTask
    extra = 0
    fields = ['sequence_order', 'task_type', 'description', 'status', 'assigned_to', 
              'estimated_hours', 'actual_hours', 'labor_cost']
    readonly_fields = ['labor_cost']


class WorkOrderPartInline(admin.TabularInline):
    model = WorkOrderPart
    extra = 0
    fields = ['part_number', 'part_name', 'quantity', 'unit_cost', 
              'markup_percentage', 'selling_price', 'status']
    readonly_fields = ['total_cost', 'selling_price']


class WorkOrderNoteInline(admin.TabularInline):
    model = WorkOrderNote
    extra = 0
    fields = ['note_type', 'note', 'is_important', 'is_customer_visible', 'created_by']
    readonly_fields = ['created_by', 'created_at']


class TechnicianTimeLogInline(admin.TabularInline):
    model = TechnicianTimeLog
    extra = 0
    fields = ['technician', 'clock_in', 'clock_out', 'duration_hours', 'labor_cost', 'is_billable']
    readonly_fields = ['duration_hours', 'labor_cost']


@admin.register(WorkOrder)
class WorkOrderAdmin(admin.ModelAdmin):
    list_display = ['work_order_number', 'customer', 'vehicle', 'status_badge', 
                    'priority_badge', 'primary_technician', 'estimated_total', 
                    'actual_total', 'created_at', 'is_overdue_badge']
    list_filter = ['status', 'priority', 'is_customer_waiting', 'requires_approval', 
                   'approved_by_customer', 'quality_check_required', 'quality_check_completed',
                   'is_warranty', 'is_recall', 'is_warranty_rework', 'created_at']
    search_fields = ['work_order_number', 'customer__user__first_name', 
                     'customer__user__last_name', 'vehicle__vin', 'vehicle__license_plate',
                     'customer_concerns', 'diagnosis_notes']
    readonly_fields = ['work_order_number', 'created_at', 'updated_at', 'started_at', 
                       'completed_at', 'estimated_total', 'actual_total', 'is_overdue',
                       'days_in_shop', 'cost_variance', 'cost_variance_percentage']
    filter_horizontal = ['assigned_technicians']
    date_hierarchy = 'created_at'
    
    fieldsets = (
        ('Work Order Information', {
            'fields': ('work_order_number', 'status', 'priority', 'appointment')
        }),
        ('Customer & Vehicle', {
            'fields': ('customer', 'vehicle', 'odometer_in', 'odometer_out')
        }),
        ('Technician Assignment', {
            'fields': ('primary_technician', 'assigned_technicians')
        }),
        ('Customer Information', {
            'fields': ('customer_concerns', 'special_instructions')
        }),
        ('Diagnosis', {
            'fields': ('diagnosis_notes', 'diagnosis_completed_at', 'diagnosis_by'),
            'classes': ('collapse',)
        }),
        ('Approval', {
            'fields': ('requires_approval', 'approval_requested_at', 'approved_by_customer',
                      'approved_at', 'approval_method', 'approval_notes'),
            'classes': ('collapse',)
        }),
        ('Cost Estimates', {
            'fields': ('estimated_labor_hours', 'estimated_labor_cost', 
                      'estimated_parts_cost', 'estimated_total')
        }),
        ('Actual Costs', {
            'fields': ('actual_labor_hours', 'actual_labor_cost', 
                      'actual_parts_cost', 'actual_total', 'cost_variance', 
                      'cost_variance_percentage')
        }),
        ('Timing', {
            'fields': ('created_at', 'started_at', 'estimated_completion', 
                      'completed_at', 'days_in_shop', 'is_overdue')
        }),
        ('Quality Control', {
            'fields': ('quality_check_required', 'quality_check_completed', 
                      'quality_check_by', 'quality_check_at', 'quality_check_notes',
                      'quality_check_passed'),
            'classes': ('collapse',)
        }),
        ('Flags', {
            'fields': ('is_warranty', 'is_recall', 'is_customer_waiting')
        }),
        ('Repeat Visit / Warranty Rework', {
            'fields': ('is_warranty_rework', 'related_work_order', 'warranty_reason'),
            'classes': ('collapse',)
        }),
        ('Tracking', {
            'fields': ('created_by',),
            'classes': ('collapse',)
        }),
    )
    
    inlines = [ServiceTaskInline, WorkOrderPartInline, TechnicianTimeLogInline, WorkOrderNoteInline]
    
    def status_badge(self, obj):
        colors = {
            'draft': 'gray',
            'intake': 'blue',
            'diagnosis': 'cyan',
            'awaiting_approval': 'orange',
            'approved': 'green',
            'in_progress': 'blue',
            'paused': 'red',
            'quality_check': 'purple',
            'completed': 'green',
            'invoiced': 'teal',
            'closed': 'gray',
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px; font-weight: bold;">{}</span>',
            color, obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def priority_badge(self, obj):
        colors = {'low': '#gray', 'normal': 'green', 'high': 'orange', 'urgent': 'red'}
        color = colors.get(obj.priority, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px;">{}</span>',
            color, obj.get_priority_display()
        )
    priority_badge.short_description = 'Priority'
    
    def is_overdue_badge(self, obj):
        if obj.is_overdue:
            return format_html(
                '<span style="color: red; font-weight: bold;">⚠ OVERDUE</span>'
            )
        return format_html('<span style="color: green;">✓</span>')
    is_overdue_badge.short_description = 'Overdue'
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(ServiceTask)
class ServiceTaskAdmin(admin.ModelAdmin):
    list_display = ['work_order', 'description', 'task_type', 'status_badge', 
                    'assigned_to', 'estimated_hours', 'actual_hours', 'labor_cost']
    list_filter = ['status', 'task_type', 'work_order__status']
    search_fields = ['description', 'work_order__work_order_number']
    readonly_fields = ['labor_cost', 'created_at', 'updated_at']
    
    def status_badge(self, obj):
        colors = {'pending': 'gray', 'in_progress': 'blue', 'completed': 'green', 'skipped': 'red'}
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px;">{}</span>',
            color, obj.get_status_display()
        )
    status_badge.short_description = 'Status'


@admin.register(WorkOrderPart)
class WorkOrderPartAdmin(admin.ModelAdmin):
    list_display = ['work_order', 'part_number', 'part_name', 'quantity', 
                    'unit_cost', 'selling_price', 'status_badge']
    list_filter = ['status', 'work_order__status']
    search_fields = ['part_number', 'part_name', 'work_order__work_order_number']
    readonly_fields = ['total_cost', 'selling_price', 'created_at', 'updated_at']
    
    def status_badge(self, obj):
        colors = {
            'pending': 'gray', 'ordered': 'blue', 'received': 'cyan', 
            'installed': 'green', 'returned': 'red'
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px;">{}</span>',
            color, obj.get_status_display()
        )
    status_badge.short_description = 'Status'


@admin.register(TechnicianTimeLog)
class TechnicianTimeLogAdmin(admin.ModelAdmin):
    list_display = ['work_order', 'technician', 'clock_in', 'clock_out', 
                    'duration_hours', 'labor_cost', 'is_billable', 'is_approved_badge']
    list_filter = ['is_billable', 'is_approved', 'technician']
    search_fields = ['work_order__work_order_number', 'technician__first_name', 
                     'technician__last_name', 'description']
    readonly_fields = ['duration_hours', 'labor_cost', 'created_at', 'updated_at']
    
    def is_approved_badge(self, obj):
        if obj.is_approved:
            return format_html('<span style="color: green; font-weight: bold;">✓ Approved</span>')
        return format_html('<span style="color: orange;">Pending</span>')
    is_approved_badge.short_description = 'Approval'


@admin.register(WorkOrderNote)
class WorkOrderNoteAdmin(admin.ModelAdmin):
    list_display = ['work_order', 'note_type', 'note_preview', 'is_important_badge', 
                    'is_customer_visible', 'created_by', 'created_at']
    list_filter = ['note_type', 'is_important', 'is_customer_visible', 'created_at']
    search_fields = ['work_order__work_order_number', 'note']
    readonly_fields = ['created_by', 'created_at', 'updated_at']
    
    def note_preview(self, obj):
        return obj.note[:100] + '...' if len(obj.note) > 100 else obj.note
    note_preview.short_description = 'Note'
    
    def is_important_badge(self, obj):
        if obj.is_important:
            return format_html('<span style="color: red; font-weight: bold;">⚠ Important</span>')
        return ''
    is_important_badge.short_description = 'Flag'


@admin.register(WorkOrderPhoto)
class WorkOrderPhotoAdmin(admin.ModelAdmin):
    list_display = ['work_order', 'photo_type', 'caption', 'taken_at', 'taken_by']
    list_filter = ['photo_type', 'taken_at']
    search_fields = ['work_order__work_order_number', 'caption', 'description']
    readonly_fields = ['created_at']


@admin.register(RepeatVisitAlert)
class RepeatVisitAlertAdmin(admin.ModelAdmin):
    list_display = ['work_order', 'related_work_order', 'days_since_previous', 
                    'similarity_score', 'marked_as_warranty', 'detected_at', 'resolved_by']
    list_filter = ['marked_as_warranty', 'detected_at']
    search_fields = ['work_order__work_order_number', 'related_work_order__work_order_number']
    readonly_fields = ['detected_at', 'days_since_previous', 'similarity_score']
    date_hierarchy = 'detected_at'
    
    fieldsets = (
        ('Alert Information', {
            'fields': ('work_order', 'related_work_order', 'detected_at')
        }),
        ('Match Details', {
            'fields': ('days_since_previous', 'similarity_score')
        }),
        ('Resolution', {
            'fields': ('marked_as_warranty', 'resolved_by')
        }),
    )

