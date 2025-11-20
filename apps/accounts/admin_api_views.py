"""
REST API Views for Admin Features
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Count
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from django.contrib.auth import get_user_model

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
        if category == 'tax':
            SystemSettings.ensure_tax_settings()
        return super().list(request, *args, **kwargs)
    
    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)
    
    @action(detail=False, methods=['get'])
    def by_category(self, request):
        """Get settings grouped by category"""
        category = request.query_params.get('category')
        if category == 'tax':
            SystemSettings.ensure_tax_settings()
        queryset = self.get_queryset()
        if category:
            settings = queryset.filter(category=category, is_active=True)
        else:
            settings = queryset.filter(is_active=True)
        
        serializer = self.get_serializer(settings, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def bulk_update(self, request):
        """Bulk update multiple settings"""
        settings_data = request.data.get('settings', [])
        updated = []
        
        for setting_data in settings_data:
            setting_id = setting_data.get('id')
            if setting_id:
                try:
                    setting = SystemSettings.objects.get(id=setting_id)
                    setting.value = setting_data.get('value', setting.value)
                    setting.description = setting_data.get('description', setting.description)
                    setting.is_active = setting_data.get('is_active', setting.is_active)
                    setting.updated_by = request.user
                    setting.save()
                    updated.append(setting.id)
                except SystemSettings.DoesNotExist:
                    pass
        
        return Response({
            'message': f'{len(updated)} settings updated',
            'updated_ids': updated
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

