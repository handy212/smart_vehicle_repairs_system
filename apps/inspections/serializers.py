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
        """Get formatted vehicle information"""
        if not obj.vehicle:
            return None
        try:
            license_plate = obj.vehicle.license_plate or ''
            vehicle_info = f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
            if license_plate:
                return f"{vehicle_info} ({license_plate})"
            return vehicle_info
        except (AttributeError, TypeError):
            return None
    
    def get_performed_by_name(self, obj):
        """Get performed by name with null-safe handling"""
        if not obj.performed_by:
            return None
        try:
            first_name = obj.performed_by.first_name or ''
            last_name = obj.performed_by.last_name or ''
            return f"{first_name} {last_name}".strip() or None
        except (AttributeError, TypeError):
            return None
    
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
    work_order_number = serializers.SerializerMethodField()
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
        """Get formatted vehicle information with null-safe handling"""
        if not obj.vehicle:
            return None
        try:
            return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
        except (AttributeError, TypeError):
            return None
    
    def get_vehicle(self, obj):
        """Get vehicle details with null-safe handling"""
        if not obj.vehicle:
            return None
        try:
            return {
                'id': obj.vehicle.id,
                'year': obj.vehicle.year,
                'make': obj.vehicle.make or '',
                'model': obj.vehicle.model or '',
                'vin': obj.vehicle.vin or '',
                'license_plate': obj.vehicle.license_plate or '',
                'exterior_color': obj.vehicle.exterior_color or '',
                'interior_color': obj.vehicle.interior_color or '',
            }
        except (AttributeError, TypeError):
            return None
    
    def get_work_order_number(self, obj):
        """Get work order number with null-safe handling"""
        if not obj.work_order:
            return None
        try:
            return obj.work_order.work_order_number
        except (AttributeError, TypeError):
            return None
    
    def get_performed_by_name(self, obj):
        """Get performed by name with null-safe handling"""
        if not obj.performed_by:
            return None
        try:
            first_name = obj.performed_by.first_name or ''
            last_name = obj.performed_by.last_name or ''
            return f"{first_name} {last_name}".strip() or None
        except (AttributeError, TypeError):
            return None
    
    def get_approved_by_name(self, obj):
        """Get approved by name with null-safe handling"""
        if not obj.approved_by:
            return None
        try:
            first_name = obj.approved_by.first_name or ''
            last_name = obj.approved_by.last_name or ''
            return f"{first_name} {last_name}".strip() or None
        except (AttributeError, TypeError):
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
            # Get vehicle from initial_data - could be ID or Vehicle object
            vehicle_input = self.initial_data.get('vehicle')
            if vehicle_input:
                # Handle both ID and Vehicle object cases
                if isinstance(vehicle_input, int):
                    vehicle_id = vehicle_input
                elif hasattr(vehicle_input, 'id'):
                    vehicle_id = vehicle_input.id
                else:
                    # Try to convert to int if it's a string
                    try:
                        vehicle_id = int(vehicle_input)
                    except (ValueError, TypeError):
                        vehicle_id = None
                
                # Compare vehicle IDs
                if vehicle_id and value.vehicle_id != vehicle_id:
                    raise serializers.ValidationError(
                        "Work order must be for the same vehicle"
                    )
        return value
    
    def validate(self, data):
        """Validate that vehicle doesn't have active work order at another branch"""
        vehicle = data.get('vehicle')
        request = self.context.get('request')
        
        if vehicle and request:
            try:
                from apps.branches.utils import resolve_branch
                
                branch_id = None
                if hasattr(request, 'data'):
                    branch_id = request.data.get('branch') or request.data.get('branch_id')
                
                current_branch = resolve_branch(request, branch_id=branch_id)
                
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
            except serializers.ValidationError:
                # Re-raise validation errors
                raise
            except Exception as e:
                # Log other errors but don't fail validation
                # This allows the create to proceed if branch resolution fails
                # The perform_create method will handle branch assignment
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Error during work order validation: {str(e)}")
        
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
