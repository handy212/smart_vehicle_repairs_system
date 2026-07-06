from django.contrib import admin
from django.utils.html import format_html
from apps.inspections.models import (
    InspectionTemplate, InspectionCategory, InspectionItem,
    VehicleInspection, InspectionResult, InspectionPhoto
)


class InspectionCategoryInline(admin.TabularInline):
    model = InspectionCategory
    extra = 0
    fields = ['name', 'description', 'order']


class InspectionItemInline(admin.TabularInline):
    model = InspectionItem
    extra = 0
    fields = [
        'name', 'item_type', 'measurement_unit',
        'min_acceptable', 'max_acceptable', 'is_critical', 'order'
    ]


@admin.register(InspectionTemplate)
class InspectionTemplateAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'category_count', 'item_count', 'is_active_badge',
        'is_default_badge', 'created_at'
    ]
    list_filter = ['is_active', 'is_default', 'created_at']
    search_fields = ['name', 'description']
    readonly_fields = ['created_at', 'updated_at']
    inlines = [InspectionCategoryInline]
    
    fieldsets = [
        ('Template Info', {
            'fields': ['name', 'description', 'is_active', 'is_default']
        }),
        ('Requirements', {
            'fields': [
                'requires_odometer', 'requires_technician_signature',
                'requires_customer_signature'
            ]
        }),
        ('Media Settings', {
            'fields': ['allows_photos', 'allows_video']
        }),
        ('Tracking', {
            'fields': ['created_by', 'created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]
    
    def category_count(self, obj):
        count = obj.categories.count()
        return format_html('<span style="font-weight: bold;">{}</span>', count)
    category_count.short_description = 'Categories'
    
    def item_count(self, obj):
        count = InspectionItem.objects.filter(category__template=obj).count()
        return format_html('<span style="font-weight: bold;">{}</span>', count)
    item_count.short_description = 'Items'
    
    def is_active_badge(self, obj):
        if obj.is_active:
            return format_html('<span style="color: green;">● Active</span>')
        return format_html('<span style="color: gray;">○ Inactive</span>')
    is_active_badge.short_description = 'Status'
    
    def is_default_badge(self, obj):
        if obj.is_default:
            return format_html('<span style="color: blue;">★ Default</span>')
        return format_html('<span style="color: lightgray;">☆</span>')
    is_default_badge.short_description = 'Default'
    
    def save_model(self, request, obj, form, change):
        if not change:  # New object
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(InspectionCategory)
class InspectionCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'template', 'item_count', 'order']
    list_filter = ['template']
    search_fields = ['name', 'description']
    inlines = [InspectionItemInline]
    
    def item_count(self, obj):
        return obj.items.count()
    item_count.short_description = 'Items'


@admin.register(InspectionItem)
class InspectionItemAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'category', 'item_type', 'is_critical_badge',
        'measurement_unit', 'order'
    ]
    list_filter = ['item_type', 'is_critical', 'category__template']
    search_fields = ['name', 'description']
    
    fieldsets = [
        ('Item Info', {
            'fields': ['category', 'name', 'description', 'item_type', 'is_critical']
        }),
        ('Measurement Settings', {
            'fields': ['measurement_unit', 'min_acceptable', 'max_acceptable'],
            'classes': ['collapse']
        }),
        ('Display', {
            'fields': ['order']
        }),
    ]
    
    def is_critical_badge(self, obj):
        if obj.is_critical:
            return format_html('<span style="color: red;">⚠ Critical</span>')
        return format_html('<span style="color: gray;">○</span>')
    is_critical_badge.short_description = 'Critical'


class InspectionResultInline(admin.TabularInline):
    model = InspectionResult
    extra = 0
    fields = [
        'inspection_item', 'result', 'measurement_value',
        'condition', 'needs_immediate_attention'
    ]
    readonly_fields = ['inspection_item']


@admin.register(VehicleInspection)
class VehicleInspectionAdmin(admin.ModelAdmin):
    list_display = [
        'inspection_number', 'vehicle_display', 'template',
        'status_badge', 'overall_result_badge', 'inspection_date',
        'performed_by_name', 'completion_badge'
    ]
    list_filter = ['status', 'overall_result', 'template', 'inspection_date']
    search_fields = [
        'inspection_number', 'vehicle__vin', 'vehicle__license_plate',
        'notes'
    ]
    readonly_fields = [
        'inspection_number', 'completion_percentage', 'pass_count',
        'fail_count', 'advisory_count', 'has_critical_issues',
        'created_at', 'updated_at', 'completed_at'
    ]
    inlines = [InspectionResultInline]
    date_hierarchy = 'inspection_date'
    
    fieldsets = [
        ('Inspection Info', {
            'fields': [
                'inspection_number', 'vehicle', 'work_order',
                'template', 'inspection_date', 'odometer_reading'
            ]
        }),
        ('Status', {
            'fields': ['status', 'overall_result']
        }),
        ('Personnel', {
            'fields': ['performed_by', 'approved_by']
        }),
        ('Signatures', {
            'fields': ['technician_signature', 'customer_signature'],
            'classes': ['collapse']
        }),
        ('Notes & Recommendations', {
            'fields': ['notes', 'recommendations']
        }),
        ('Statistics', {
            'fields': [
                'completion_percentage', 'pass_count', 'fail_count',
                'advisory_count', 'has_critical_issues'
            ],
            'classes': ['collapse']
        }),
        ('Timestamps', {
            'fields': ['completed_at', 'sent_to_customer_at', 'created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]
    
    def vehicle_display(self, obj):
        return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
    vehicle_display.short_description = 'Vehicle'
    
    def performed_by_name(self, obj):
        return f"{obj.performed_by.first_name} {obj.performed_by.last_name}"
    performed_by_name.short_description = 'Performed By'
    
    def status_badge(self, obj):
        colors = {
            'in_progress': 'orange',
            'completed': 'green',
            'approved': 'blue',
            'rejected': 'red',
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="color: {};">● {}</span>',
            color,
            obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def overall_result_badge(self, obj):
        if not obj.overall_result:
            return format_html('<span style="color: gray;">-</span>')
        
        colors = {
            'pass': 'green',
            'pass_with_advisory': 'orange',
            'fail': 'red',
            'needs_attention': 'darkorange',
        }
        icons = {
            'pass': '✓',
            'pass_with_advisory': '⚠',
            'fail': '✗',
            'needs_attention': '⚡',
        }
        color = colors.get(obj.overall_result, 'gray')
        icon = icons.get(obj.overall_result, '?')
        return format_html(
            '<span style="color: {};">{} {}</span>',
            color,
            icon,
            obj.get_overall_result_display()
        )
    overall_result_badge.short_description = 'Result'
    
    def completion_badge(self, obj):
        percentage = obj.completion_percentage
        if percentage == 100:
            color = 'green'
        elif percentage >= 50:
            color = 'orange'
        else:
            color = 'red'
        return format_html(
            '<span style="color: {};">{}%</span>',
            color,
            percentage
        )
    completion_badge.short_description = 'Complete'
    
    def save_model(self, request, obj, form, change):
        if not change:  # New object
            obj.performed_by = request.user
        super().save_model(request, obj, form, change)


class InspectionPhotoInline(admin.TabularInline):
    model = InspectionPhoto
    extra = 0
    fields = ['image', 'caption', 'order']


@admin.register(InspectionResult)
class InspectionResultAdmin(admin.ModelAdmin):
    list_display = [
        'inspection_number', 'item_name', 'result_badge',
        'condition_badge', 'attention_badge', 'estimated_cost'
    ]
    list_filter = [
        'result', 'condition', 'needs_immediate_attention',
        'inspection__status', 'inspection_item__is_critical'
    ]
    search_fields = [
        'inspection__inspection_number',
        'inspection_item__name',
        'notes', 'recommendation'
    ]
    readonly_fields = ['created_at', 'updated_at']
    inlines = [InspectionPhotoInline]
    
    fieldsets = [
        ('Result Info', {
            'fields': ['inspection', 'inspection_item', 'result']
        }),
        ('Measurements', {
            'fields': [
                'measurement_value', 'percentage_value',
                'rating_value', 'condition'
            ],
            'classes': ['collapse']
        }),
        ('Assessment', {
            'fields': [
                'needs_immediate_attention', 'recommendation',
                'estimated_cost', 'text_note', 'notes'
            ]
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]
    
    def inspection_number(self, obj):
        return obj.inspection.inspection_number
    inspection_number.short_description = 'Inspection'
    
    def item_name(self, obj):
        critical = '⚠ ' if obj.inspection_item.is_critical else ''
        return f"{critical}{obj.inspection_item.name}"
    item_name.short_description = 'Item'
    
    def result_badge(self, obj):
        colors = {
            'pass': 'green',
            'fail': 'red',
            'advisory': 'orange',
            'not_applicable': 'gray',
            'not_checked': 'lightgray',
        }
        icons = {
            'pass': '✓',
            'fail': '✗',
            'advisory': '⚠',
            'not_applicable': '-',
            'not_checked': '○',
        }
        color = colors.get(obj.result, 'gray')
        icon = icons.get(obj.result, '?')
        return format_html(
            '<span style="color: {};">{} {}</span>',
            color,
            icon,
            obj.get_result_display()
        )
    result_badge.short_description = 'Result'
    
    def condition_badge(self, obj):
        if not obj.condition:
            return format_html('<span style="color: gray;">-</span>')
        
        colors = {
            'excellent': 'darkgreen',
            'good': 'green',
            'fair': 'orange',
            'poor': 'darkorange',
            'critical': 'red',
        }
        color = colors.get(obj.condition, 'gray')
        return format_html(
            '<span style="color: {};">● {}</span>',
            color,
            obj.get_condition_display()
        )
    condition_badge.short_description = 'Condition'
    
    def attention_badge(self, obj):
        if obj.needs_immediate_attention:
            return format_html('<span style="color: red;">⚡ URGENT</span>')
        return format_html('<span style="color: gray;">-</span>')
    attention_badge.short_description = 'Attention'


@admin.register(InspectionPhoto)
class InspectionPhotoAdmin(admin.ModelAdmin):
    list_display = ['id', 'result_info', 'caption', 'order', 'created_at']
    list_filter = ['created_at']
    search_fields = ['caption', 'result__inspection__inspection_number']
    readonly_fields = ['created_at']
    
    def result_info(self, obj):
        return f"{obj.result.inspection.inspection_number} - {obj.result.inspection_item.name}"
    result_info.short_description = 'Inspection Result'
