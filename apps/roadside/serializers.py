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
    is_active = serializers.SerializerMethodField()
    can_be_cancelled = serializers.SerializerMethodField()
    subscription_number = serializers.SerializerMethodField()
    invoice_number = serializers.SerializerMethodField()
    customer_email = serializers.ReadOnlyField(source='customer.user.email')
    
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

    def get_invoice_number(self, obj):
        """Get invoice number safely"""
        if obj.invoice:
            return obj.invoice.invoice_number
        return None

    def get_is_active(self, obj):
        return obj.is_active()

    def get_can_be_cancelled(self, obj):
        return obj.can_be_cancelled()
    
    class Meta:
        model = RoadsideRequest
        fields = [
            'id', 'request_number', 'customer', 'customer_name', 'customer_email',
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
            'invoice', 'invoice_number',
            'notes', 'customer_feedback', 'rating',
            'requested_at', 'created_by', 'updated_at',
            'is_active', 'can_be_cancelled',
        ]
        read_only_fields = [
            'request_number', 'dispatched_at', 'arrived_at', 
            'completed_at', 'subscription_allowance_deducted',
            'requested_at', 'updated_at', 'rating',
        ]


class RoadsideRequestCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating roadside requests"""
    
    class Meta:
        model = RoadsideRequest
        fields = [
            'id', 'request_number', 'customer', 'vehicle', 'service_type',
            'breakdown_location', 'latitude', 'longitude',
            'description', 'customer_phone',
            'tow_distance_km', 'destination',
            'notes',
        ]
        read_only_fields = ['id', 'request_number']
        extra_kwargs = {
            'customer': {'required': False},
        }
    
    def validate(self, data):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        customer = data.get('customer')
        vehicle = data.get('vehicle')

        if user and getattr(user, 'role', None) == 'customer':
            customer_profile = getattr(user, 'customer_profile', None)
            if not customer_profile:
                try:
                    customer_profile = Customer.objects.get(user=user)
                except Customer.DoesNotExist:
                    customer_profile = None
            if not customer_profile:
                raise serializers.ValidationError({"customer": "Customer profile not found"})
            data['customer'] = customer_profile
            customer = customer_profile
        
        if not customer:
            raise serializers.ValidationError({"customer": "Customer is required"})
        if not vehicle:
            raise serializers.ValidationError({"vehicle": "Vehicle is required"})
        
        # Ensure vehicle belongs to customer
        if vehicle.owner_id != customer.id:
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
            
        # Strict Restriction: Check subscription allowance
        # Only if we have both customer and vehicle
        if customer and vehicle:
            from apps.subscriptions.services import SubscriptionUsageService
            
            # Map service types to subscription feature keys
            service_to_feature = {
                'towing': 'towing_services_km',
                'battery_boost': 'battery_boosts',
                'flat_tyre': 'flat_tyre_service',
                'key_lockout': 'key_lock_out',
                'emergency_fuel': 'emergency_fuel',
                'extrication': 'extrication',
                'mechanical_first_aid': 'roadside_first_aid',
            }
            
            service_type = data.get('service_type')
            feature_key = service_to_feature.get(service_type)
            
            if feature_key:
                # Check allowance
                has_allowance, subscription, remaining = SubscriptionUsageService.check_allowance(
                    customer, feature_key, 
                    quantity_needed=data.get('tow_distance_km') if service_type == 'towing' else 1,
                    vehicle=vehicle
                )
                
                # If subscription exists but allowance is 0/insufficient, BLOCK IT.
                # Note: We only block if they HAVE a subscription that SHOULD cover it but validaiton fails.
                # If they have NO active subscription, check_allowance returns None, 0. We currently allow non-sub requests (paid).
                # But user asked "creation should not be allowed" for "Extrication 0".
                # This implies: If they satisfy "active subscription" criteria, but run out of allowance, we block.
                
                if subscription:
                    # Case 1: Service not covered (remaining=0 usually if key missing in logic or actually 0)
                    # Case 2: Insufficient allowance
                    if not has_allowance:
                        raise serializers.ValidationError(
                            {
                                "service_type": f"Service '{service_type}' is not available under your current subscription (Remaining: {remaining})."
                            }
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

    def validate(self, data):
        if data.get('charge_amount') is not None and data['charge_amount'] < 0:
            raise serializers.ValidationError({'charge_amount': 'Charge amount cannot be negative'})

        customer = getattr(self.instance, 'customer', None)
        vehicle = getattr(self.instance, 'vehicle', None)
        service_type = getattr(self.instance, 'service_type', None)

        if vehicle and customer and vehicle.owner_id != customer.id:
            raise serializers.ValidationError({'vehicle': 'Vehicle does not belong to this customer'})

        if service_type == 'towing':
            tow_distance = data.get('tow_distance_km', getattr(self.instance, 'tow_distance_km', None))
            if not tow_distance or tow_distance <= 0:
                raise serializers.ValidationError({'tow_distance_km': 'Tow distance is required and must be greater than 0 for towing service'})

        return data
