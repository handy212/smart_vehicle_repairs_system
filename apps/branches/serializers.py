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
        """Ensure code is uppercase"""
        if value:
            return value.upper()
        return value
