"""
Gate Pass serializers for API
"""
from rest_framework import serializers
from django.utils import timezone
from .models import GatePass
from apps.customers.serializers import CustomerListSerializer
from apps.vehicles.serializers import VehicleListSerializer
from apps.workorders.serializers import WorkOrderListSerializer


class GatePassListSerializer(serializers.ModelSerializer):
    """List view with nested info"""
    customer_name = serializers.SerializerMethodField()
    vehicle_info = serializers.SerializerMethodField()
    work_order_number = serializers.CharField(source='work_order.work_order_number', read_only=True)
    pickup_person_display = serializers.CharField(read_only=True)
    issued_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = GatePass
        fields = [
            'id', 'gate_pass_number', 'status', 'work_order', 'work_order_number',
            'customer', 'customer_name', 'vehicle', 'vehicle_info',
            'picked_up_by_customer', 'pickup_person_display',
            'issued_at', 'completed_at', 'created_at',
            'issued_by', 'issued_by_name'
        ]
    
    def get_customer_name(self, obj):
        """Get customer name from user"""
        if obj.customer and obj.customer.user:
            return obj.customer.user.get_full_name() or obj.customer.user.username or "N/A"
        return "N/A"
    
    def get_vehicle_info(self, obj):
        if obj.vehicle:
            return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model} - {obj.vehicle.license_plate}"
        return "N/A"
    
    def get_issued_by_name(self, obj):
        if obj.issued_by:
            return f"{obj.issued_by.first_name} {obj.issued_by.last_name}".strip() or obj.issued_by.username
        return None


class GatePassDetailSerializer(serializers.ModelSerializer):
    """Detailed view with all related data"""
    customer = CustomerListSerializer(read_only=True)
    vehicle = VehicleListSerializer(read_only=True)
    work_order = WorkOrderListSerializer(read_only=True)
    pickup_person_display = serializers.CharField(read_only=True)
    issued_by_name = serializers.SerializerMethodField()
    authorized_by_name = serializers.SerializerMethodField()
    
    work_order_number = serializers.CharField(source='work_order.work_order_number', read_only=True)
    customer_name = serializers.SerializerMethodField()
    vehicle_info = serializers.SerializerMethodField()

    class Meta:
        model = GatePass
        fields = '__all__'
    
    def get_issued_by_name(self, obj):
        if obj.issued_by:
            return f"{obj.issued_by.first_name} {obj.issued_by.last_name}".strip() or obj.issued_by.username
        return None
    
    def get_authorized_by_name(self, obj):
        if obj.authorized_by:
            return f"{obj.authorized_by.first_name} {obj.authorized_by.last_name}".strip() or obj.authorized_by.username
        return None

    def get_customer_name(self, obj):
        """Get customer name from user"""
        if obj.customer and obj.customer.user:
            return obj.customer.user.get_full_name() or obj.customer.user.username or "N/A"
        return "N/A"
    
    def get_vehicle_info(self, obj):
        if obj.vehicle:
            return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model} - {obj.vehicle.license_plate}"
        return "N/A"


class GatePassCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating gate passes"""
    
    class Meta:
        model = GatePass
        fields = [
            'id', 'gate_pass_number', 'status', 'work_order', 'branch', 'vehicle', 'customer',
            'picked_up_by_customer', 'pickup_person_name',
            'pickup_person_relationship', 'pickup_person_id_type',
            'pickup_person_id_number', 'pickup_person_phone',
            'pickup_notes'
        ]
        read_only_fields = ['id', 'gate_pass_number', 'status']
    
    def validate_work_order(self, value):
        """Validate that work order is closed"""
        if value.status != 'closed':
            raise serializers.ValidationError("Gate pass can only be created for closed work orders.")
        
        existing = GatePass.objects.filter(work_order=value).exclude(status='cancelled')
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError("A gate pass already exists for this work order.")
        
        return value
    
    def validate(self, data):
        """Validate pickup person name if not customer"""
        if not data.get('picked_up_by_customer', True) and not data.get('pickup_person_name'):
            raise serializers.ValidationError({
                'pickup_person_name': 'Pickup person name is required when customer is not picking up.'
            })

        work_order = data.get('work_order')
        branch = data.get('branch')
        vehicle = data.get('vehicle')
        customer = data.get('customer')

        if work_order:
            if branch and work_order.branch_id != branch.id:
                raise serializers.ValidationError({
                    'branch': 'Gate pass branch must match the selected work order branch.'
                })
            if vehicle and work_order.vehicle_id != vehicle.id:
                raise serializers.ValidationError({
                    'vehicle': 'Gate pass vehicle must match the selected work order vehicle.'
                })
            if customer and work_order.customer_id != customer.id:
                raise serializers.ValidationError({
                    'customer': 'Gate pass customer must match the selected work order customer.'
                })
        return data
    
    def create(self, validated_data):
        """Create gate pass with auto-populated fields"""
        request = self.context.get('request')
        if request and request.user:
            validated_data['issued_by'] = request.user
        
        # Auto-populate vehicle and customer from work order if not provided
        work_order = validated_data.get('work_order')
        if work_order:
            if 'vehicle' not in validated_data:
                validated_data['vehicle'] = work_order.vehicle
            if 'customer' not in validated_data:
                validated_data['customer'] = work_order.customer
            if 'branch' not in validated_data:
                validated_data['branch'] = work_order.branch
        
        return super().create(validated_data)


class GatePassUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating gate passes"""
    
    class Meta:
        model = GatePass
        fields = [
            'picked_up_by_customer', 'pickup_person_name',
            'pickup_person_relationship', 'pickup_person_id_type',
            'pickup_person_id_number', 'pickup_person_phone',
            'pickup_notes'
        ]
    
    def validate(self, data):
        """Validate pickup person name if not customer"""
        picked_up_by_customer = data.get('picked_up_by_customer', self.instance.picked_up_by_customer if self.instance else True)
        pickup_person_name = data.get('pickup_person_name', self.instance.pickup_person_name if self.instance else '')
        
        if not picked_up_by_customer and not pickup_person_name:
            raise serializers.ValidationError({
                'pickup_person_name': 'Pickup person name is required when customer is not picking up.'
            })
        return data
