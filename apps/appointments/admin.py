"""
Admin interface for appointments app
"""
from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from .models import Appointment, ServiceBay, AppointmentReminder


class AppointmentReminderInline(admin.TabularInline):
    """Inline admin for appointment reminders"""
    model = AppointmentReminder
    extra = 0
    fields = ['reminder_type', 'scheduled_send_time', 'status', 'sent_at']
    readonly_fields = ['sent_at']
    can_delete = False


@admin.register(ServiceBay)
class ServiceBayAdmin(admin.ModelAdmin):
    """Admin interface for Service Bay"""
    list_display = ['name', 'bay_type', 'status_badge', 'capacity', 'is_active']
    list_filter = ['status', 'bay_type', 'is_active']
    search_fields = ['name', 'equipment_available']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'bay_type', 'status', 'is_active')
        }),
        ('Capacity & Equipment', {
            'fields': ('capacity', 'equipment_available')
        }),
        ('Notes', {
            'fields': ('notes',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def status_badge(self, obj):
        """Display status with color badge"""
        colors = {
            'available': 'green',
            'occupied': 'orange',
            'maintenance': 'red',
            'closed': 'gray'
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px;">{}</span>',
            color, obj.get_status_display()
        )
    status_badge.short_description = 'Status'


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    """Admin interface for Appointment"""
    list_display = [
        'appointment_number', 'customer_name', 'vehicle_display',
        'appointment_date', 'appointment_time', 'service_type',
        'status_badge', 'priority_badge', 'checked_in_badge', 'service_bay'
    ]
    list_filter = [
        'status', 'service_type', 'priority', 'appointment_date',
        'checked_in', 'service_bay'
    ]
    search_fields = [
        'appointment_number', 'customer__user__first_name',
        'customer__user__last_name', 'customer__company_name',
        'vehicle__vin', 'vehicle__license_plate', 'customer_concerns'
    ]
    readonly_fields = [
        'appointment_number', 'end_time', 'is_today', 'is_past', 'is_overdue',
        'technician_names', 'confirmed_by', 'confirmed_at', 'created_by',
        'check_in_time', 'cancelled_at', 'reminder_sent_at', 'created_at', 'updated_at'
    ]
    filter_horizontal = ['assigned_technicians']
    date_hierarchy = 'appointment_date'
    
    fieldsets = (
        ('Appointment Information', {
            'fields': (
                'appointment_number', 'customer', 'vehicle', 'service_type', 'priority'
            )
        }),
        ('Scheduling', {
            'fields': (
                'appointment_date', 'appointment_time', 'estimated_duration',
                'end_time', 'service_bay', 'assigned_technicians', 'technician_names'
            )
        }),
        ('Customer Requests', {
            'fields': ('customer_concerns', 'special_instructions', 'estimated_cost')
        }),
        ('Status', {
            'fields': (
                'status', 'checked_in', 'check_in_time', 'is_today',
                'is_past', 'is_overdue'
            )
        }),
        ('Confirmation', {
            'fields': (
                'confirmed_by', 'confirmed_at', 'confirmation_method'
            ),
            'classes': ('collapse',)
        }),
        ('Reminders', {
            'fields': ('reminder_sent', 'reminder_sent_at'),
            'classes': ('collapse',)
        }),
        ('Cancellation', {
            'fields': ('cancellation_reason', 'cancelled_at'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    inlines = [AppointmentReminderInline]
    
    def status_badge(self, obj):
        """Display status with color badge"""
        colors = {
            'pending': 'orange',
            'confirmed': 'blue',
            'in_progress': 'purple',
            'completed': 'green',
            'cancelled': 'red',
            'no_show': 'darkred',
            'rescheduled': 'teal'
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px;">{}</span>',
            color, obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def priority_badge(self, obj):
        """Display priority with color badge"""
        colors = {
            'low': 'gray',
            'normal': 'blue',
            'high': 'orange',
            'urgent': 'red'
        }
        color = colors.get(obj.priority, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px;">{}</span>',
            color, obj.get_priority_display()
        )
    priority_badge.short_description = 'Priority'
    
    def checked_in_badge(self, obj):
        """Display check-in status"""
        if obj.checked_in:
            return format_html(
                '<span style="background-color: green; color: white; padding: 3px 10px; '
                'border-radius: 3px;">✓ Checked In</span>'
            )
        return format_html(
            '<span style="background-color: gray; color: white; padding: 3px 10px; '
            'border-radius: 3px;">Not Checked In</span>'
        )
    checked_in_badge.short_description = 'Check-in'
    
    def customer_name(self, obj):
        """Display customer name"""
        return obj.customer.user.get_full_name() or obj.customer.user.username
    customer_name.short_description = 'Customer'
    customer_name.admin_order_field = 'customer__user__first_name'
    
    def vehicle_display(self, obj):
        """Display vehicle info"""
        return f"{obj.vehicle.display_name} ({obj.vehicle.license_plate})"
    vehicle_display.short_description = 'Vehicle'
    
    def save_model(self, request, obj, form, change):
        """Set created_by on save"""
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(AppointmentReminder)
class AppointmentReminderAdmin(admin.ModelAdmin):
    """Admin interface for Appointment Reminders"""
    list_display = [
        'appointment', 'reminder_type', 'scheduled_send_time',
        'status_badge', 'sent_at'
    ]
    list_filter = ['reminder_type', 'status', 'scheduled_send_time']
    search_fields = ['appointment__appointment_number']
    readonly_fields = ['sent_at', 'created_at']
    
    fieldsets = (
        (None, {
            'fields': (
                'appointment', 'reminder_type', 'scheduled_send_time', 'status'
            )
        }),
        ('Sending Status', {
            'fields': ('sent_at', 'error_message')
        }),
        ('Metadata', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )
    
    def status_badge(self, obj):
        """Display status with color badge"""
        colors = {
            'scheduled': 'blue',
            'sent': 'green',
            'failed': 'red',
            'cancelled': 'gray'
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px;">{}</span>',
            color, obj.get_status_display()
        )
    status_badge.short_description = 'Status'
