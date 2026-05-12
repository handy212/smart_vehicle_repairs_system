"""
Serializers for roadside assistance
"""
from rest_framework import serializers
from decimal import Decimal
from .models import RoadsideRequest, RoadsideDispatch
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
import logging

logger = logging.getLogger(__name__)


class DispatchedTechnicianSerializer(serializers.ModelSerializer):
    """Minimal serializer for a dispatched technician entry"""
    technician_name = serializers.SerializerMethodField()

    def get_technician_name(self, obj):
        t = obj.technician
        return t.get_full_name() or t.username

    class Meta:
        model = RoadsideDispatch
        fields = ['id', 'technician', 'technician_name', 'dispatched_at', 'notes']



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
    dispatched_technicians = DispatchedTechnicianSerializer(source='dispatches', many=True, read_only=True)
    
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
            'dispatched_technicians',
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
    pay_as_you_go = serializers.BooleanField(required=False, write_only=True, default=False)
    
    class Meta:
        model = RoadsideRequest
        fields = [
            'id', 'request_number', 'customer', 'vehicle', 'service_type',
            'breakdown_location', 'latitude', 'longitude',
            'description', 'customer_phone',
            'tow_distance_km', 'destination',
            'notes', 'charge_amount', 'pay_as_you_go',
        ]
        read_only_fields = ['id', 'request_number']
        extra_kwargs = {
            'customer': {'required': False},
        }

    def get_service_type_label(self, service_type):
        return dict(RoadsideRequest.SERVICE_TYPE_CHOICES).get(service_type, service_type or 'Selected service')
    
    def validate(self, data):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        customer = data.get('customer')
        vehicle = data.get('vehicle')
        pay_as_you_go = data.get('pay_as_you_go', False)
        charge_amount = data.get('charge_amount')
        
        # Log the incoming request data for debugging
        logger.debug(
            "RoadsideRequestCreateSerializer.validate() called | User: %s | Data keys: %s | Customer: %s | Vehicle: %s",
            user,
            list(data.keys()),
            customer,
            vehicle,
        )

        if user and getattr(user, 'role', None) == 'customer':
            customer_profile = getattr(user, 'customer_profile', None)
            if not customer_profile:
                try:
                    customer_profile = Customer.objects.get(user=user)
                except Customer.DoesNotExist:
                    customer_profile = None
            if not customer_profile:
                logger.debug("Customer profile not found for user: %s", user)
                raise serializers.ValidationError({"customer": "Customer profile not found"})
            data['customer'] = customer_profile
            customer = customer_profile
        
        if not customer:
            logger.debug("Customer is required but not provided. User: %s", user)
            raise serializers.ValidationError({"customer": "Customer is required"})
        if not vehicle:
            logger.debug("Vehicle is required but not provided. User: %s", user)
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
            logger.debug("Customer phone validation failed. Phone: %s", customer_phone)
            raise serializers.ValidationError(
                {"customer_phone": "Customer phone number is required for roadside assistance"}
            )
        
        # Validate breakdown location
        breakdown_location = data.get('breakdown_location')
        if not breakdown_location or len(breakdown_location.strip()) == 0:
            logger.debug("Breakdown location validation failed. Location: %s", breakdown_location)
            raise serializers.ValidationError(
                {"breakdown_location": "Breakdown location is required"}
            )

        if pay_as_you_go and (charge_amount is None or charge_amount <= 0):
            raise serializers.ValidationError(
                {
                    "charge_amount": "Enter the pay-as-you-go charge amount before continuing.",
                    "pay_as_you_go_available": True,
                }
            )
            
        # Strict Restriction: Check subscription allowance
        # Only if we have both customer and vehicle
        if customer and vehicle and not pay_as_you_go:
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
                'accident_estimate': 'accident_estimate',
                'pre_purchase_inspection': 'pre_purchase_inspection',
            }
            
            service_type = data.get('service_type')
            feature_key = service_to_feature.get(service_type)
            service_label = self.get_service_type_label(service_type)
            
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
                    # Check the selected service first. Global call-out limits only matter
                    # after we know the package actually covers this service.
                    if not has_allowance:
                        logger.debug(
                            "Subscription allowance check failed. Customer: %s, Service: %s, Has allowance: %s, Remaining: %s, Subscription: %s",
                            customer,
                            service_type,
                            has_allowance,
                            remaining,
                            subscription,
                        )
                        if feature_key not in subscription.package.features:
                            message = f"{service_label} is not available under this subscription."
                        elif remaining <= 0:
                            message = f"{service_label} allowance is finished for this subscription. Remaining: {remaining}."
                        else:
                            message = f"{service_label} allowance is not enough for this request. Remaining: {remaining}."
                        raise serializers.ValidationError(
                            {"detail": message, "pay_as_you_go_available": True}
                        )

                    # Check the package-wide service call count. `call_out_charges`
                    # is a legacy feature and must not block every roadside service.
                    for global_feat, global_name in [('total_service_calls', 'Service Calls')]:
                        if subscription.package.features.get(global_feat) is not None:
                            g_has, _, g_rem = SubscriptionUsageService.check_allowance(
                                customer, global_feat, quantity_needed=1, vehicle=vehicle
                            )
                            if not g_has:
                                raise serializers.ValidationError(
                                    {
                                        "detail": (
                                            f"{global_name} limit is finished for {service_label}. "
                                            f"Remaining: {g_rem}."
                                        ),
                                        "pay_as_you_go_available": True,
                                    }
                                )
        
        return data

    def create(self, validated_data):
        validated_data.pop('pay_as_you_go', None)
        return super().create(validated_data)


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
