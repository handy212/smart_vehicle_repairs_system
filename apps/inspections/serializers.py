from rest_framework import serializers
from django.db import transaction
from apps.inspections.models import (
    InspectionTemplate, InspectionCategory, InspectionItem,
    VehicleInspection, InspectionResult, InspectionPhoto
)
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder


# ============================================================================
# Template Serializers
# ============================================================================

class InspectionItemSerializer(serializers.ModelSerializer):
    """Serializer for inspection items"""
    item_type_display = serializers.CharField(source='get_item_type_display', read_only=True)
    
    class Meta:
        model = InspectionItem
        fields = [
            'id', 'name', 'description', 'item_type', 'item_type_display',
            'measurement_unit', 'min_acceptable', 'max_acceptable',
            'order', 'is_critical'
        ]


class InspectionCategorySerializer(serializers.ModelSerializer):
    """Serializer for inspection categories with items"""
    items = InspectionItemSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(source='items.count', read_only=True)
    
    class Meta:
        model = InspectionCategory
        fields = ['id', 'name', 'description', 'order', 'items', 'item_count']


class InspectionTemplateListSerializer(serializers.ModelSerializer):
    """List serializer for templates"""
    category_count = serializers.IntegerField(source='categories.count', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = InspectionTemplate
        fields = [
            'id', 'name', 'description', 'is_active', 'is_default',
            'category_count', 'created_by_name', 'created_at'
        ]
    
    def get_created_by_name(self, obj):
        return f"{obj.created_by.first_name} {obj.created_by.last_name}"


class InspectionTemplateDetailSerializer(serializers.ModelSerializer):
    """Detail serializer for templates with full structure"""
    categories = InspectionCategorySerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    total_items = serializers.SerializerMethodField()
    
    class Meta:
        model = InspectionTemplate
        fields = [
            'id', 'name', 'description', 'is_active', 'is_default',
            'requires_odometer', 'requires_technician_signature',
            'requires_customer_signature', 'allows_photos', 'allows_video',
            'categories', 'created_by_name', 'total_items',
            'created_at', 'updated_at'
        ]
    
    def get_created_by_name(self, obj):
        return f"{obj.created_by.first_name} {obj.created_by.last_name}"
    
    def get_total_items(self, obj):
        return InspectionItem.objects.filter(category__template=obj).count()


class InspectionTemplateCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating templates"""
    
    class Meta:
        model = InspectionTemplate
        fields = [
            'name', 'description', 'is_active', 'is_default',
            'requires_odometer', 'requires_technician_signature',
            'requires_customer_signature', 'allows_photos', 'allows_video'
        ]
    
    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


# ============================================================================
# Inspection Result Serializers
# ============================================================================

class InspectionPhotoSerializer(serializers.ModelSerializer):
    """Serializer for inspection photos"""
    
    class Meta:
        model = InspectionPhoto
        fields = ['id', 'image', 'caption', 'order', 'created_at']


class InspectionResultSerializer(serializers.ModelSerializer):
    """Serializer for inspection results"""
    item_name = serializers.CharField(source='inspection_item.name', read_only=True)
    category_name = serializers.CharField(source='inspection_item.category.name', read_only=True)
    item_type = serializers.CharField(source='inspection_item.item_type', read_only=True)
    is_critical = serializers.BooleanField(source='inspection_item.is_critical', read_only=True)
    result_display = serializers.CharField(source='get_result_display', read_only=True)
    condition_display = serializers.CharField(source='get_condition_display', read_only=True)
    photos = InspectionPhotoSerializer(many=True, read_only=True)
    
    class Meta:
        model = InspectionResult
        fields = [
            'id', 'inspection_item', 'item_name', 'category_name', 'item_type',
            'is_critical', 'result', 'result_display', 'measurement_value',
            'percentage_value', 'rating_value', 'condition', 'condition_display',
            'text_note', 'needs_immediate_attention', 'recommendation',
            'estimated_cost', 'notes', 'photos', 'created_at', 'updated_at'
        ]


class InspectionResultCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating inspection results"""
    
    class Meta:
        model = InspectionResult
        fields = [
            'inspection', 'inspection_item', 'result', 'measurement_value',
            'percentage_value', 'rating_value', 'condition', 'text_note',
            'needs_immediate_attention', 'recommendation', 'estimated_cost', 'notes'
        ]
    
    def validate(self, data):
        """Validate that the inspection item belongs to the inspection's template"""
        inspection = data.get('inspection')
        inspection_item = data.get('inspection_item')
        
        if inspection and inspection_item:
            if inspection_item.category.template != inspection.template:
                raise serializers.ValidationError(
                    "Inspection item does not belong to this inspection's template"
                )
        
        return data


# ============================================================================
# Vehicle Inspection Serializers
# ============================================================================

class VehicleInspectionListSerializer(serializers.ModelSerializer):
    """List serializer for inspections"""
    vehicle_info = serializers.SerializerMethodField()
    template_name = serializers.CharField(source='template.name', read_only=True)
    performed_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    overall_result_display = serializers.CharField(source='get_overall_result_display', read_only=True)
    result_counts = serializers.SerializerMethodField()
    completion_percentage = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = VehicleInspection
        fields = [
            'id', 'inspection_number', 'vehicle', 'vehicle_info',
            'template_name', 'inspection_date', 'odometer_reading',
            'status', 'status_display', 'overall_result', 'overall_result_display',
            'performed_by_name', 'result_counts', 'completion_percentage',
            'created_at'
        ]
    
    def get_vehicle_info(self, obj):
        return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model} ({obj.vehicle.license_plate})"
    
    def get_performed_by_name(self, obj):
        return f"{obj.performed_by.first_name} {obj.performed_by.last_name}"
    
    def get_result_counts(self, obj):
        return {
            'pass': obj.pass_count,
            'fail': obj.fail_count,
            'advisory': obj.advisory_count,
            'total': obj.total_items
        }


class VehicleInspectionDetailSerializer(serializers.ModelSerializer):
    """Detail serializer for inspections with all results"""
    vehicle_info = serializers.SerializerMethodField()
    vehicle = serializers.SerializerMethodField()
    template = InspectionTemplateDetailSerializer(read_only=True)
    work_order_number = serializers.CharField(source='work_order.wo_number', read_only=True)
    performed_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    overall_result_display = serializers.CharField(source='get_overall_result_display', read_only=True)
    results = InspectionResultSerializer(many=True, read_only=True)
    result_counts = serializers.SerializerMethodField()
    completion_percentage = serializers.IntegerField(read_only=True)
    has_critical_issues = serializers.BooleanField(read_only=True)
    pass_count = serializers.IntegerField(read_only=True)
    fail_count = serializers.IntegerField(read_only=True)
    advisory_count = serializers.IntegerField(read_only=True)
    total_items = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = VehicleInspection
        fields = [
            'id', 'inspection_number', 'vehicle', 'vehicle_info', 'work_order',
            'work_order_number', 'template', 'inspection_date', 'odometer_reading',
            'status', 'status_display', 'overall_result', 'overall_result_display',
            'performed_by', 'performed_by_name', 'approved_by', 'approved_by_name',
            'technician_signature', 'customer_signature', 'notes', 'recommendations',
            'completed_at', 'sent_to_customer_at', 'results', 'result_counts',
            'completion_percentage', 'has_critical_issues', 'pass_count',
            'fail_count', 'advisory_count', 'total_items',
            'created_at', 'updated_at'
        ]
    
    def get_vehicle_info(self, obj):
        return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
    
    def get_vehicle(self, obj):
        return {
            'id': obj.vehicle.id,
            'year': obj.vehicle.year,
            'make': obj.vehicle.make,
            'model': obj.vehicle.model,
            'vin': obj.vehicle.vin,
            'license_plate': obj.vehicle.license_plate,
            'color': obj.vehicle.color,
        }
    
    def get_performed_by_name(self, obj):
        return f"{obj.performed_by.first_name} {obj.performed_by.last_name}"
    
    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return f"{obj.approved_by.first_name} {obj.approved_by.last_name}"
        return None
    
    def get_result_counts(self, obj):
        return {
            'pass': obj.pass_count,
            'fail': obj.fail_count,
            'advisory': obj.advisory_count,
            'total': obj.total_items
        }


class VehicleInspectionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating inspections"""
    
    class Meta:
        model = VehicleInspection
        fields = [
            'vehicle', 'work_order', 'template', 'inspection_date',
            'odometer_reading', 'notes'
        ]
    
    def validate_vehicle(self, value):
        """Ensure vehicle exists"""
        if not Vehicle.objects.filter(id=value.id).exists():
            raise serializers.ValidationError("Vehicle does not exist")
        return value
    
    def validate_work_order(self, value):
        """Ensure work order exists and is for the same vehicle"""
        if value:
            vehicle = self.initial_data.get('vehicle')
            if vehicle and value.vehicle_id != vehicle:
                raise serializers.ValidationError(
                    "Work order must be for the same vehicle"
                )
        return value
    
    def validate(self, data):
        """Validate that vehicle doesn't have active work order at another branch"""
        vehicle = data.get('vehicle')
        request = self.context.get('request')
        
        if vehicle and request:
            from apps.branches.utils import resolve_branch
            
            current_branch = resolve_branch(request, branch_id=request.data.get('branch') or request.data.get('branch_id'))
            
            if current_branch:
                # Active work order statuses (not closed)
                active_statuses = [
                    'draft', 'inspection', 'intake', 'diagnosis', 
                    'awaiting_approval', 'approved', 'in_progress', 
                    'additional_work_found', 'paused', 'quality_check'
                ]
                
                # Check for active work orders at other branches
                active_work_orders = WorkOrder.objects.filter(
                    vehicle=vehicle,
                    status__in=active_statuses
                ).exclude(branch=current_branch).select_related('branch')
                
                if active_work_orders.exists():
                    active_wo = active_work_orders.first()
                    branch_name = active_wo.branch.name if active_wo.branch else 'Unknown Branch'
                    raise serializers.ValidationError(
                        f"This vehicle has an active work order ({active_wo.work_order_number}) "
                        f"at {branch_name}. A new inspection can only be created once the existing "
                        f"work order has been closed at the branch where it was opened."
                    )
        
        return data
    
    def create(self, validated_data):
        validated_data['performed_by'] = self.context['request'].user
        return super().create(validated_data)


class VehicleInspectionUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating inspections"""
    
    class Meta:
        model = VehicleInspection
        fields = [
            'inspection_date', 'odometer_reading', 'status', 'overall_result',
            'technician_signature', 'customer_signature', 'notes', 'recommendations'
        ]


class InspectionSummarySerializer(serializers.Serializer):
    """Serializer for inspection summary/statistics"""
    total_inspections = serializers.IntegerField()
    completed_inspections = serializers.IntegerField()
    in_progress_inspections = serializers.IntegerField()
    pass_rate = serializers.FloatField()
    inspections_by_template = serializers.ListField()
    recent_inspections = VehicleInspectionListSerializer(many=True)
