"""
Admin for roadside assistance
"""
from django.contrib import admin
from .models import RoadsideRequest


@admin.register(RoadsideRequest)
class RoadsideRequestAdmin(admin.ModelAdmin):
    list_display = [
        'request_number', 'customer', 'vehicle', 'service_type',
        'status', 'breakdown_location', 'requested_at',
        'is_covered_by_subscription', 'subscription_used',
    ]
    list_filter = ['status', 'service_type', 'is_covered_by_subscription', 'requested_at']
    search_fields = ['request_number', 'customer__first_name', 'customer__last_name', 'vehicle__license_plate']
    readonly_fields = ['request_number', 'requested_at', 'updated_at']
    date_hierarchy = 'requested_at'
    
    fieldsets = (
        ('Request Information', {
            'fields': ('request_number', 'customer', 'vehicle', 'branch', 'service_type', 'status')
        }),
        ('Location', {
            'fields': ('breakdown_location', 'latitude', 'longitude', 'destination')
        }),
        ('Service Details', {
            'fields': ('description', 'customer_phone', 'tow_distance_km', 'notes')
        }),
        ('Assignment', {
            'fields': ('assigned_technician', 'dispatched_at', 'arrived_at', 'completed_at')
        }),
        ('Subscription & Billing', {
            'fields': (
                'subscription_used', 'subscription_allowance_deducted',
                'is_covered_by_subscription', 'charge_amount'
            )
        }),
        ('Timestamps', {
            'fields': ('requested_at', 'created_by', 'updated_at')
        }),
    )
