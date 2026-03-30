"""
Serializers for vehicles app
"""
from rest_framework import serializers
from django.utils import timezone
from .models import Vehicle, VehicleMileageHistory, VehicleDocument, VehiclePhoto, ServiceType, VehicleServiceSchedule, VehicleOwnershipHistory
from .vin_decoder import decode_vin, VehicleVINDecoder


class VehicleListSerializer(serializers.ModelSerializer):
    """Serializer for vehicle list view"""
    owner_name = serializers.CharField(source='owner.user.get_full_name', read_only=True)
    owner_number = serializers.CharField(source='owner.customer_number', read_only=True)
    display_name = serializers.CharField(read_only=True)
    is_due_for_service = serializers.BooleanField(read_only=True)
    due_service_name = serializers.SerializerMethodField()
    warranty_active = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Vehicle
        fields = [
            'id', 'vin', 'year', 'make', 'model', 'trim', 'vehicle_type', 'license_plate',
            'current_mileage', 'mileage_unit', 'status', 'owner', 'owner_name',
            'owner_number', 'display_name', 'is_due_for_service', 'due_service_name', 
            'warranty_active', 'last_service_date', 'next_service_due_date', 
            'health_score', 'is_high_risk', 'average_daily_mileage', 'relationship', 'created_at', 'image'
        ]

    def get_due_service_name(self, obj):
        """Get the name of the most urgent due service"""
        due_schedule = obj.service_schedules.filter(is_active=True).order_by('next_service_due_date', 'next_service_due_mileage').first()
        if due_schedule and due_schedule.is_due:
            return due_schedule.service_type.name
        return None


class VehicleDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer for vehicle"""
    owner_name = serializers.CharField(source='owner.user.get_full_name', read_only=True)
    owner_number = serializers.CharField(source='owner.customer_number', read_only=True)
    display_name = serializers.CharField(read_only=True)
    is_due_for_service = serializers.BooleanField(read_only=True)
    warranty_active = serializers.BooleanField(read_only=True)
    total_maintenance_cost = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    
    class Meta:
        model = Vehicle
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'health_score', 'is_high_risk', 'average_daily_mileage']


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
            'id', 'owner', 'vin', 'year', 'make', 'model', 'trim',
            'exterior_color', 'interior_color', 'license_plate', 'license_plate_state',
            'current_mileage', 'mileage_unit', 'engine_type', 'engine_size',
            'transmission_type', 'fuel_tank_capacity', 'tire_size',
            'condition_rating', 'purchase_date', 'warranty_expiry_date',
            'warranty_type', 'warranty_coverage', 'status', 'relationship', 'notes', 'tags',
            'image', 'auto_decode_vin'
        ]
        read_only_fields = ['id']
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
        """Validate VIN format and uniqueness"""
        if not value:
            raise serializers.ValidationError("VIN is required")
        
        vin = value.upper().strip()
        
        if len(vin) != 17:
            raise serializers.ValidationError(f"VIN must be exactly 17 characters (got {len(vin)})")
        
        # Check for invalid characters
        invalid_chars = set('IOQ')
        if any(char in invalid_chars for char in vin):
            raise serializers.ValidationError("VIN cannot contain letters I, O, or Q")
        
        # Check uniqueness (excluding current instance if updating)
        existing_vehicles = Vehicle.objects.filter(vin=vin)
        if self.instance and self.instance.pk:
            existing_vehicles = existing_vehicles.exclude(pk=self.instance.pk)
        
        if existing_vehicles.exists():
            raise serializers.ValidationError("A vehicle with this VIN already exists.")
        
        return vin
    
    def validate_license_plate(self, value):
        """Validate license plate uniqueness"""
        if not value:
            # License plate is required by model, but serializer allows blank for auto-generation
            return value
        
        license_plate = value.strip().upper()
        
        # Check uniqueness (excluding current instance if updating)
        existing_vehicles = Vehicle.objects.filter(license_plate=license_plate)
        if self.instance and self.instance.pk:
            existing_vehicles = existing_vehicles.exclude(pk=self.instance.pk)
        
        if existing_vehicles.exists():
            raise serializers.ValidationError("A vehicle with this license plate already exists.")
        
        return license_plate
    
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
                # Use VIN as fallback (VIN is unique, so this ensures uniqueness)
                vin = validated_data.get('vin', '')
                if vin and len(vin) >= 8:
                    # Use full VIN to ensure uniqueness (last 8 chars might collide)
                    base_plate = f"VIN-{vin[-8:]}"
                    # Ensure generated plate is unique
                    counter = 1
                    while Vehicle.objects.filter(license_plate=base_plate).exists():
                        base_plate = f"VIN-{vin[-8:]}-{counter}"
                        counter += 1
                    validated_data['license_plate'] = base_plate
                else:
                    # This should never happen since VIN is required, but handle it anyway
                    raise serializers.ValidationError({
                        'license_plate': 'License plate is required. Please provide a license plate or ensure VIN is valid.'
                    })
            else:
                # Ensure license_plate is a string and validate uniqueness
                validated_data['license_plate'] = str(license_plate).strip().upper()
                # Double-check uniqueness (validate_license_plate should have caught this, but be safe)
                if Vehicle.objects.filter(license_plate=validated_data['license_plate']).exists():
                    raise serializers.ValidationError({
                        'license_plate': 'A vehicle with this license plate already exists.'
                    })
            
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
                # Check if it's a database constraint error (IntegrityError)
                from django.db import IntegrityError
                if isinstance(save_error, IntegrityError):
                    error_msg = str(save_error).lower()
                    if 'vin' in error_msg or 'vehicles_vehicle_vin' in error_msg:
                        raise serializers.ValidationError({'vin': 'A vehicle with this VIN already exists.'})
                    elif 'license_plate' in error_msg or 'vehicles_vehicle_license_plate' in error_msg:
                        raise serializers.ValidationError({'license_plate': 'A vehicle with this license plate already exists.'})
                    else:
                        # Generic integrity error
                        raise serializers.ValidationError('A vehicle with this information already exists. Please check VIN and license plate.')
                # Re-raise as ValidationError with a user-friendly message
                raise serializers.ValidationError(f"Failed to save vehicle: {str(save_error)}")
            
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
            'owner', 'year', 'make', 'model', 'trim', 'vehicle_type',
            'exterior_color', 'interior_color', 'license_plate', 'license_plate_state',
            'current_mileage', 'engine_type', 'engine_size', 'transmission_type',
            'fuel_tank_capacity', 'tire_size', 'condition_rating',
            'warranty_expiry_date', 'warranty_type', 'warranty_coverage',
            'last_service_date', 'next_service_due_date', 'next_service_due_mileage',
            'status', 'relationship', 'notes', 'tags', 'image'
        ]
    
    def validate_license_plate(self, value):
        """Validate license plate uniqueness"""
        if not value:
            # License plate is required by model, but allow blank for updates if not changing
            return value
        
        license_plate = value.strip().upper()
        
        # Check uniqueness (excluding current instance)
        existing_vehicles = Vehicle.objects.filter(license_plate=license_plate)
        if self.instance and self.instance.pk:
            existing_vehicles = existing_vehicles.exclude(pk=self.instance.pk)
        
        if existing_vehicles.exists():
            raise serializers.ValidationError("A vehicle with this license plate already exists.")
        
        return license_plate


class VehicleMileageHistorySerializer(serializers.ModelSerializer):
    """Serializer for mileage history"""
    recorded_by_name = serializers.CharField(source='recorded_by.get_full_name', read_only=True)
    
    class Meta:
        model = VehicleMileageHistory
        fields = ['id', 'vehicle', 'mileage', 'recorded_date', 'recorded_by', 
                  'recorded_by_name', 'notes']
        read_only_fields = ['id', 'recorded_by']


class VehicleOwnershipHistorySerializer(serializers.ModelSerializer):
    """Serializer for ownership history"""
    previous_owner_name = serializers.SerializerMethodField()
    new_owner_name = serializers.SerializerMethodField()
    transferred_by_name = serializers.CharField(source='transferred_by.get_full_name', read_only=True)
    vehicle_display = serializers.CharField(source='vehicle.display_name', read_only=True)
    
    class Meta:
        model = VehicleOwnershipHistory
        fields = [
            'id', 'vehicle', 'vehicle_display', 'previous_owner', 'previous_owner_name',
            'new_owner', 'new_owner_name', 'transfer_date', 'transferred_by',
            'transferred_by_name', 'notes', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']
    
    def get_previous_owner_name(self, obj):
        if obj.previous_owner:
            if obj.previous_owner.user:
                return obj.previous_owner.user.get_full_name()
            return f"Customer #{obj.previous_owner.id}"
        return "N/A"
    
    def get_new_owner_name(self, obj):
        if obj.new_owner.user:
            return obj.new_owner.user.get_full_name()
        return f"Customer #{obj.new_owner.id}"


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


class ServiceTypeSerializer(serializers.ModelSerializer):
    """Serializer for service types"""
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    has_bundle = serializers.SerializerMethodField()
    
    class Meta:
        model = ServiceType
        fields = [
            'id', 'name', 'description', 'default_interval_months', 'default_interval_miles',
            'is_predefined', 'is_active', 'created_by', 'created_by_name',
            'created_at', 'updated_at', 'has_bundle'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'has_bundle']

    def get_has_bundle(self, obj):
        return hasattr(obj, 'service_bundle')



class ServiceTypeListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for service type list"""
    has_bundle = serializers.SerializerMethodField()
    
    class Meta:
        model = ServiceType
        fields = ['id', 'name', 'description', 'default_interval_months', 'default_interval_miles', 'is_predefined', 'is_active', 'has_bundle']

    def get_has_bundle(self, obj):
        return hasattr(obj, 'service_bundle')


class VehicleServiceScheduleSerializer(serializers.ModelSerializer):
    """Serializer for vehicle service schedules"""
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)
    vehicle_display = serializers.CharField(source='vehicle.display_name', read_only=True)
    customer_name = serializers.CharField(source='vehicle.owner.user.get_full_name', read_only=True)
    customer_phone = serializers.CharField(source='vehicle.owner.user.phone', read_only=True)
    customer_email = serializers.CharField(source='vehicle.owner.user.email', read_only=True)
    is_due = serializers.BooleanField(read_only=True)
    is_due_soon = serializers.BooleanField(read_only=True)
    estimated_due_date = serializers.DateField(read_only=True)
    days_until_due = serializers.IntegerField(read_only=True)
    miles_until_due = serializers.IntegerField(read_only=True)
    current_mileage = serializers.IntegerField(source='vehicle.current_mileage', read_only=True)
    
    class Meta:
        model = VehicleServiceSchedule
        fields = [
            'id', 'vehicle', 'vehicle_display', 'service_type', 'service_type_name',
            'last_service_date', 'last_service_mileage', 'next_service_due_date',
            'next_service_due_mileage', 'interval_months', 'interval_miles',
            'is_active', 'notes', 'created_at', 'updated_at',
            'customer_name', 'customer_phone', 'customer_email',
            'is_due', 'is_due_soon', 'estimated_due_date', 
            'days_until_due', 'miles_until_due', 'current_mileage'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class VehicleServiceScheduleListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for service schedule list"""
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)
    vehicle_display = serializers.CharField(source='vehicle.display_name', read_only=True)
    customer_name = serializers.CharField(source='vehicle.owner.user.get_full_name', read_only=True)
    is_due = serializers.BooleanField(read_only=True)
    is_due_soon = serializers.BooleanField(read_only=True)
    estimated_due_date = serializers.DateField(read_only=True)
    days_until_due = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = VehicleServiceSchedule
        fields = [
            'id', 'vehicle', 'vehicle_display', 'service_type', 'service_type_name',
            'next_service_due_date', 'next_service_due_mileage',
            'customer_name', 'is_due', 'is_due_soon', 'estimated_due_date', 'days_until_due'
        ]


class VehicleServiceScheduleCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating vehicle service schedules"""
    
    class Meta:
        model = VehicleServiceSchedule
        fields = [
            'vehicle', 'service_type', 'last_service_date', 'last_service_mileage',
            'next_service_due_date', 'next_service_due_mileage',
            'interval_months', 'interval_miles', 'is_active', 'notes'
        ]
    
    def create(self, validated_data):
        """Create schedule and calculate next due if last service is provided"""
        schedule = super().create(validated_data)
        
        # If last service date/mileage is provided, calculate next due
        if schedule.last_service_date or schedule.last_service_mileage is not None:
            schedule.calculate_next_service_due()
        
        return schedule


class VehicleServiceScheduleUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating vehicle service schedules"""
    
    class Meta:
        model = VehicleServiceSchedule
        fields = [
            'last_service_date', 'last_service_mileage',
            'next_service_due_date', 'next_service_due_mileage',
            'interval_months', 'interval_miles', 'is_active', 'notes'
        ]
    
    def update(self, instance, validated_data):
        """Update schedule and recalculate next due if last service changed"""
        last_service_date_before = instance.last_service_date
        last_service_mileage_before = instance.last_service_mileage
        
        schedule = super().update(instance, validated_data)
        
        # Recalculate if last service date or mileage changed
        if (schedule.last_service_date != last_service_date_before or
            schedule.last_service_mileage != last_service_mileage_before):
            schedule.calculate_next_service_due()
        
        return schedule
