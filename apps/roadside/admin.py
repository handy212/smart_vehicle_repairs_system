"""
Admin for roadside assistance
"""
from django.contrib import admin
from .models import RoadsideRequest, RoadsideDispatch, RoadsideNote, RoadsidePhoto


class RoadsideDispatchInline(admin.TabularInline):
    model = RoadsideDispatch
    extra = 0
    fields = ['technician', 'dispatched_at', 'dispatched_by', 'notes']
    readonly_fields = ['dispatched_at']


class RoadsideNoteInline(admin.TabularInline):
    model = RoadsideNote
    extra = 0
    fields = ['note', 'created_by', 'created_at']
    readonly_fields = ['created_at']


class RoadsidePhotoInline(admin.TabularInline):
    model = RoadsidePhoto
    extra = 0
    fields = ['image', 'photo_type', 'caption', 'taken_at', 'uploaded_by']
    readonly_fields = ['uploaded_at']


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
    inlines = [RoadsideDispatchInline, RoadsideNoteInline, RoadsidePhotoInline]
    
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


@admin.register(RoadsideDispatch)
class RoadsideDispatchAdmin(admin.ModelAdmin):
    list_display = ['request', 'technician', 'dispatched_at', 'dispatched_by']
    list_filter = ['dispatched_at']
    search_fields = ['request__request_number', 'technician__first_name', 'technician__last_name']
    readonly_fields = ['dispatched_at']


@admin.register(RoadsideNote)
class RoadsideNoteAdmin(admin.ModelAdmin):
    list_display = ['request', 'created_by', 'created_at']
    list_filter = ['created_at']
    search_fields = ['request__request_number', 'note', 'created_by__first_name', 'created_by__last_name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(RoadsidePhoto)
class RoadsidePhotoAdmin(admin.ModelAdmin):
    list_display = ['request', 'photo_type', 'caption', 'uploaded_by', 'uploaded_at']
    list_filter = ['photo_type', 'uploaded_at']
    search_fields = ['request__request_number', 'caption', 'uploaded_by__first_name', 'uploaded_by__last_name']
    readonly_fields = ['uploaded_at']
