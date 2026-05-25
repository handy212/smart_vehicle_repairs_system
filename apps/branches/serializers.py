"""
Serializers for branches app
"""
from rest_framework import serializers
from .models import Branch
from apps.accounts.models import User


class BranchSerializer(serializers.ModelSerializer):
    """Serializer for Branch model"""
    
    staff_count = serializers.ReadOnlyField()
    manager_count = serializers.ReadOnlyField()
    full_address = serializers.ReadOnlyField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    class Meta:
        model = Branch
        fields = [
            'id', 'name', 'code', 'description',
            'phone', 'email', 'fax',
            'address', 'city', 'state', 'zip_code', 'country', 'full_address',
            'is_active', 'is_headquarters',
            'opening_time', 'closing_time', 'timezone',
            'next_workorder_number', 'next_estimate_number',
            'next_invoice_number', 'next_diagnosis_number', 'next_inspection_number',
            'staff_count', 'manager_count',
            'created_by', 'created_by_name', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'created_by',
            'staff_count', 'manager_count', 'full_address', 'created_by_name'
        ]


class BranchListSerializer(serializers.ModelSerializer):
    """Minimal serializer for branch lists"""
    
    staff_count = serializers.ReadOnlyField()
    manager_count = serializers.ReadOnlyField()
    
    class Meta:
        model = Branch
        fields = [
            'id', 'name', 'code', 'city', 'state',
            'is_active', 'is_headquarters',
            'staff_count', 'manager_count'
        ]


class BranchCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating branches"""
    
    class Meta:
        model = Branch
        fields = [
            'name', 'code', 'description',
            'phone', 'email', 'fax',
            'address', 'city', 'state', 'zip_code', 'country',
            'is_active', 'is_headquarters',
            'opening_time', 'closing_time', 'timezone'
        ]
    
    def validate_code(self, value):
        """Ensure code is uppercase and valid"""
        if value:
            value = value.upper().strip()
            # Check if code matches pattern (only uppercase letters and numbers)
            import re
            if not re.match(r'^[A-Z0-9]+$', value):
                raise serializers.ValidationError(
                    'Branch code must contain only uppercase letters and numbers'
                )
            # Check uniqueness (exclude current instance if updating)
            instance = self.instance
            if instance and Branch.objects.filter(code=value).exclude(pk=instance.pk).exists():
                raise serializers.ValidationError(
                    'A branch with this code already exists'
                )
            elif not instance and Branch.objects.filter(code=value).exists():
                raise serializers.ValidationError(
                    'A branch with this code already exists'
                )
        return value
    
    def validate_name(self, value):
        """Validate branch name"""
        if value:
            value = value.strip()
            if len(value) < 2:
                raise serializers.ValidationError('Branch name must be at least 2 characters long')
            # Check uniqueness (exclude current instance if updating)
            instance = self.instance
            if Branch.objects.filter(name__iexact=value).exclude(pk=instance.pk if instance else None).exists():
                raise serializers.ValidationError(
                    'A branch with this name already exists'
                )
        return value
    
    def validate(self, data):
        """Cross-field validation"""
        # Validate opening/closing times
        opening_time = data.get('opening_time')
        closing_time = data.get('closing_time')
        
        if opening_time and closing_time:
            if opening_time >= closing_time:
                raise serializers.ValidationError({
                    'closing_time': 'Closing time must be after opening time'
                })
        
        # If setting as headquarters, ensure no other branch is headquarters
        if data.get('is_headquarters') and not self.instance:
            # Creating new headquarters - this is handled in model save()
            pass
        
        return data

class PublicBranchSerializer(serializers.ModelSerializer):
    """Serializer for branches exposed to unauthenticated users and customer portal pickers."""

    class Meta:
        model = Branch
        fields = ['id', 'name', 'code', 'address', 'city', 'state', 'phone', 'is_headquarters']
