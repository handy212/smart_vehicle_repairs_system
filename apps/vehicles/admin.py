"""
Admin interface for vehicles app
"""
from django.contrib import admin
from django.utils.html import format_html
from .models import Vehicle, VehicleMileageHistory, VehicleDocument, VehiclePhoto


class VehicleMileageHistoryInline(admin.TabularInline):
    """Inline admin for mileage history"""
    model = VehicleMileageHistory
    extra = 0
    fields = ['mileage', 'recorded_date', 'recorded_by', 'notes']
    readonly_fields = ['recorded_by']
    can_delete = False


class VehicleDocumentInline(admin.TabularInline):
    """Inline admin for vehicle documents"""
    model = VehicleDocument
    extra = 0
    fields = ['document_type', 'title', 'file', 'expiry_date', 'uploaded_by']
    readonly_fields = ['uploaded_by', 'uploaded_at']


class VehiclePhotoInline(admin.TabularInline):
    """Inline admin for vehicle photos"""
    model = VehiclePhoto
    extra = 0
    fields = ['photo_type', 'image', 'caption', 'uploaded_by']
    readonly_fields = ['uploaded_by', 'uploaded_at']


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    """Admin interface for Vehicle model"""
    list_display = [
        'display_name', 'license_plate', 'vin', 'owner_name', 'current_mileage',
        'status_badge', 'service_due_badge', 'warranty_badge', 'created_at'
    ]
    list_filter = ['status', 'make', 'model', 'year', 'engine_type', 'transmission_type']
    search_fields = [
        'vin', 'license_plate', 'make', 'model', 'owner__user__first_name',
        'owner__user__last_name', 'owner__company_name'
    ]
    readonly_fields = [
        'display_name', 'is_due_for_service', 'warranty_active',
        'created_at', 'updated_at'
    ]
    
    fieldsets = (
        ('Owner Information', {
            'fields': ('owner',)
        }),
        ('Vehicle Identification', {
            'fields': ('vin', 'year', 'make', 'model', 'trim', 'display_name')
        }),
        ('Appearance', {
            'fields': ('exterior_color', 'interior_color')
        }),
        ('Registration', {
            'fields': ('license_plate', 'license_plate_state')
        }),
        ('Mileage', {
            'fields': ('current_mileage', 'mileage_unit')
        }),
        ('Engine & Transmission', {
            'fields': (
                'engine_type', 'engine_size', 'transmission_type',
                'fuel_tank_capacity', 'tire_size'
            ),
            'classes': ('collapse',)
        }),
        ('Condition & Warranty', {
            'fields': (
                'condition_rating', 'purchase_date', 'warranty_expiry_date',
                'warranty_type', 'warranty_coverage', 'warranty_active'
            ),
            'classes': ('collapse',)
        }),
        ('Service Information', {
            'fields': (
                'last_service_date', 'next_service_due_date',
                'next_service_due_mileage', 'is_due_for_service'
            )
        }),
        ('Status & Notes', {
            'fields': ('status', 'notes', 'tags')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    inlines = [VehicleMileageHistoryInline, VehicleDocumentInline, VehiclePhotoInline]
    
    def status_badge(self, obj):
        """Display status with color badge"""
        colors = {
            'active': 'green',
            'in_service': 'blue',
            'inactive': 'gray',
            'sold': 'orange',
            'totaled': 'red'
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 3px;">{}</span>',
            color, obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def service_due_badge(self, obj):
        """Display service due indicator"""
        if obj.is_due_for_service:
            return format_html(
                '<span style="background-color: red; color: white; padding: 3px 10px; '
                'border-radius: 3px;">DUE</span>'
            )
        return format_html(
            '<span style="background-color: green; color: white; padding: 3px 10px; '
            'border-radius: 3px;">OK</span>'
        )
    service_due_badge.short_description = 'Service'
    
    def warranty_badge(self, obj):
        """Display warranty status"""
        if obj.warranty_active:
            return format_html(
                '<span style="background-color: green; color: white; padding: 3px 10px; '
                'border-radius: 3px;">Active</span>'
            )
        return format_html(
            '<span style="background-color: gray; color: white; padding: 3px 10px; '
            'border-radius: 3px;">None</span>'
        )
    warranty_badge.short_description = 'Warranty'
    
    def owner_name(self, obj):
        """Display owner name"""
        return obj.owner.user.get_full_name() or obj.owner.user.username
    owner_name.short_description = 'Owner'
    owner_name.admin_order_field = 'owner__user__first_name'


@admin.register(VehicleMileageHistory)
class VehicleMileageHistoryAdmin(admin.ModelAdmin):
    """Admin interface for Mileage History"""
    list_display = ['vehicle', 'mileage', 'recorded_date', 'recorded_by']
    list_filter = ['recorded_date']
    search_fields = ['vehicle__vin', 'vehicle__license_plate']
    readonly_fields = ['recorded_by']
    
    def save_model(self, request, obj, form, change):
        """Set recorded_by on save"""
        if not change:
            obj.recorded_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(VehicleDocument)
class VehicleDocumentAdmin(admin.ModelAdmin):
    """Admin interface for Vehicle Documents"""
    list_display = ['vehicle', 'document_type', 'title', 'expiry_date', 'is_expired', 'uploaded_at']
    list_filter = ['document_type', 'expiry_date']
    search_fields = ['vehicle__vin', 'vehicle__license_plate', 'title']
    readonly_fields = ['uploaded_by', 'uploaded_at', 'is_expired']
    
    def save_model(self, request, obj, form, change):
        """Set uploaded_by on save"""
        if not change:
            obj.uploaded_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(VehiclePhoto)
class VehiclePhotoAdmin(admin.ModelAdmin):
    """Admin interface for Vehicle Photos"""
    list_display = ['vehicle', 'photo_type', 'caption', 'uploaded_at']
    list_filter = ['photo_type', 'uploaded_at']
    search_fields = ['vehicle__vin', 'vehicle__license_plate', 'caption']
    readonly_fields = ['uploaded_by', 'uploaded_at']
    
    def save_model(self, request, obj, form, change):
        """Set uploaded_by on save"""
        if not change:
            obj.uploaded_by = request.user
        super().save_model(request, obj, form, change)
