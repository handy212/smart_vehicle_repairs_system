from django.contrib import admin
from django.utils.html import format_html
from .models import GatePass


@admin.register(GatePass)
class GatePassAdmin(admin.ModelAdmin):
    list_display = [
        'gate_pass_number', 'work_order', 'customer', 'vehicle', 'status_badge',
        'picked_up_by_customer', 'pickup_person_display', 'issued_at', 'completed_at',
        'issued_by', 'created_at'
    ]
    list_filter = [
        'status', 'picked_up_by_customer', 'branch', 'created_at', 'issued_at', 'completed_at'
    ]
    search_fields = [
        'gate_pass_number', 'work_order__work_order_number',
        'customer__user__first_name', 'customer__user__last_name',
        'vehicle__vin', 'vehicle__license_plate', 'pickup_person_name'
    ]
    readonly_fields = [
        'gate_pass_number', 'created_at', 'updated_at', 'pickup_person_display'
    ]
    date_hierarchy = 'created_at'
    
    fieldsets = (
        ('Gate Pass Information', {
            'fields': ('gate_pass_number', 'work_order', 'branch')
        }),
        ('Customer & Vehicle', {
            'fields': ('customer', 'vehicle')
        }),
        ('Pickup Information', {
            'fields': (
                'picked_up_by_customer', 'pickup_person_name', 'pickup_person_relationship',
                'pickup_person_id_type', 'pickup_person_id_number', 'pickup_person_phone',
                'pickup_notes', 'pickup_person_display'
            )
        }),
        ('Status & Dates', {
            'fields': ('status', 'issued_at', 'completed_at')
        }),
        ('Authorization', {
            'fields': ('issued_by', 'authorized_by')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def status_badge(self, obj):
        colors = {
            'pending': 'gray',
            'issued': 'blue',
            'completed': 'green',
            'cancelled': 'red',
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px; font-weight: bold;">{}</span>',
            color, obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def pickup_person_display(self, obj):
        return obj.pickup_person_display
    pickup_person_display.short_description = 'Pickup Person'
