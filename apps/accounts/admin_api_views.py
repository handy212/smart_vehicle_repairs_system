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
import json

from auditlog.models import LogEntry
from .admin_models import SystemSettings, SystemBackup, EmailTemplate, SMSTemplate
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
    
    def get_permissions(self):
        if self.action in ['public_branding', 'public_firebase', 'public_integrations']:
            return [AllowAny()]
        if self.action == 'by_category':
            return [IsAuthenticated()]
        return [IsAdmin()] # Default to admin only

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
        # old_value = serializer.instance.value # Auditlog handles this
        updated_instance = serializer.save(updated_by=self.request.user)
        
        # Clear cache handled by save but good to ensure
        from .settings_utils import clear_setting_cache
        clear_setting_cache(updated_instance.key)
            
    def perform_destroy(self, instance):
        key = instance.key
        instance.delete()
        from .settings_utils import clear_setting_cache
        clear_setting_cache(key)
    
    @action(detail=False, methods=['get'])
    def by_category(self, request):
        """Get settings grouped by category"""
        category = request.query_params.get('category')
        
        # Check permissions for non-admins
        if not is_admin_user(request.user):
            allowed_categories = ['payment', 'branding', 'general', 'integration']
            if not category or category not in allowed_categories:
                 return Response(
                    {'error': 'You do not have permission to access these settings'},
                    status=status.HTTP_403_FORBIDDEN
                )

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
            
        # Secure filtering for non-admins
        if not is_admin_user(request.user):
            # Exclude secrets for standard users
            settings = settings.filter(is_secret=False)
        
        serializer = self.get_serializer(settings, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], permission_classes=[AllowAny], url_path='public/branding', throttle_classes=[])
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
        
        # Only return active, non-secret branding and company settings
        settings = SystemSettings.objects.filter(
            category__in=['branding', 'company'],
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
    
    @action(detail=False, methods=['get'], permission_classes=[AllowAny], url_path='public/firebase', throttle_classes=[])
    def public_firebase(self, request):
        """
        Public endpoint to get Firebase configuration for frontend.
        Does not require authentication.
        Returns only public Firebase config (not secret keys).
        """
        # Auto-initialize integration settings if none exist
        from .settings_init import initialize_category_settings
        settings_count = SystemSettings.objects.filter(category='integration').count()
        if settings_count == 0:
            initialize_category_settings('integration')
        
        # Get Firebase settings
        firebase_enabled = SystemSettings.get_setting('firebase_enabled', 'false')
        firebase_api_key = SystemSettings.get_setting('firebase_api_key', '')
        firebase_project_id = SystemSettings.get_setting('firebase_project_id', '')
        firebase_messaging_sender_id = SystemSettings.get_setting('firebase_messaging_sender_id', '')
        firebase_app_id = SystemSettings.get_setting('firebase_app_id', '')
        
        # Only return config if Firebase is enabled
        if firebase_enabled.lower() == 'true' and firebase_api_key and firebase_project_id:
            return Response({
                'enabled': True,
                'apiKey': firebase_api_key,
                'projectId': firebase_project_id,
                'messagingSenderId': firebase_messaging_sender_id,
                'appId': firebase_app_id,
            })
        
        return Response({
            'enabled': False,
            'apiKey': '',
            'projectId': '',
            'messagingSenderId': '',
            'appId': '',
        })
    
    @action(detail=False, methods=['get'], permission_classes=[AllowAny], url_path='public/integrations', throttle_classes=[])
    def public_integrations(self, request):
        """
        Public endpoint to get integration settings (Google Analytics, Facebook Pixel, etc.)
        Does not require authentication.
        Returns only non-secret integration settings.
        """
        # Auto-initialize integration settings if none exist
        from .settings_init import initialize_category_settings
        settings_count = SystemSettings.objects.filter(category='integration').count()
        if settings_count == 0:
            initialize_category_settings('integration')
        
        # Only return active, non-secret integration settings
        settings = SystemSettings.objects.filter(
            category='integration',
            is_active=True,
            is_secret=False  # Never expose secret settings publicly
        ).order_by('key')
        
        # Convert to key-value object
        data = {}
        for setting in settings:
            data[setting.key] = setting.value
        
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
                    
                    # old_value = setting.value
                    
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
        
        # old_value = setting.value
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
    filterset_fields = []
    search_fields = ['object_repr', 'actor__email', 'actor__username', 'remote_addr']
    ordering_fields = ['timestamp', 'action']
    ordering = ['-timestamp']
    
    def get_queryset(self):
        # Use LogEntry from django-auditlog
        queryset = LogEntry.objects.select_related('actor', 'content_type').all()
        
        # Handle manual date filtering
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        
        if date_from:
            queryset = queryset.filter(timestamp__gte=date_from)
        if date_to:
            # Add time to include the end date fully
            queryset = queryset.filter(timestamp__lte=date_to + ' 23:59:59')
            
        return queryset
    
    def get_serializer_class(self):
        from .admin_serializers import AuditLogSerializer
        return AuditLogSerializer
    
    def filter_queryset(self, queryset):
        # Handle custom filters for action which is int in LogEntry
        queryset = super().filter_queryset(queryset)
        
        # Filter by model name (content_type__model)
        model_name = self.request.query_params.get('model_name')
        if model_name:
            queryset = queryset.filter(content_type__model__iexact=model_name)
            
        # Filter by user (mapped to actor)
        user = self.request.query_params.get('user')
        if user:
            queryset = queryset.filter(actor_id=user)
            
        # Filter by action (string to int mapping)
        action = self.request.query_params.get('action')
        if action:
            action_map = {'create': 0, 'update': 1, 'delete': 2}
            # Handle standard names and potential int values
            if action.lower() in action_map:
                queryset = queryset.filter(action=action_map[action.lower()])
            elif action.isdigit():
                queryset = queryset.filter(action=int(action))
            
        return queryset

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get audit log statistics"""
        logs = self.get_queryset()
        
        total = logs.count()
        by_action = logs.values('action').annotate(count=Count('id')).order_by('-count')
        by_user = logs.values('actor__email', 'actor__username').annotate(count=Count('id')).order_by('-count')[:10]
        by_model = logs.values('content_type__model').annotate(count=Count('id')).order_by('-count')[:10]
        
        # Map actions to readable strings for the stats
        action_map = {0: 'create', 1: 'update', 2: 'delete'}
        formatted_actions = []
        for item in by_action:
             formatted_actions.append({
                 'action': action_map.get(item['action'], str(item['action'])),
                 'count': item['count']
             })

        return Response({
            'total': total,
            'by_action': formatted_actions,
            'top_users': list(by_user),
            'top_models': list(by_model),
        })
    
    @action(detail=False, methods=['get'])
    def import_history(self, request):
        """Get import history (filtered audit logs for import actions)"""
        # Auditlog doesn't natively have 'import' action type (only 0,1,2).
        # We might need to filter by specific method if we can, or rely on 
        # API logs if we extended the model.
        # For now, return empty or filter by creation of specific objects if known
        
        # Returning empty to prevent error until custom action types are implemented
        return Response([])
    
    @action(detail=False, methods=['post'])
    def archive(self, request):
        """
        Archive audit logs older than specified days.
        This deletes logs older than the specified number of days.
        """
        from django.utils import timezone
        from datetime import timedelta
        
        days = request.data.get('days', 90)  # Default to 90 days
        try:
            days = int(days)
            if days < 1:
                return Response(
                    {'error': 'Days must be at least 1'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except (ValueError, TypeError):
            return Response(
                {'error': 'Invalid days value'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Calculate cutoff date
        cutoff_date = timezone.now() - timedelta(days=days)
        
        # Get logs to archive
        logs_to_archive = LogEntry.objects.filter(timestamp__lt=cutoff_date)
        count = logs_to_archive.count()
        
        # Delete the logs
        logs_to_archive.delete()
        
        return Response({
            'message': f'Archived {count} audit log(s) older than {days} days',
            'archived_count': count,
            'cutoff_date': cutoff_date.isoformat(),
        })
    
    @action(detail=False, methods=['get'])
    def download(self, request):
        """
        Download audit logs as CSV or JSON.
        Supports same filters as list endpoint.
        """
        import csv
        import json
        from django.http import HttpResponse
        from django.utils import timezone
        import io
        
        # Get format (csv or json)
        format_type = request.query_params.get('file_format', 'csv').lower()
        if format_type not in ['csv', 'json']:
            return Response(
                {'error': 'Format must be csv or json'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get filtered queryset
        queryset = self.filter_queryset(self.get_queryset())
        
        # Apply date filters if provided
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        
        if date_from:
            queryset = queryset.filter(timestamp__gte=date_from)
        if date_to:
            queryset = queryset.filter(timestamp__lte=date_to + ' 23:59:59')
        
        # Limit to reasonable number for download (e.g., 10000)
        max_records = 10000
        total_count = queryset.count()
        if total_count > max_records:
            queryset = queryset[:max_records]
        
        # Get serializer
        serializer_class = self.get_serializer_class()
        logs = serializer_class(queryset, many=True).data
        
        # Generate filename
        timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
        filename = f'audit_logs_{timestamp}.{format_type}'
        
        if format_type == 'csv':
            # Create in-memory buffer
            output = io.StringIO()
            
            if not logs:
                # Return empty CSV
                response = HttpResponse('', content_type='text/csv')
                response['Content-Disposition'] = f'attachment; filename="{filename}"'
                return response
            
            # Get all possible field names from logs
            fieldnames = set()
            for log in logs:
                fieldnames.update(log.keys())
            
            # Order fields logically
            ordered_fields = [
                'id', 'timestamp', 'user_name', 'user_email', 'action',
                'model_name', 'object_id', 'object_repr', 'ip_address',
                'changes'
            ]
            # Add any remaining fields
            for field in sorted(fieldnames):
                if field not in ordered_fields:
                    ordered_fields.append(field)
            
            writer = csv.DictWriter(output, fieldnames=ordered_fields, extrasaction='ignore')
            writer.writeheader()
            
            for log in logs:
                # Convert changes dict to string for CSV
                row = log.copy()
                if 'changes' in row and isinstance(row['changes'], dict):
                    row['changes'] = json.dumps(row['changes'])
                writer.writerow(row)
            
            # Create HTTP response with CSV content
            response = HttpResponse(output.getvalue(), content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        
        else:  # JSON
            response = HttpResponse(
                json.dumps(logs, indent=2, default=str),
                content_type='application/json; charset=utf-8'
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response


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
        instance = serializer.save(created_by=self.request.user)
        # Auditlog handles creation logging
        
    def perform_destroy(self, instance):
        # Delete file
        if instance.file_path and os.path.exists(instance.file_path):
            os.remove(instance.file_path)
            
        instance.delete()
        # Auditlog handles deletion logging
    
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
    
    def perform_create(self, serializer):
        instance = serializer.save(updated_by=self.request.user)
    
    def perform_update(self, serializer):
        updated_instance = serializer.save(updated_by=self.request.user)
            
    def perform_destroy(self, instance):
        instance.delete()


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

    def perform_create(self, serializer):
        instance = serializer.save()

    def perform_update(self, serializer):
        updated_instance = serializer.save()

    def perform_destroy(self, instance):
        instance.delete()


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_dashboard_stats(request):
    """Get admin dashboard statistics"""
    total_users = User.objects.count()
    active_users = User.objects.filter(is_active=True).count()
    total_settings = SystemSettings.objects.count()
    
    # Recent audit logs
    recent_logs = LogEntry.objects.select_related('actor', 'content_type').order_by('-timestamp')[:10]
    
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
        instance = serializer.save()
    
    def perform_update(self, serializer):
        updated_instance = serializer.save()

    def perform_destroy(self, instance):
        if instance.is_system:
             return Response(
                {'error': 'Cannot delete system roles'},
                status=status.HTTP_400_BAD_REQUEST
            )
        instance.delete()
    
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
