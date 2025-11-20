"""
Serializers for accounts app
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model"""
    
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    customer_profile = serializers.SerializerMethodField()
    branch = serializers.SerializerMethodField()
    managed_branches = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()
    managed_branches_names = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name', 'full_name',
            'phone', 'role', 'profile_picture', 'date_of_birth',
            'address', 'city', 'state', 'zip_code', 'country',
            'email_notifications', 'sms_notifications',
            'is_active', 'created_at', 'updated_at', 'customer_profile',
            'branch', 'managed_branches', 'branch_name', 'managed_branches_names',
            'employee_id', 'hire_date', 'hourly_rate'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'password': {'write_only': True}
        }
    
    def get_customer_profile(self, obj):
        """Include customer profile if user is a customer"""
        if hasattr(obj, 'customer_profile'):
            return {
                'id': obj.customer_profile.id,
                'customer_type': obj.customer_profile.customer_type,
                'customer_number': getattr(obj.customer_profile, 'customer_number', None),
            }
        return None
    
    def get_branch(self, obj):
        """Return branch ID if user has a branch"""
        return obj.branch.id if obj.branch else None
    
    def get_managed_branches(self, obj):
        """Return list of managed branch IDs"""
        return list(obj.managed_branches.values_list('id', flat=True))
    
    def get_branch_name(self, obj):
        """Return branch name for display"""
        return obj.branch.name if obj.branch else None
    
    def get_managed_branches_names(self, obj):
        """Return list of managed branch names"""
        return list(obj.managed_branches.values_list('name', flat=True))


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating users"""
    
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True, label='Confirm Password')
    
    class Meta:
        model = User
        fields = [
            'email', 'username', 'password', 'password2',
            'first_name', 'last_name', 'phone', 'role',
            'branch', 'managed_branches', 'employee_id', 'hire_date', 'hourly_rate',
            'is_active'
        ]
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Set queryset for branch fields dynamically
        from apps.branches.models import Branch
        branch_queryset = Branch.objects.filter(is_active=True)
        
        # Add branch field with queryset
        self.fields['branch'] = serializers.PrimaryKeyRelatedField(
            queryset=branch_queryset,
            required=False,
            allow_null=True,
            help_text="Single branch assignment for non-manager staff"
        )
        
        # Add managed_branches field with queryset
        self.fields['managed_branches'] = serializers.PrimaryKeyRelatedField(
            many=True,
            queryset=branch_queryset,
            required=False,
            help_text="Multiple branch assignment for managers"
        )
    
    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        
        role = attrs.get('role')
        branch = attrs.get('branch')
        managed_branches = attrs.get('managed_branches', [])
        
        # Validate branch assignment based on role
        if role == 'manager':
            # Managers should use managed_branches, not branch
            if branch:
                raise serializers.ValidationError({
                    "branch": "Managers should be assigned via managed_branches, not branch field."
                })
        elif role in ['receptionist', 'technician', 'parts_manager', 'service_coordinator', 'accountant']:
            # Staff should use branch, not managed_branches
            if managed_branches:
                raise serializers.ValidationError({
                    "managed_branches": f"{role} role should be assigned to a single branch, not multiple branches."
                })
        
        return attrs
    
    def create(self, validated_data):
        password2 = validated_data.pop('password2')
        managed_branches = validated_data.pop('managed_branches', [])
        branch = validated_data.pop('branch', None)
        
        # Set is_staff for non-customer roles
        role = validated_data.get('role')
        if role != 'customer':
            validated_data['is_staff'] = True
        
        user = User.objects.create_user(**validated_data)
        
        # Assign branch based on role
        if role == 'manager' and managed_branches:
            user.managed_branches.set(managed_branches)
        elif branch and role in ['receptionist', 'technician', 'parts_manager', 'service_coordinator', 'accountant']:
            user.branch = branch
            user.save()
        
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating user profile"""
    
    role = serializers.ChoiceField(choices=User.ROLE_CHOICES, required=False)
    is_active = serializers.BooleanField(required=False)
    
    class Meta:
        model = User
        fields = [
            'first_name', 'last_name', 'phone', 'profile_picture',
            'date_of_birth', 'address', 'city', 'state', 'zip_code', 'country',
            'email_notifications', 'sms_notifications', 'role', 'is_active',
            'branch', 'managed_branches', 'employee_id', 'hire_date', 'hourly_rate'
        ]
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Set queryset for branch fields dynamically
        from apps.branches.models import Branch
        branch_queryset = Branch.objects.filter(is_active=True)
        
        # Add branch field with queryset
        self.fields['branch'] = serializers.PrimaryKeyRelatedField(
            queryset=branch_queryset,
            required=False,
            allow_null=True,
            help_text="Single branch assignment for non-manager staff"
        )
        
        # Add managed_branches field with queryset
        self.fields['managed_branches'] = serializers.PrimaryKeyRelatedField(
            many=True,
            queryset=branch_queryset,
            required=False,
            help_text="Multiple branch assignment for managers"
        )
    
    def validate(self, attrs):
        role = attrs.get('role', self.instance.role if self.instance else None)
        branch = attrs.get('branch')
        managed_branches = attrs.get('managed_branches')
        
        # If role is being changed, validate branch assignment
        if role:
            if role == 'manager':
                # Managers should use managed_branches, not branch
                if branch is not None:
                    raise serializers.ValidationError({
                        "branch": "Managers should be assigned via managed_branches, not branch field."
                    })
                # Clear branch if switching to manager
                if self.instance and self.instance.branch:
                    attrs['branch'] = None
            elif role in ['receptionist', 'technician', 'parts_manager', 'service_coordinator', 'accountant']:
                # Staff should use branch, not managed_branches
                if managed_branches is not None and len(managed_branches) > 0:
                    raise serializers.ValidationError({
                        "managed_branches": f"{role} role should be assigned to a single branch, not multiple branches."
                    })
                # Clear managed_branches if switching to staff role
                if self.instance:
                    self.instance.managed_branches.clear()
        
        return attrs
    
    def update(self, instance, validated_data):
        managed_branches = validated_data.pop('managed_branches', None)
        role = validated_data.get('role', instance.role)
        
        # Update basic fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        instance.save()
        
        # Update branch assignments
        if managed_branches is not None:
            if role == 'manager':
                instance.managed_branches.set(managed_branches)
            else:
                instance.managed_branches.clear()
        
        # Update is_staff based on role
        if role != 'customer':
            instance.is_staff = True
        else:
            instance.is_staff = False
        instance.save()
        
        return instance


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for password change"""
    
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True, validators=[validate_password])
    new_password2 = serializers.CharField(required=True, write_only=True, label='Confirm New Password')
    
    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password2']:
            raise serializers.ValidationError({"new_password": "Password fields didn't match."})
        return attrs
    
    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value


class StaffUserSerializer(serializers.ModelSerializer):
    """Serializer for staff members with employment info"""
    
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    
    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name', 'full_name',
            'phone', 'role', 'profile_picture',
            'employee_id', 'hire_date', 'hourly_rate',
            'is_active', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class PublicUserSerializer(serializers.ModelSerializer):
    """Minimal serializer for public user info"""
    
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    
    class Meta:
        model = User
        fields = ['id', 'full_name', 'role', 'profile_picture']
