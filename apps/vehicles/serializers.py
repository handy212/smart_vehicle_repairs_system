"""
Serializers for vehicles app
"""
from rest_framework import serializers
from .models import Vehicle, VehicleMileageHistory, VehicleDocument, VehiclePhoto
from .vin_decoder import decode_vin, get_vehicle_specs


class VehicleListSerializer(serializers.ModelSerializer):
    """Serializer for vehicle list view"""
    owner_name = serializers.CharField(source='owner.user.get_full_name', read_only=True)
    owner_number = serializers.CharField(source='owner.customer_number', read_only=True)
    display_name = serializers.CharField(read_only=True)
    is_due_for_service = serializers.BooleanField(read_only=True)
    warranty_active = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Vehicle
        fields = [
            'id', 'vin', 'year', 'make', 'model', 'trim', 'license_plate',
            'current_mileage', 'mileage_unit', 'status', 'owner', 'owner_name',
            'owner_number', 'display_name', 'is_due_for_service', 'warranty_active',
            'last_service_date', 'next_service_due_date', 'created_at'
        ]


class VehicleDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer for vehicle"""
    owner_name = serializers.CharField(source='owner.user.get_full_name', read_only=True)
    owner_number = serializers.CharField(source='owner.customer_number', read_only=True)
    display_name = serializers.CharField(read_only=True)
    is_due_for_service = serializers.BooleanField(read_only=True)
    warranty_active = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Vehicle
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class VehicleCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating vehicle with automatic VIN decoding
    
    When a VIN is provided, it will automatically decode and populate:
    - year, make, model, trim
    - engine_type, engine_size
    - transmission_type
    
    You can override any auto-filled fields by explicitly providing them.
    """
    auto_decode_vin = serializers.BooleanField(
        write_only=True, 
        default=True,
        required=False,
        help_text="Automatically decode VIN and fill vehicle details"
    )
    
    class Meta:
        model = Vehicle
        fields = [
            'owner', 'vin', 'year', 'make', 'model', 'trim',
            'exterior_color', 'interior_color', 'license_plate', 'license_plate_state',
            'current_mileage', 'mileage_unit', 'engine_type', 'engine_size',
            'transmission_type', 'fuel_tank_capacity', 'tire_size',
            'condition_rating', 'purchase_date', 'warranty_expiry_date',
            'warranty_type', 'warranty_coverage', 'status', 'notes', 'tags',
            'auto_decode_vin'
        ]
    
    def validate_vin(self, value):
        """Validate VIN format"""
        if not value:
            raise serializers.ValidationError("VIN is required")
        
        vin = value.upper().strip()
        
        if len(vin) != 17:
            raise serializers.ValidationError(f"VIN must be exactly 17 characters (got {len(vin)})")
        
        # Check for invalid characters
        invalid_chars = set('IOQ')
        if any(char in invalid_chars for char in vin):
            raise serializers.ValidationError("VIN cannot contain letters I, O, or Q")
        
        return vin
    
    def create(self, validated_data):
        """
        Create vehicle with automatic VIN decoding
        """
        auto_decode = validated_data.pop('auto_decode_vin', True)
        vin = validated_data.get('vin')
        
        # If auto_decode is enabled and VIN is provided
        if auto_decode and vin:
            # Get VIN specs
            specs = get_vehicle_specs(vin)
            
            if specs:
                # Auto-fill fields that weren't explicitly provided
                # Only fill if the field is not already set
                for field, value in specs.items():
                    if field not in validated_data or validated_data.get(field) is None:
                        validated_data[field] = value
        
        return super().create(validated_data)


class VINDecodeSerializer(serializers.Serializer):
    """
    Serializer for VIN decode response
    Used to return decoded VIN data to frontend for form auto-fill
    """
    vin = serializers.CharField(max_length=17)
    exists = serializers.BooleanField(default=False)
    vehicle_id = serializers.IntegerField(required=False, allow_null=True)
    
    # Decoded vehicle data
    year = serializers.IntegerField(required=False, allow_null=True)
    make = serializers.CharField(required=False, allow_blank=True)
    model = serializers.CharField(required=False, allow_blank=True)
    trim = serializers.CharField(required=False, allow_blank=True)
    engine_type = serializers.CharField(required=False, allow_blank=True)
    engine_size = serializers.CharField(required=False, allow_blank=True)
    transmission_type = serializers.CharField(required=False, allow_blank=True)
    body_class = serializers.CharField(required=False, allow_blank=True)
    vehicle_type = serializers.CharField(required=False, allow_blank=True)
    manufacturer = serializers.CharField(required=False, allow_blank=True)
    
    # Additional info
    summary = serializers.CharField(required=False, allow_blank=True)
    has_errors = serializers.BooleanField(default=False)
    error_message = serializers.CharField(required=False, allow_blank=True)


class VehicleUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating vehicle"""
    
    class Meta:
        model = Vehicle
        fields = [
            'owner', 'year', 'make', 'model', 'trim', 'exterior_color',
            'interior_color', 'license_plate', 'license_plate_state',
            'current_mileage', 'engine_type', 'engine_size', 'transmission_type',
            'fuel_tank_capacity', 'tire_size', 'condition_rating',
            'warranty_expiry_date', 'warranty_type', 'warranty_coverage',
            'last_service_date', 'next_service_due_date', 'next_service_due_mileage',
            'status', 'notes', 'tags'
        ]


class VehicleMileageHistorySerializer(serializers.ModelSerializer):
    """Serializer for mileage history"""
    recorded_by_name = serializers.CharField(source='recorded_by.get_full_name', read_only=True)
    
    class Meta:
        model = VehicleMileageHistory
        fields = ['id', 'vehicle', 'mileage', 'recorded_date', 'recorded_by', 
                  'recorded_by_name', 'notes']
        read_only_fields = ['id', 'recorded_by']


class VehicleDocumentSerializer(serializers.ModelSerializer):
    """Serializer for vehicle documents"""
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = VehicleDocument
        fields = ['id', 'vehicle', 'document_type', 'title', 'file', 'expiry_date',
                  'notes', 'uploaded_by', 'uploaded_by_name', 'uploaded_at', 'is_expired']
        read_only_fields = ['id', 'uploaded_by', 'uploaded_at']


class VehiclePhotoSerializer(serializers.ModelSerializer):
    """Serializer for vehicle photos"""
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)
    
    class Meta:
        model = VehiclePhoto
        fields = ['id', 'vehicle', 'photo_type', 'image', 'caption', 'taken_date',
                  'uploaded_by', 'uploaded_by_name', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_by', 'uploaded_at']
