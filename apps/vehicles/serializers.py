"""
Serializers for vehicles app
"""
from rest_framework import serializers
from django.utils import timezone
from .models import Vehicle, VehicleMileageHistory, VehicleDocument, VehiclePhoto
from .vin_decoder import decode_vin, VehicleVINDecoder


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
            'image', 'auto_decode_vin'
        ]
        extra_kwargs = {
            'license_plate': {'allow_blank': True, 'required': False},
        }
    
    def to_internal_value(self, data):
        """
        Convert FormData string values to proper types before validation
        This handles the case when image upload sends FormData with all values as strings
        """
        # Convert string numbers to integers/floats for numeric fields
        numeric_fields = ['year', 'current_mileage', 'owner', 'condition_rating', 
                         'next_service_due_mileage']
        decimal_fields = ['fuel_tank_capacity']
        boolean_fields = ['auto_decode_vin']
        
        # Handle both dict and QueryDict (from FormData)
        if hasattr(data, 'get'):  # dict-like object (dict, QueryDict, etc.)
            # Create a mutable copy if it's a QueryDict
            if hasattr(data, '_mutable') and not data._mutable:
                data = data.copy()
            
            for field in numeric_fields:
                if field in data:
                    value = data[field]
                    # Handle both single values and lists (QueryDict returns lists)
                    if isinstance(value, list):
                        value = value[0] if value else ''
                    if isinstance(value, str):
                        if value.strip():
                            try:
                                data[field] = int(value)
                            except (ValueError, TypeError):
                                pass  # Let the field validator handle the error
                        # Empty string for numeric field - will be handled in create() or validation
            
            for field in decimal_fields:
                if field in data:
                    value = data[field]
                    if isinstance(value, list):
                        value = value[0] if value else ''
                    if isinstance(value, str) and value.strip():
                        try:
                            data[field] = float(value)
                        except (ValueError, TypeError):
                            pass  # Let the field validator handle the error
            
            # Convert string booleans to actual booleans
            for field in boolean_fields:
                if field in data:
                    value = data[field]
                    if isinstance(value, list):
                        value = value[0] if value else ''
                    if isinstance(value, str):
                        value_lower = value.lower().strip()
                        if value_lower in ('true', '1', 'yes', 'on'):
                            data[field] = True
                        elif value_lower in ('false', '0', 'no', 'off', ''):
                            data[field] = False
        
        return super().to_internal_value(data)
    
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
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            auto_decode = validated_data.pop('auto_decode_vin', True)
            vin = validated_data.get('vin')
            
            # Provide defaults for required fields if not provided
            # Handle both None and empty string cases (FormData sends empty strings)
            # License plate is required by model, so use VIN as fallback if not provided
            license_plate = validated_data.get('license_plate')
            if not license_plate or (isinstance(license_plate, str) and not license_plate.strip()):
                # Use last 8 chars of VIN as fallback, or 'PENDING' if VIN not available
                vin = validated_data.get('vin', '')
                validated_data['license_plate'] = f"VIN-{vin[-8:]}" if vin and len(vin) >= 8 else 'PENDING'
            else:
                # Ensure license_plate is a string
                validated_data['license_plate'] = str(license_plate).strip()
            
            if 'current_mileage' not in validated_data or validated_data.get('current_mileage') is None:
                validated_data['current_mileage'] = 0
            
            # Ensure current_mileage is an integer (in case it came as string from FormData)
            if 'current_mileage' in validated_data:
                try:
                    validated_data['current_mileage'] = int(validated_data['current_mileage'])
                except (ValueError, TypeError):
                    validated_data['current_mileage'] = 0
            
            # Ensure year is an integer
            if 'year' in validated_data:
                try:
                    validated_data['year'] = int(validated_data['year'])
                except (ValueError, TypeError):
                    logger.error(f"Invalid year value: {validated_data.get('year')}")
                    raise serializers.ValidationError({'year': 'Year must be a valid integer'})
            
            # If auto_decode is enabled and VIN is provided
            if auto_decode and vin:
                try:
                    # Use decoder with a short timeout to prevent hanging
                    decoder = VehicleVINDecoder()
                    success, data = decoder.decode_vin(vin, timeout_seconds=3.0)
                    if success and isinstance(data, dict):
                        # Persist full decoded payload for later display (even if incomplete)
                        validated_data['vin_decoded_data'] = data
                        validated_data['vin_decoded_at'] = timezone.now()

                        # If decoder reports errors, don't auto-fill required fields
                        if not data.get('has_errors'):
                            specs = {
                                'year': data.get('year'),
                                'make': data.get('make'),
                                'model': data.get('model'),
                                'trim': data.get('trim'),
                                'engine_type': data.get('engine_type'),
                                'engine_size': data.get('engine_size'),
                                'transmission_type': data.get('transmission_type'),
                            }
                            specs = {k: v for k, v in specs.items() if v is not None}

                            # Auto-fill fields that weren't explicitly provided
                            for field, value in specs.items():
                                if field not in validated_data or validated_data.get(field) is None:
                                    validated_data[field] = value
                except Exception as e:
                    # If VIN decode fails, log but don't prevent vehicle creation
                    logger.warning(f"VIN decode failed for {vin}: {str(e)}", exc_info=True)
                    # Continue without decoded data
            
            # Create the vehicle
            try:
                vehicle = super().create(validated_data)
                logger.info(f"Successfully created vehicle with VIN: {vin}")
                return vehicle
            except Exception as save_error:
                logger.error(f"Error saving vehicle to database: {str(save_error)}", exc_info=True)
                # Check if it's a database constraint error
                error_msg = str(save_error)
                if 'unique constraint' in error_msg.lower() or 'duplicate' in error_msg.lower():
                    if 'vin' in error_msg.lower():
                        raise serializers.ValidationError({'vin': 'A vehicle with this VIN already exists.'})
                    elif 'license_plate' in error_msg.lower():
                        raise serializers.ValidationError({'license_plate': 'A vehicle with this license plate already exists.'})
                # Re-raise as ValidationError with a user-friendly message
                raise serializers.ValidationError(f"Failed to save vehicle: {error_msg}")
            
        except serializers.ValidationError:
            # Re-raise validation errors as-is
            raise
        except Exception as e:
            logger.error(f"Unexpected error creating vehicle: {str(e)}", exc_info=True)
            # Re-raise as ValidationError so it's properly handled by DRF
            error_message = str(e)
            # Provide a more user-friendly error message
            if 'timeout' in error_message.lower():
                error_message = "VIN decoding timed out. Please try again."
            elif 'network' in error_message.lower() or 'connection' in error_message.lower():
                error_message = "Network error during VIN decoding. Please try again."
            raise serializers.ValidationError(f"Error creating vehicle: {error_message}")


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

    # Expanded decoded info (used for displaying "Other Information" in UI)
    series = serializers.CharField(required=False, allow_blank=True)
    drive_type = serializers.CharField(required=False, allow_blank=True)
    gvwr = serializers.CharField(required=False, allow_blank=True)
    transmission_speeds = serializers.CharField(required=False, allow_blank=True)
    transmission_style = serializers.CharField(required=False, allow_blank=True)
    engine_cylinders = serializers.IntegerField(required=False, allow_null=True)
    engine_hp = serializers.IntegerField(required=False, allow_null=True)
    engine_model = serializers.CharField(required=False, allow_blank=True)
    engine_manufacturer = serializers.CharField(required=False, allow_blank=True)
    engine_displacement_l = serializers.CharField(required=False, allow_blank=True)
    fuel_type_primary = serializers.CharField(required=False, allow_blank=True)
    fuel_type_secondary = serializers.CharField(required=False, allow_blank=True)
    electrification_level = serializers.CharField(required=False, allow_blank=True)
    airbag_front = serializers.CharField(required=False, allow_blank=True)
    airbag_knee = serializers.CharField(required=False, allow_blank=True)
    airbag_side = serializers.CharField(required=False, allow_blank=True)
    airbag_curtain = serializers.CharField(required=False, allow_blank=True)
    airbag_seat_cushion = serializers.CharField(required=False, allow_blank=True)
    other_restraint_info = serializers.CharField(required=False, allow_blank=True)
    
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
            'status', 'notes', 'tags', 'image'
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
