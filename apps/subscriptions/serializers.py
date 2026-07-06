"""
Serializers for subscriptions app
"""
from rest_framework import serializers
from .models import Package, Subscription, SubscriptionUsage
from apps.customers.models import Customer


class PackageSerializer(serializers.ModelSerializer):
    """Serializer for Package model"""
    
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    feature_kilometers = serializers.ReadOnlyField()
    feature_call_out_charges = serializers.ReadOnlyField()
    feature_towing_services = serializers.ReadOnlyField()
    
    class Meta:
        model = Package
        fields = [
            'id', 'name', 'code', 'description',
            'price', 'duration_months', 'is_active',
            'revenue_product',
            'features', 'metadata',
            'feature_kilometers', 'feature_call_out_charges', 'feature_towing_services',
            'created_by', 'created_by_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'created_by',
            'feature_kilometers', 'feature_call_out_charges', 'feature_towing_services',
            'created_by_name'
        ]
    
    def validate_code(self, value):
        """Ensure code is uppercase"""
        if value:
            value = value.upper().strip()
        return value


class PackageListSerializer(serializers.ModelSerializer):
    """Minimal serializer for package lists"""
    
    class Meta:
        model = Package
        fields = [
            'id', 'name', 'code', 'price', 'duration_months',
            'is_active', 'features'
        ]


class PackageCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating packages"""
    
    class Meta:
        model = Package
        fields = [
            'name', 'code', 'description',
            'price', 'duration_months', 'is_active',
            'features', 'metadata'
        ]
    
    def validate_code(self, value):
        """Ensure code is uppercase and unique"""
        if value:
            value = value.upper().strip()
            instance = self.instance
            if instance and Package.objects.filter(code=value).exclude(pk=instance.pk).exists():
                raise serializers.ValidationError('A package with this code already exists')
            elif not instance and Package.objects.filter(code=value).exists():
                raise serializers.ValidationError('A package with this code already exists')
        return value


class SubscriptionSerializer(serializers.ModelSerializer):
    """Serializer for Subscription model"""
    
    customer_name = serializers.CharField(source='customer.customer_number', read_only=True)
    customer_full_name = serializers.SerializerMethodField()
    package_name = serializers.CharField(source='package.name', read_only=True)
    package_code = serializers.CharField(source='package.code', read_only=True)
    vehicle_display = serializers.SerializerMethodField()
    vehicle_license_plate = serializers.CharField(source='vehicle.license_plate', read_only=True)
    is_active_status = serializers.SerializerMethodField()
    is_expired_status = serializers.SerializerMethodField()
    days_remaining = serializers.SerializerMethodField()
    remaining_allowances = serializers.SerializerMethodField()
    invoice_id = serializers.SerializerMethodField()
    is_refund_eligible = serializers.SerializerMethodField()
    calculated_refund_amount = serializers.SerializerMethodField()
    
    class Meta:
        model = Subscription
        fields = [
            'id', 'subscription_number',
            'customer', 'customer_name', 'customer_full_name',
            'package', 'package_name', 'package_code',
            'vehicle', 'vehicle_display', 'vehicle_license_plate',
            'start_date', 'end_date', 'activation_date',
            'status', 'is_active_status','is_expired_status', 'days_remaining',
            'auto_renew',
            'purchase_price', 'original_price', 'discount_applied', 'discount_reason',
            'payment_status',
            'cancelled_at', 'cancellation_reason',
            'purchased_at', 'remaining_allowances', 'invoice_id',
            'is_refund_eligible', 'calculated_refund_amount',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'subscription_number', 'purchased_at',
            'created_at', 'updated_at',
            'is_active_status', 'is_expired_status', 'days_remaining',
            'remaining_allowances', 'invoice_id',
            'is_refund_eligible', 'calculated_refund_amount'
        ]
    
    def get_customer_full_name(self, obj):
        """Get customer full name"""
        return obj.customer.full_name if hasattr(obj.customer, 'full_name') else str(obj.customer)

    def get_vehicle_display(self, obj):
        """Get the vehicle registration plate for subscription views."""
        if not obj.vehicle:
            return None

        if obj.vehicle.license_plate:
            return obj.vehicle.license_plate

        vehicle_name = " ".join(
            str(part)
            for part in [obj.vehicle.year, obj.vehicle.make, obj.vehicle.model]
            if part
        )
        return vehicle_name or f"Vehicle #{obj.vehicle_id}"
    
    def get_is_active_status(self, obj):
        """Check if subscription is active"""
        return obj.is_active()
    
    def get_is_expired_status(self, obj):
        """Check if subscription is expired"""
        return obj.is_expired()
    
    def get_days_remaining(self, obj):
        """Get days remaining"""
        return obj.days_remaining()
    
    def get_remaining_allowances(self, obj):
        """Get remaining allowances"""
        return obj.get_all_remaining_allowances()
    
    def get_invoice_id(self, obj):
        """Get associated invoice ID if available"""
        # Try to get from context first (for newly created subscriptions)
        if hasattr(self, '_invoice_id'):
            return self._invoice_id
        
        # Try to get from subscription metadata (most reliable)
        # Check if metadata field exists (it may not be in the model yet)
        if hasattr(obj, 'metadata') and obj.metadata:
            # Check for renewal invoice first (most recent)
            if obj.metadata.get('renewal_invoice_id'):
                return obj.metadata.get('renewal_invoice_id')
            # Fall back to original invoice
            if obj.metadata.get('invoice_id'):
                return obj.metadata.get('invoice_id')
        
        # Fallback: find by description match (for backward compatibility)
        try:
            from apps.billing.models import Invoice
            invoice = Invoice.objects.filter(
                customer=obj.customer,
                description__icontains=f"Subscription: {obj.package.name}",
                invoice_date__gte=obj.purchased_at.date() if obj.purchased_at else obj.start_date
            ).order_by('-created_at').first()
            return invoice.id if invoice else None
        except Exception:
            return None
    
    def get_is_refund_eligible(self, obj):
        """Check if subscription is eligible for refund (AA 30-day policy)"""
        return obj.is_refund_eligible()
    
    def get_calculated_refund_amount(self, obj):
        """Get calculated prorated refund amount"""
        return str(obj.calculate_prorated_refund())


class SubscriptionListSerializer(serializers.ModelSerializer):
    """Minimal serializer for subscription lists"""
    
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    package_name = serializers.CharField(source='package.name', read_only=True)
    vehicle_display = serializers.SerializerMethodField()
    vehicle_license_plate = serializers.CharField(source='vehicle.license_plate', read_only=True)
    is_active_status = serializers.SerializerMethodField()
    days_remaining = serializers.SerializerMethodField()
    invoice_id = serializers.SerializerMethodField()
    
    class Meta:
        model = Subscription
        fields = [
            'id', 'subscription_number',
            'customer', 'customer_name',
            'package', 'package_name',
            'vehicle', 'vehicle_display', 'vehicle_license_plate',
            'start_date', 'end_date', 'activation_date',
            'status', 'is_active_status', 'days_remaining',
            'invoice_id',
            'payment_status'
        ]

    def get_is_active_status(self, obj):
        """Check if subscription is currently usable."""
        return obj.is_active()
    
    def get_days_remaining(self, obj):
        """Get days remaining"""
        return obj.days_remaining()

    def get_vehicle_display(self, obj):
        """Get the vehicle registration plate for subscription lists."""
        if not obj.vehicle:
            return None

        if obj.vehicle.license_plate:
            return obj.vehicle.license_plate

        vehicle_name = " ".join(
            str(part)
            for part in [obj.vehicle.year, obj.vehicle.make, obj.vehicle.model]
            if part
        )
        return vehicle_name or f"Vehicle #{obj.vehicle_id}"

    def get_invoice_id(self, obj):
        """Get the most relevant invoice ID for list actions."""
        if getattr(obj, 'metadata', None):
            if obj.metadata.get('renewal_invoice_id'):
                return obj.metadata.get('renewal_invoice_id')
            if obj.metadata.get('invoice_id'):
                return obj.metadata.get('invoice_id')
        return None


class SubscriptionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating subscriptions"""
    
    class Meta:
        model = Subscription
        fields = [
            'id', 'subscription_number', 
            'customer', 'package', 'vehicle',
            'start_date', 'end_date',  # end_date is optional, will be calculated
            'auto_renew', 'purchase_price',
            'payment_status'
        ]
        read_only_fields = ['id', 'subscription_number']
        extra_kwargs = {
            'customer': {'required': False},
            'vehicle': {'required': True},
            'start_date': {'required': False},
            'end_date': {'required': False},
            'purchase_price': {'required': False},
            'payment_status': {'required': False},
        }
    
    def validate(self, data):
        """Validate subscription creation"""
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        package = data.get('package')
        vehicle = data.get('vehicle')
        
        if not vehicle:
            raise serializers.ValidationError({'vehicle': 'Vehicle is required'})
            
        # AA Membership vehicle type validation
        ALLOWED_VEHICLE_TYPES = ['saloon', 'suv', 'pickup', 'minivan']
        if vehicle.vehicle_type not in ALLOWED_VEHICLE_TYPES:
            raise serializers.ValidationError({
                'vehicle': f'Vehicle type "{vehicle.get_vehicle_type_display()}" is not covered by AA membership and cannot be subscribed. '
                           f'Allowed types: Saloon, SUV, Pick-Up, Mini van.'
            })
            
        # Prevent overlapping live/pending subscriptions for the same vehicle.
        if vehicle:
            overlaps = Subscription.objects.filter(
                vehicle=vehicle,
                status__in=['pending', 'active', 'suspended'],
            )
            if self.instance:
                overlaps = overlaps.exclude(pk=self.instance.pk)
            
            if overlaps.exists():
                raise serializers.ValidationError({
                    'vehicle': f'Vehicle {vehicle.license_plate} already has an existing subscription.'
                })
        
        start_date = data.get('start_date')
        customer = data.get('customer')

        # Auto-bind customer if caller is a customer
        if not customer and user and getattr(user, 'role', None) == 'customer':
            customer_profile = getattr(user, 'customer_profile', None)
            if not customer_profile:
                try:
                    customer_profile = Customer.objects.get(user=user)
                except Customer.DoesNotExist:
                    customer_profile = None
            if customer_profile:
                data['customer'] = customer_profile
        elif not customer:
            raise serializers.ValidationError({'customer': 'Customer is required'})

        if not data.get('customer'):
            raise serializers.ValidationError({'customer': 'Customer is required'})

        # Ensure vehicle belongs to the customer after customer auto-binding.
        if vehicle and vehicle.owner_id != data['customer'].id:
            raise serializers.ValidationError({'vehicle': 'Vehicle does not belong to this customer'})

        if not package:
            raise serializers.ValidationError({'package': 'Package is required'})
        
        if not package.is_active:
            raise serializers.ValidationError({'package': 'Package is not active'})
        
        if not start_date:
            from django.utils import timezone
            data['start_date'] = timezone.now().date()

        # Set defaults
        if not data.get('purchase_price'):
            data['purchase_price'] = package.price

        if not data.get('payment_status'):
            data['payment_status'] = 'pending'
        
        return data


class SubscriptionUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating subscriptions"""
    
    class Meta:
        model = Subscription
        fields = [
            'status', 'auto_renew',
            'payment_status',
            'cancellation_reason'
        ]


class SubscriptionUsageSerializer(serializers.ModelSerializer):
    """Serializer for SubscriptionUsage model"""
    
    subscription_number = serializers.CharField(source='subscription.subscription_number', read_only=True)
    customer_name = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    usage_type_label = serializers.SerializerMethodField()
    reference_label = serializers.SerializerMethodField()
    activity_label = serializers.SerializerMethodField()
    is_refund = serializers.SerializerMethodField()
    
    class Meta:
        model = SubscriptionUsage
        fields = [
            'id',
            'subscription', 'subscription_number',
            'usage_type', 'usage_type_label', 'quantity_used',
            'service_date', 'customer_name',
            'reference_type', 'reference_id', 'reference_label',
            'description', 'activity_label', 'is_refund',
            'created_by', 'created_by_name',
            'created_at'
        ]
        read_only_fields = [
            'id', 'created_at', 'created_by'
        ]
    
    def get_customer_name(self, obj):
        """Get customer name"""
        return obj.subscription.customer.customer_number if obj.subscription else None

    def get_usage_type_label(self, obj):
        """Display canonical feature keys as user-facing service names."""
        labels = {
            'roadside_first_aid': 'Mechanical & Electrical First Aid',
            'towing_services_km': 'Towing Service',
            'emergency_fuel': 'Emergency Fuel Delivery',
            'key_lock_out': 'Key Lock Out',
            'extrication': 'Extrication',
            'accident_estimate': 'Accident Estimate',
            'pre_purchase_inspection': 'Pre-Purchase Inspection',
            'battery_boosts': 'Battery Boost',
            'flat_tyre_service': 'Flat Tyre Service',
            'total_service_calls': 'Service Call',
            'kilometer': 'Kilometer',
            'call_out': 'Call Out',
            'towing': 'Towing Service',
            'inspection': 'Inspection',
            'roadside_assistance': 'Roadside Assistance',
            'other': 'Other',
        }
        return labels.get(obj.usage_type, obj.usage_type.replace('_', ' ').title())

    def get_reference_label(self, obj):
        """Show a useful related-object label instead of a raw id."""
        if not obj.reference_type or not obj.reference_id:
            return ''

        if obj.reference_type == 'roadside':
            try:
                from apps.roadside.models import RoadsideRequest
                roadside_request = RoadsideRequest.objects.only('request_number').get(pk=obj.reference_id)
                return roadside_request.request_number
            except RoadsideRequest.DoesNotExist:
                return f"Roadside #{obj.reference_id}"

        return f"{obj.get_reference_type_display()} #{obj.reference_id}"

    def get_activity_label(self, obj):
        """Prefer the recorded description, falling back to service label."""
        return obj.description or self.get_usage_type_label(obj)

    def get_is_refund(self, obj):
        """Whether this activity added allowance back."""
        return obj.quantity_used < 0


class SubscriptionUsageCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating subscription usage"""
    
    class Meta:
        model = SubscriptionUsage
        fields = [
            'subscription', 'usage_type', 'quantity_used',
            'service_date', 'reference_type', 'reference_id',
            'description'
        ]
    
    def validate(self, data):
        """Validate usage creation"""
        subscription = data.get('subscription')
        usage_type = data.get('usage_type')
        quantity_used = data.get('quantity_used', 0)
        
        if not subscription:
            raise serializers.ValidationError({'subscription': 'Subscription is required'})
        
        # Check if subscription is active
        if not subscription.is_active() or subscription.is_expired():
            raise serializers.ValidationError({
                'subscription': 'Subscription is not active or has expired'
            })
        
        # Check if there's remaining allowance
        remaining = subscription.get_remaining_allowance(usage_type)
        if remaining < quantity_used:
            raise serializers.ValidationError({
                'quantity_used': f'Insufficient allowance. Remaining: {remaining}'
            })
        
        return data
