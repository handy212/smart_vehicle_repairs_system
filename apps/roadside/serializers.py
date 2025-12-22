"""
Serializers for roadside assistance
"""
from rest_framework import serializers
from decimal import Decimal
from .models import RoadsideRequest
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle


class RoadsideRequestSerializer(serializers.ModelSerializer):
    """Serializer for roadside requests"""
    
    customer_name = serializers.SerializerMethodField()
    vehicle_display = serializers.SerializerMethodField()
    service_type_display = serializers.CharField(source='get_service_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    assigned_technician_name = serializers.SerializerMethodField()
    is_active = serializers.BooleanField(read_only=True)
    can_be_cancelled = serializers.BooleanField(read_only=True)
    subscription_number = serializers.SerializerMethodField()
    
    def get_customer_name(self, obj):
        """Get customer name safely"""
        if obj.customer:
            if hasattr(obj.customer, 'full_name'):
                return obj.customer.full_name
            elif hasattr(obj.customer, 'company_name') and obj.customer.company_name:
                return obj.customer.company_name
            elif hasattr(obj.customer, 'user') and obj.customer.user:
                return obj.customer.user.get_full_name() or obj.customer.user.username
        return str(obj.customer) if obj.customer else None
    
    def get_vehicle_display(self, obj):
        """Get vehicle display name safely"""
        if obj.vehicle:
            if hasattr(obj.vehicle, 'display_name'):
                return obj.vehicle.display_name
            parts = []
            if obj.vehicle.year:
                parts.append(str(obj.vehicle.year))
            if obj.vehicle.make:
                parts.append(obj.vehicle.make)
            if obj.vehicle.model:
                parts.append(obj.vehicle.model)
            return ' '.join(parts) if parts else str(obj.vehicle)
        return None
    
    def get_assigned_technician_name(self, obj):
        """Get technician name safely"""
        if obj.assigned_technician:
            return obj.assigned_technician.get_full_name() or obj.assigned_technician.username
        return None
    
    def get_subscription_number(self, obj):
        """Get subscription number safely"""
        if obj.subscription_used:
            return obj.subscription_used.subscription_number
        return None
    
    class Meta:
        model = RoadsideRequest
        fields = [
            'id', 'request_number', 'customer', 'customer_name',
            'vehicle', 'vehicle_display', 'branch',
            'service_type', 'service_type_display',
            'status', 'status_display',
            'breakdown_location', 'latitude', 'longitude',
            'description', 'customer_phone',
            'tow_distance_km', 'destination',
            'assigned_technician', 'assigned_technician_name',
            'dispatched_at', 'arrived_at', 'completed_at',
            'subscription_used', 'subscription_number', 'subscription_allowance_deducted',
            'is_covered_by_subscription', 'charge_amount',
            'notes', 'customer_feedback',
            'requested_at', 'created_by', 'updated_at',
            'is_active', 'can_be_cancelled',
        ]
        read_only_fields = [
            'request_number', 'dispatched_at', 'arrived_at', 
            'completed_at', 'subscription_allowance_deducted',
            'requested_at', 'updated_at',
        ]


class RoadsideRequestCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating roadside requests"""
    
    class Meta:
        model = RoadsideRequest
        fields = [
            'customer', 'vehicle', 'service_type',
            'breakdown_location', 'latitude', 'longitude',
            'description', 'customer_phone',
            'tow_distance_km', 'destination',
            'notes',
        ]
    
    def validate(self, data):
        customer = data.get('customer')
        vehicle = data.get('vehicle')
        
        if not customer:
            raise serializers.ValidationError({"customer": "Customer is required"})
        if not vehicle:
            raise serializers.ValidationError({"vehicle": "Vehicle is required"})
        
        # Ensure vehicle belongs to customer
        if vehicle.customer_id != customer.id:
            raise serializers.ValidationError(
                {"vehicle": "Vehicle does not belong to this customer"}
            )
        
        # Validate towing distance if service type is towing
        if data.get('service_type') == 'towing':
            tow_distance = data.get('tow_distance_km')
            if not tow_distance or tow_distance <= 0:
                raise serializers.ValidationError(
                    {"tow_distance_km": "Tow distance (km) is required and must be greater than 0 for towing service"}
                )
        
        # Validate customer phone
        customer_phone = data.get('customer_phone')
        if not customer_phone or len(customer_phone.strip()) == 0:
            raise serializers.ValidationError(
                {"customer_phone": "Customer phone number is required for roadside assistance"}
            )
        
        # Validate breakdown location
        breakdown_location = data.get('breakdown_location')
        if not breakdown_location or len(breakdown_location.strip()) == 0:
            raise serializers.ValidationError(
                {"breakdown_location": "Breakdown location is required"}
            )
        
        return data


class RoadsideRequestUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating roadside requests"""
    
    class Meta:
        model = RoadsideRequest
        fields = [
            'status', 'assigned_technician',
            'breakdown_location', 'latitude', 'longitude',
            'description', 'tow_distance_km', 'destination',
            'notes', 'customer_feedback',
            'charge_amount',
        ]
