from rest_framework import serializers
from .models import Technician, Skill, TimeOffRequest, Shift, Certification
from apps.accounts.serializers import UserSerializer

class SkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = ['id', 'name', 'description', 'is_active']

class TechnicianSerializer(serializers.ModelSerializer):
    user_details = UserSerializer(source='user', read_only=True)
    skills = SkillSerializer(many=True, read_only=True)
    skill_ids = serializers.PrimaryKeyRelatedField(
        many=True, write_only=True, queryset=Skill.objects.all(), source='skills'
    )

    # Write-only fields for creating/updating a user
    email = serializers.EmailField(write_only=True, required=False, validators=[])
    first_name = serializers.CharField(write_only=True, required=False)
    last_name = serializers.CharField(write_only=True, required=False)
    password = serializers.CharField(write_only=True, style={'input_type': 'password'}, required=False)
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    role = serializers.ChoiceField(
        choices=['technician', 'service_coordinator'],
        default='technician',
        write_only=True,
        required=False
    )
    profile_picture = serializers.ImageField(write_only=True, required=False)

    class Meta:
        model = Technician
        fields = [
            'id', 'user', 'user_details', 'bio', 'skills', 'skill_ids',
            'years_of_experience', 'current_status', 
            'last_latitude', 'last_longitude', 'last_location_update',
            'created_at', 'updated_at',
            # Write-only user fields
            'email', 'first_name', 'last_name', 'password', 'phone', 'role', 'profile_picture'
        ]
        read_only_fields = ['user', 'last_location_update']

    def validate_email(self, value):
        """
        Check that the email is unique, but allow the same email for the current user during updates
        """
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        # During update, check if the email belongs to the current user
        if self.instance and self.instance.user.email == value:
            # Same email as current user, no validation needed
            return value
        
        # Check if email already exists for another user
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        
        return value

    def create(self, validated_data):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        # Extract user data
        # Default required fields must be present for creation
        email = validated_data.pop('email')
        password = validated_data.pop('password')
        first_name = validated_data.pop('first_name')
        last_name = validated_data.pop('last_name')
        phone = validated_data.pop('phone', '')
        role = validated_data.pop('role', 'technician')
        profile_picture = validated_data.pop('profile_picture', None)
        
        # Extract skills
        skills = validated_data.pop('skills', [])

        # Create User
        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            role=role,
            profile_picture=profile_picture
        )

        # Create Technician
        technician = Technician.objects.create(user=user, **validated_data)
        
        # Set Skills
        technician.skills.set(skills)
        
        return technician

    def update(self, instance, validated_data):
        # Extract user data
        user_data = {}
        for field in ['email', 'first_name', 'last_name', 'phone', 'role', 'password', 'profile_picture']:
            if field in validated_data:
                user_data[field] = validated_data.pop(field)
        
        # Update User
        user = instance.user
        if user_data:
            for attr, value in user_data.items():
                if attr == 'password':
                    user.set_password(value)
                else:
                    setattr(user, attr, value)
            user.save()
            
        # Update Technician (handled by super for remaining fields)
        return super().update(instance, validated_data)


class TimeOffRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimeOffRequest
        fields = '__all__'
        read_only_fields = ['reviewed_by', 'reviewed_at', 'status']

class ShiftSerializer(serializers.ModelSerializer):
    """
    Serializer for technician shifts.
    """
    technician_name = serializers.CharField(source='technician.user.get_full_name', read_only=True)
    scheduled_hours = serializers.FloatField(read_only=True)
    
    class Meta:
        model = Shift
        fields = [
            'id', 'technician', 'technician_name', 'start_time', 'end_time', 'status', 'notes',
            'actual_start_time', 'actual_end_time', 'break_duration', 'actual_hours', 'overtime_hours',
            'scheduled_hours', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'actual_hours', 'overtime_hours']

    def validate(self, data):
        """
        Check start_time < end_time
        """
        if 'start_time' in data and 'end_time' in data:
            if data['start_time'] >= data['end_time']:
                raise serializers.ValidationError("End time must be after start time.")
        return data

class TechnicianJobHistorySerializer(serializers.ModelSerializer):
    """
    Read-only serializer for technician job history (from WorkOrder).
    """
    customer_name = serializers.CharField(source='customer.get_full_name', read_only=True)
    vehicle_info = serializers.CharField(source='vehicle.__str__', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        # We need to import WorkOrder inside the method or here to avoid circular imports?
        # Ideally import at top if possible, but apps.workorders might import technicians.
        # Let's use string reference if possible or handle import carefully.
        # Check if we can import WorkOrder at top of file.
        from apps.workorders.models import WorkOrder
        model = WorkOrder
        fields = [
            'id', 'work_order_number', 'customer_name', 'vehicle_info', 
            'status', 'status_display', 'completed_at', 'actual_total'
        ]


class CertificationSerializer(serializers.ModelSerializer):
    """
    Serializer for Certification model with expiry tracking
    """
    from .models import Certification
    
    technician_name = serializers.CharField(source='technician.user.get_full_name', read_only=True)
    is_expiring_soon = serializers.BooleanField(read_only=True)
    days_until_expiry = serializers.IntegerField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    
    class Meta:
        from .models import Certification
        model = Certification
        fields = [
            'id', 'technician', 'technician_name', 'name', 'certification_number',
            'issuing_authority', 'issue_date', 'expiry_date', 'status',
            'document_file', 'notes', 'is_expiring_soon', 'days_until_expiry',
            'is_expired', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def validate(self, data):
        """Ensure issue_date is before expiry_date if both are provided"""
        issue_date = data.get('issue_date')
        expiry_date = data.get('expiry_date')
        
        if issue_date and expiry_date and issue_date >= expiry_date:
            raise serializers.ValidationError({
                'expiry_date': 'Expiry date must be after issue date.'
            })
        
        return data
