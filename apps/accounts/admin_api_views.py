"""
REST API Views for Admin Features
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db.models import Q, Count
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from django.contrib.auth import get_user_model
from django.conf import settings
import os
from pathlib import Path

from .admin_models import SystemSettings, AuditLog, SystemBackup, EmailTemplate, SMSTemplate
from .permission_models import Role, Permission
from .models import User
from .serializers import UserSerializer

User = get_user_model()


def is_admin_user(user):
    """Check if user is admin"""
    return user.is_authenticated and (user.is_superuser or user.role == 'admin')


class IsAdmin(IsAuthenticated):
    """Permission class to check if user is admin"""
    
    def has_permission(self, request, view):
        return super().has_permission(request, view) and is_admin_user(request.user)


class SystemSettingsViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing system settings
    """
    permission_classes = [IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['key', 'description']
    ordering_fields = ['category', 'key', 'created_at', 'updated_at']
    ordering = ['category', 'key']
    
    def get_queryset(self):
        return SystemSettings.objects.all()
    
    def get_serializer_class(self):
        from .admin_serializers import SystemSettingsSerializer
        return SystemSettingsSerializer
    
    def list(self, request, *args, **kwargs):
        category = request.query_params.get('category')
        # Auto-initialize settings for the category if none exist
        if category:
            from .settings_init import initialize_category_settings
            settings_count = SystemSettings.objects.filter(category=category).count()
            if settings_count == 0:
                initialize_category_settings(category)
            # Also ensure tax settings if tax category
            if category == 'tax':
                SystemSettings.ensure_tax_settings()
        return super().list(request, *args, **kwargs)
    
    def perform_create(self, serializer):
        instance = serializer.save(updated_by=self.request.user)
        # Clear cache for this setting
        from .settings_utils import clear_setting_cache
        clear_setting_cache(instance.key)
    
    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)
    
    @action(detail=False, methods=['get'])
    def by_category(self, request):
        """Get settings grouped by category"""
        category = request.query_params.get('category')
        # Auto-initialize settings for the category if none exist
        if category:
            from .settings_init import initialize_category_settings
            settings_count = SystemSettings.objects.filter(category=category).count()
            if settings_count == 0:
                initialize_category_settings(category)
            # Also ensure tax settings if tax category
            if category == 'tax':
                SystemSettings.ensure_tax_settings()
        queryset = self.get_queryset()
        if category:
            settings = queryset.filter(category=category, is_active=True)
        else:
            settings = queryset.filter(is_active=True)
        
        serializer = self.get_serializer(settings, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], permission_classes=[AllowAny], url_path='public/branding')
    def public_branding(self, request):
        """
        Public endpoint to get branding settings for login page and public pages.
        Does not require authentication.
        """
        # Auto-initialize branding settings if none exist
        from .settings_init import initialize_category_settings
        settings_count = SystemSettings.objects.filter(category='branding').count()
        if settings_count == 0:
            initialize_category_settings('branding')
        
        # Only return active, non-secret branding settings
        settings = SystemSettings.objects.filter(
            category='branding',
            is_active=True,
            is_secret=False  # Never expose secret settings publicly
        ).order_by('key')
        
        # Serialize only safe fields (key, value, no sensitive info)
        data = []
        for setting in settings:
            data.append({
                'key': setting.key,
                'value': setting.value,
                'updated_at': setting.updated_at.isoformat() if setting.updated_at else None,
            })
        
        return Response(data)
    
    @action(detail=False, methods=['post'])
    def bulk_update(self, request):
        """Bulk update multiple settings"""
        settings_data = request.data.get('settings', [])
        updated = []
        
        for setting_data in settings_data:
            setting_id = setting_data.get('id')
            if setting_id:
                try:
                    from .settings_utils import clear_setting_cache
                    setting = SystemSettings.objects.get(id=setting_id)
                    setting.value = setting_data.get('value', setting.value)
                    setting.description = setting_data.get('description', setting.description)
                    setting.is_active = setting_data.get('is_active', setting.is_active)
                    setting.updated_by = request.user
                    setting.save()
                    clear_setting_cache(setting.key)
                    updated.append(setting.id)
                except SystemSettings.DoesNotExist:
                    pass
        
        return Response({
            'message': f'{len(updated)} settings updated',
            'updated_ids': updated
        })
    
    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload_file(self, request, pk=None):
        """Upload a file for a branding setting (logo, favicon, background, etc.)"""
        setting = self.get_object()
        
        # Only allow file uploads for branding settings
        if setting.category != 'branding':
            return Response(
                {'error': 'File uploads are only allowed for branding settings'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if setting key is for a file path
        file_path_keys = ['logo_path', 'logo_dark_path', 'favicon_path', 'login_background', 
                         'customer_login_background', 'staff_login_background']
        if setting.key not in file_path_keys:
            return Response(
                {'error': f'File uploads are not allowed for setting key: {setting.key}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get uploaded file
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response(
                {'error': 'No file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate file type
        allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
        if file_obj.content_type not in allowed_types:
            return Response(
                {'error': f'Invalid file type. Allowed types: JPEG, PNG, GIF, SVG, ICO'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate file size (max 10MB)
        max_size = 10 * 1024 * 1024  # 10 MB
        if file_obj.size > max_size:
            return Response(
                {'error': f'File size exceeds maximum allowed size of 10 MB'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create branding directory if it doesn't exist
        branding_dir = Path(settings.MEDIA_ROOT) / 'branding'
        branding_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename (keep original extension)
        file_extension = Path(file_obj.name).suffix
        # Use setting key as base filename for consistency
        filename = f"{setting.key}{file_extension}"
        file_path = branding_dir / filename
        
        # Save file
        with open(file_path, 'wb+') as destination:
            for chunk in file_obj.chunks():
                destination.write(chunk)
        
        # Update setting value with relative path
        relative_path = f"branding/{filename}"
        setting.value = relative_path
        setting.updated_by = request.user
        setting.save()
        
        # Clear cache
        from .settings_utils import clear_setting_cache
        clear_setting_cache(setting.key)
        
        # Return updated setting with full URL
        full_url = f"{settings.MEDIA_URL}{relative_path}"
        
        return Response({
            'message': 'File uploaded successfully',
            'setting': self.get_serializer(setting).data,
            'file_path': relative_path,
            'file_url': full_url
        })


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing audit logs (read-only)
    """
    permission_classes = [IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['action', 'model_name', 'user']
    search_fields = ['object_repr', 'model_name', 'user__email', 'user__username']
    ordering_fields = ['timestamp', 'action']
    ordering = ['-timestamp']
    
    def get_queryset(self):
        return AuditLog.objects.select_related('user').all()
    
    def get_serializer_class(self):
        from .admin_serializers import AuditLogSerializer
        return AuditLogSerializer
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get audit log statistics"""
        logs = self.get_queryset()
        
        # Filter by date range if provided
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if date_from:
            logs = logs.filter(timestamp__gte=date_from)
        if date_to:
            logs = logs.filter(timestamp__lte=date_to)
        
        total = logs.count()
        by_action = logs.values('action').annotate(count=Count('id')).order_by('-count')
        by_user = logs.values('user__email', 'user__username').annotate(count=Count('id')).order_by('-count')[:10]
        by_model = logs.values('model_name').annotate(count=Count('id')).order_by('-count')[:10]
        
        return Response({
            'total': total,
            'by_action': list(by_action),
            'top_users': list(by_user),
            'top_models': list(by_model),
        })
    
    @action(detail=False, methods=['get'])
    def import_history(self, request):
        """Get import history (filtered audit logs for import actions)"""
        logs = self.get_queryset().filter(action='import')
        
        # Filter by model if provided
        model_name = request.query_params.get('model_name')
        if model_name:
            logs = logs.filter(model_name=model_name)
        
        # Filter by date range if provided
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if date_from:
            logs = logs.filter(timestamp__gte=date_from)
        if date_to:
            logs = logs.filter(timestamp__lte=date_to)
        
        # Filter by user if provided
        user_id = request.query_params.get('user')
        if user_id:
            logs = logs.filter(user_id=user_id)
        
        # Paginate
        page = self.paginate_queryset(logs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(logs, many=True)
        return Response(serializer.data)


class SystemBackupViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing system backups
    """
    permission_classes = [IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['backup_type', 'status']
    ordering_fields = ['started_at', 'completed_at']
    ordering = ['-started_at']
    
    def get_queryset(self):
        return SystemBackup.objects.all()
    
    def get_serializer_class(self):
        from .admin_serializers import SystemBackupSerializer
        return SystemBackupSerializer
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def download(self, request, pk=None):
        """Download backup file"""
        backup = self.get_object()
        if backup.status != 'completed' or not backup.file_path:
            return Response(
                {'error': 'Backup not available for download'},
                status=status.HTTP_400_BAD_REQUEST
            )
        # In a real implementation, this would return the file
        return Response({
            'file_path': backup.file_path,
            'file_size': backup.file_size,
            'download_url': f'/api/admin/backups/{backup.id}/download/'
        })
    
    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Restore from backup"""
        backup = self.get_object()
        if backup.status != 'completed':
            return Response(
                {'error': 'Backup not completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        # In a real implementation, this would trigger restore
        return Response({
            'message': 'Restore initiated',
            'backup_id': backup.id
        })


class EmailTemplateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing email templates
    """
    permission_classes = [IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['template_type', 'is_active']
    search_fields = ['name', 'subject']
    ordering_fields = ['name', 'template_type', 'created_at']
    ordering = ['template_type', 'name']
    
    def get_queryset(self):
        return EmailTemplate.objects.all()
    
    def get_serializer_class(self):
        from .admin_serializers import EmailTemplateSerializer
        return EmailTemplateSerializer
    
    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class SMSTemplateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing SMS templates
    """
    permission_classes = [IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['template_type', 'is_active']
    search_fields = ['name', 'message']
    ordering_fields = ['name', 'template_type', 'created_at']
    ordering = ['template_type', 'name']
    
    def get_queryset(self):
        return SMSTemplate.objects.all()
    
    def get_serializer_class(self):
        from .admin_serializers import SMSTemplateSerializer
        return SMSTemplateSerializer


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_dashboard_stats(request):
    """Get admin dashboard statistics"""
    total_users = User.objects.count()
    active_users = User.objects.filter(is_active=True).count()
    total_settings = SystemSettings.objects.count()
    
    # Recent audit logs
    recent_logs = AuditLog.objects.select_related('user').order_by('-timestamp')[:10]
    
    # Users by role
    user_by_role = User.objects.values('role').annotate(count=Count('id'))
    
    # Recent backups
    recent_backups = SystemBackup.objects.order_by('-started_at')[:5]
    
    from .admin_serializers import AuditLogSerializer, SystemBackupSerializer
    
    return Response({
        'total_users': total_users,
        'active_users': active_users,
        'total_settings': total_settings,
        'recent_logs': AuditLogSerializer(recent_logs, many=True).data,
        'user_by_role': list(user_by_role),
        'recent_backups': SystemBackupSerializer(recent_backups, many=True).data,
    })


class RoleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing roles
    """
    permission_classes = [IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'is_system']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['name', 'priority', 'created_at']
    ordering = ['-priority', 'name']
    
    def get_queryset(self):
        return Role.objects.prefetch_related('permissions').all()
    
    def get_serializer_class(self):
        from .admin_serializers import RoleSerializer, RoleCreateUpdateSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return RoleCreateUpdateSerializer
        return RoleSerializer
    
    def perform_create(self, serializer):
        serializer.save()
    
    def perform_update(self, serializer):
        serializer.save()
    
    @action(detail=True, methods=['get'])
    def permissions(self, request, pk=None):
        """Get all permissions for a role"""
        role = self.get_object()
        permissions = role.permissions.all()
        from .admin_serializers import PermissionSerializer
        return Response(PermissionSerializer(permissions, many=True).data)
    
    @action(detail=True, methods=['post'])
    def assign_permissions(self, request, pk=None):
        """Assign permissions to a role"""
        role = self.get_object()
        permission_ids = request.data.get('permission_ids', [])
        role.permissions.set(permission_ids)
        return Response({'detail': 'Permissions updated successfully'})


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing permissions (read-only)
    """
    permission_classes = [IsAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'is_active', 'is_system']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['category', 'name']
    ordering = ['category', 'name']
    
    def get_queryset(self):
        return Permission.objects.all()
    
    def get_serializer_class(self):
        from .admin_serializers import PermissionSerializer
        return PermissionSerializer

