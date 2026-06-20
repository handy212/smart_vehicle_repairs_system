"""
Serializers for branches app
"""
from rest_framework import serializers
from django.contrib.contenttypes.models import ContentType
from .models import Branch
from apps.accounts.models import User


class BranchQboFieldsMixin:
    """Expose QuickBooks location mapping fields when QBO is connected."""

    qbo_department_id = serializers.SerializerMethodField()
    qbo_department_name = serializers.SerializerMethodField()
    qbo_sync_status = serializers.SerializerMethodField()
    qbo_sync_error = serializers.SerializerMethodField()

    def _qbo_is_connected(self):
        if not hasattr(self, '_qbo_connected_cache'):
            from apps.quickbooks_online.services import QuickBooksService
            self._qbo_connected_cache = QuickBooksService.is_connected()
        return self._qbo_connected_cache

    def _get_branch_qbo_mapping(self, obj):
        mappings = self.context.get('qbo_branch_mappings')
        if mappings is not None:
            return mappings.get(obj.id)
        from apps.quickbooks_online.models import QBOMapping
        branch_ct = ContentType.objects.get_for_model(Branch)
        return QBOMapping.objects.filter(content_type=branch_ct, object_id=obj.id).first()

    def get_qbo_department_id(self, obj):
        if not self._qbo_is_connected():
            return None
        mapping = self._get_branch_qbo_mapping(obj)
        return mapping.qbo_id if mapping and mapping.qbo_id else None

    def get_qbo_department_name(self, obj):
        if not self._qbo_is_connected():
            return None
        department_names = self.context.get('qbo_department_names') or {}
        mapping = self._get_branch_qbo_mapping(obj)
        if not mapping or not mapping.qbo_id:
            return None
        return department_names.get(mapping.qbo_id)

    def get_qbo_sync_status(self, obj):
        if not self._qbo_is_connected():
            return None
        mapping = self._get_branch_qbo_mapping(obj)
        if not mapping:
            return 'unmapped'
        return mapping.status

    def get_qbo_sync_error(self, obj):
        if not self._qbo_is_connected():
            return None
        mapping = self._get_branch_qbo_mapping(obj)
        return mapping.error_message if mapping else ''

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not self._qbo_is_connected():
            for field in ('qbo_department_id', 'qbo_department_name', 'qbo_sync_status', 'qbo_sync_error'):
                data.pop(field, None)
        return data


class BranchSerializer(BranchQboFieldsMixin, serializers.ModelSerializer):
    """Serializer for Branch model"""
    
    staff_count = serializers.ReadOnlyField()
    manager_count = serializers.ReadOnlyField()
    full_address = serializers.ReadOnlyField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    qbo_department_id = serializers.SerializerMethodField()
    qbo_department_name = serializers.SerializerMethodField()
    qbo_sync_status = serializers.SerializerMethodField()
    qbo_sync_error = serializers.SerializerMethodField()
    
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
            'created_by', 'created_by_name', 'created_at', 'updated_at',
            'qbo_department_id', 'qbo_department_name', 'qbo_sync_status', 'qbo_sync_error',
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'created_by',
            'staff_count', 'manager_count', 'full_address', 'created_by_name'
        ]


class BranchListSerializer(BranchQboFieldsMixin, serializers.ModelSerializer):
    """Minimal serializer for branch lists"""
    
    staff_count = serializers.ReadOnlyField()
    manager_count = serializers.ReadOnlyField()
    qbo_department_id = serializers.SerializerMethodField()
    qbo_department_name = serializers.SerializerMethodField()
    qbo_sync_status = serializers.SerializerMethodField()
    qbo_sync_error = serializers.SerializerMethodField()
    
    class Meta:
        model = Branch
        fields = [
            'id', 'name', 'code', 'city', 'state',
            'is_active', 'is_headquarters',
            'staff_count', 'manager_count',
            'qbo_department_id', 'qbo_department_name', 'qbo_sync_status', 'qbo_sync_error',
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
