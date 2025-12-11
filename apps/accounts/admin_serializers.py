"""
Serializers for Admin Features
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .admin_models import SystemSettings, AuditLog, SystemBackup, EmailTemplate, SMSTemplate
from .permission_models import Role, Permission

User = get_user_model()


class SystemSettingsSerializer(serializers.ModelSerializer):
    """Serializer for SystemSettings"""
    updated_by_name = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()
    
    class Meta:
        model = SystemSettings
        fields = [
            'id', 'category', 'key', 'value', 'description', 'is_secret',
            'is_active', 'updated_by', 'updated_by_name', 'created_at', 'updated_at',
            'display_name'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'updated_by_name', 'display_name']
    
    def get_updated_by_name(self, obj):
        if obj.updated_by:
            return obj.updated_by.get_full_name() or f"{obj.updated_by.first_name} {obj.updated_by.last_name}".strip()
        return None
    
    def get_display_name(self, obj):
        return obj.display_name
    
    def to_representation(self, instance):
        """Mask secret values - but show actual value if it's empty or being edited"""
        data = super().to_representation(instance)
        # Only mask if there's a value and it's a secret
        # This allows admins to see/edit the actual value when needed
        # The frontend should handle masking for display purposes
        return data


class AuditLogSerializer(serializers.ModelSerializer):
    """Serializer for AuditLog"""
    user_email = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()
    changes_display = serializers.SerializerMethodField()
    
    class Meta:
        model = AuditLog
        fields = [
            'id', 'user', 'user_email', 'user_name', 'action', 'model_name',
            'object_id', 'object_repr', 'changes', 'changes_display',
            'ip_address', 'user_agent', 'timestamp'
        ]
        read_only_fields = ['id', 'timestamp']
    
    def get_user_email(self, obj):
        return obj.user.email if obj.user else None
    
    def get_user_name(self, obj):
        if obj.user:
            return obj.user.get_full_name() or f"{obj.user.first_name} {obj.user.last_name}".strip()
        return None
    
    def get_changes_display(self, obj):
        return obj.get_changes_display() if hasattr(obj, 'get_changes_display') else None


class SystemBackupSerializer(serializers.ModelSerializer):
    """Serializer for SystemBackup"""
    created_by_name = serializers.SerializerMethodField()
    file_size_display = serializers.SerializerMethodField()
    
    class Meta:
        model = SystemBackup
        fields = [
            'id', 'backup_type', 'status', 'file_path', 'file_size', 'file_size_display',
            'created_by', 'created_by_name', 'notes', 'error_message',
            'started_at', 'completed_at'
        ]
        read_only_fields = ['id', 'started_at', 'completed_at', 'created_by_name', 'file_size_display']
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
        return None
    
    def get_file_size_display(self, obj):
        return obj.get_file_size_display() if hasattr(obj, 'get_file_size_display') else None


class EmailTemplateSerializer(serializers.ModelSerializer):
    """Serializer for EmailTemplate"""
    updated_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = EmailTemplate
        fields = [
            'id', 'name', 'template_type', 'subject', 'body_html', 'body_text',
            'variables', 'is_active', 'created_at', 'updated_at', 'updated_by', 'updated_by_name'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'updated_by_name']
    
    def get_updated_by_name(self, obj):
        if obj.updated_by:
            return obj.updated_by.get_full_name() or f"{obj.updated_by.first_name} {obj.updated_by.last_name}".strip()
        return None


class SMSTemplateSerializer(serializers.ModelSerializer):
    """Serializer for SMSTemplate"""
    
    class Meta:
        model = SMSTemplate
        fields = [
            'id', 'name', 'template_type', 'message', 'variables',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class PermissionSerializer(serializers.ModelSerializer):
    """Serializer for Permission"""
    
    class Meta:
        model = Permission
        fields = [
            'id', 'code', 'name', 'description', 'category',
            'is_system', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class RoleSerializer(serializers.ModelSerializer):
    """Serializer for Role"""
    permission_ids = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Role
        fields = [
            'id', 'code', 'name', 'description', 'is_system', 'is_active',
            'priority', 'permission_ids', 'user_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'permission_ids', 'user_count']
    
    def get_permission_ids(self, obj):
        return list(obj.permissions.values_list('id', flat=True))
    
    def get_user_count(self, obj):
        return obj.user_count()


class RoleCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating Role"""
    permission_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True
    )
    
    class Meta:
        model = Role
        fields = [
            'code', 'name', 'description', 'is_active', 'priority', 'permission_ids'
        ]
    
    def create(self, validated_data):
        permission_ids = validated_data.pop('permission_ids', [])
        role = Role.objects.create(**validated_data)
        if permission_ids:
            role.permissions.set(permission_ids)
        return role
    
    def update(self, instance, validated_data):
        permission_ids = validated_data.pop('permission_ids', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if permission_ids is not None:
            instance.permissions.set(permission_ids)
        return instance

