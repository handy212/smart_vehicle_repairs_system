"""
REST API Views for Admin Features
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.views import APIView
from apps.accounts.throttles import PublicSettingsRateThrottle
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db.models import Q, Count
from django.http import FileResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from django.contrib.auth import get_user_model
from django.conf import settings
import os
from pathlib import Path
import json
from datetime import datetime, time as dt_time

from auditlog.models import LogEntry
from .admin_models import SystemSettings, SystemBackup, SystemUpdateRun, EmailTemplate, SMSTemplate, SystemModule
from .permission_models import Role, Permission
from .models import User
from .serializers import UserSerializer

User = get_user_model()


from .permissions import HasAnyPermission, HasPermission, IsModuleEnabled, IsSuperAdmin, user_has_permission

def is_admin_user(user):
    """Users with full system settings access (respects permission overrides)."""
    if not user or not user.is_authenticated:
        return False
    return user_has_permission(user, 'manage_settings')


class DemoDataView(APIView):
    """Admin-only client demo data loader/purger."""

    permission_classes = [IsAuthenticated, HasPermission('manage_settings')]

    def _options(self, request):
        count = request.data.get('count', 100) if hasattr(request, 'data') else request.query_params.get('count', 100)
        try:
            count = int(count)
        except (TypeError, ValueError):
            count = 100

        modules = request.data.get('modules') if hasattr(request, 'data') else request.query_params.getlist('modules')
        if isinstance(modules, str):
            modules = [modules]
        if modules is not None and not isinstance(modules, list):
            modules = None
        return count, modules

    def get(self, request, action_name=None):
        from apps.accounts.client_demo_data import ClientDemoDataService

        count = request.query_params.get('count', 100)
        modules = request.query_params.getlist('modules') or request.query_params.getlist('modules[]') or None
        try:
            count = int(count)
        except (TypeError, ValueError):
            count = 100
        return Response(ClientDemoDataService(count=count, user=request.user).status(modules))

    def post(self, request, action_name):
        from apps.accounts.client_demo_data import ClientDemoDataService

        count, modules = self._options(request)
        permanent = bool(request.data.get('permanent', False))
        if permanent and request.data.get('confirmation') != 'DELETE PERMANENT DATA':
            return Response(
                {'error': 'Permanent cleanup requires confirmation: DELETE PERMANENT DATA'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        service = ClientDemoDataService(count=count, user=request.user)
        if action_name == 'load':
            if permanent:
                return Response({'error': 'Permanent mode is only supported for purge'}, status=status.HTTP_400_BAD_REQUEST)
            return Response(service.load(modules))
        if action_name == 'refresh':
            if permanent:
                return Response({'error': 'Permanent mode is only supported for purge'}, status=status.HTTP_400_BAD_REQUEST)
            return Response(service.refresh(modules))
        if action_name == 'purge':
            return Response(service.purge(modules, permanent=permanent))
        return Response({'error': 'Unsupported demo data action'}, status=status.HTTP_404_NOT_FOUND)



class SystemSettingsViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing system settings
    """
    permission_classes = [IsAuthenticated, HasPermission('manage_settings')]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['key', 'description']
    ordering_fields = ['category', 'key', 'created_at', 'updated_at']
    ordering = ['category', 'key']
    
    def get_queryset(self):
        from .settings_init import supported_setting_keys
        return SystemSettings.objects.filter(key__in=supported_setting_keys())
    
    def get_serializer_class(self):
        from .admin_serializers import SystemSettingsSerializer
        return SystemSettingsSerializer
    
    def get_permissions(self):
        if self.action in ['public_branding', 'public_firebase', 'public_integrations', 'public_display']:
            return [AllowAny()]
        if self.action == 'by_category':
            return [IsAuthenticated(), HasAnyPermission(['view_settings', 'manage_settings'])()]
        return [IsAuthenticated(), HasPermission('manage_settings')()]

    def list(self, request, *args, **kwargs):
        category = request.query_params.get('category')
        # Auto-initialize settings for the category if none exist
        if category:
            from .settings_init import cleanup_deprecated_settings, initialize_category_settings
            cleanup_deprecated_settings(category)
            initialize_category_settings(category)
            # Also ensure tax settings if tax category
            if category == 'tax':
                SystemSettings.ensure_tax_settings()
            if category == 'integration':
                SystemSettings.ensure_integration_settings()
                SystemSettings.ensure_ai_settings()
        return super().list(request, *args, **kwargs)
    
    def perform_create(self, serializer):
        instance = serializer.save(updated_by=self.request.user)
        from .settings_utils import (
            clear_public_branding_cache,
            clear_public_display_cache,
            clear_setting_cache,
        )
        clear_setting_cache(instance.key)
        if instance.category in ('branding', 'company'):
            clear_public_branding_cache()
        if instance.category == 'payment' or instance.key in ('currency', 'currency_symbol'):
            clear_public_display_cache()
    
    def perform_update(self, serializer):
        # old_value = serializer.instance.value # Auditlog handles this
        updated_instance = serializer.save(updated_by=self.request.user)
        
        # Clear cache handled by save but good to ensure
        from .settings_utils import (
            clear_public_branding_cache,
            clear_public_display_cache,
            clear_setting_cache,
        )
        clear_setting_cache(updated_instance.key)
        if updated_instance.category in ('branding', 'company'):
            clear_public_branding_cache()
        if updated_instance.category == 'payment' or updated_instance.key in ('currency', 'currency_symbol'):
            clear_public_display_cache()
            
    def perform_destroy(self, instance):
        key = instance.key
        category = instance.category
        instance.delete()
        from .settings_utils import clear_public_branding_cache, clear_setting_cache
        clear_setting_cache(key)
        if category in ('branding', 'company'):
            clear_public_branding_cache()
    
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
            from .settings_init import cleanup_deprecated_settings, initialize_category_settings
            cleanup_deprecated_settings(category)
            initialize_category_settings(category)
            # Also ensure tax settings if tax category
            if category == 'tax':
                SystemSettings.ensure_tax_settings()
            if category == 'integration':
                SystemSettings.ensure_integration_settings()
                SystemSettings.ensure_ai_settings()

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
    
    @action(
        detail=False,
        methods=['get'],
        permission_classes=[AllowAny],
        authentication_classes=[],
        url_path='public/branding',
        throttle_classes=[PublicSettingsRateThrottle],
    )
    def public_branding(self, request):
        """
        Public endpoint to get branding settings for login page and public pages.
        Does not require authentication.
        """
        from django.core.cache import cache

        from .settings_utils import PUBLIC_BRANDING_CACHE_KEY

        cached = cache.get(PUBLIC_BRANDING_CACHE_KEY)
        if cached is not None:
            return Response(cached)

        # Auto-initialize branding settings if none exist (not on every cached hit)
        from .settings_init import cleanup_deprecated_settings, initialize_category_settings
        cleanup_deprecated_settings('branding')
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

        cache.set(PUBLIC_BRANDING_CACHE_KEY, data, timeout=300)
        return Response(data)

    @action(
        detail=False,
        methods=['get'],
        permission_classes=[AllowAny],
        authentication_classes=[],
        url_path='public/display',
        throttle_classes=[PublicSettingsRateThrottle],
    )
    def public_display(self, request):
        """
        Public endpoint for display settings (currency) used by portal and shared UI.
        Does not require authentication or staff settings permissions.
        """
        from django.core.cache import cache

        from .settings_init import cleanup_deprecated_settings, initialize_category_settings
        from .settings_utils import PUBLIC_DISPLAY_CACHE_KEY, get_payment_settings

        cached = cache.get(PUBLIC_DISPLAY_CACHE_KEY)
        if cached is not None:
            return Response(cached)

        cleanup_deprecated_settings('payment')
        initialize_category_settings('payment')

        payment = get_payment_settings()
        data = [
            {'key': 'currency', 'value': payment.get('currency', 'USD')},
            {'key': 'currency_symbol', 'value': payment.get('currency_symbol', '$')},
        ]
        cache.set(PUBLIC_DISPLAY_CACHE_KEY, data, timeout=300)
        return Response(data)
    
    @action(
        detail=False,
        methods=['get'],
        permission_classes=[AllowAny],
        authentication_classes=[],
        url_path='public/firebase',
        throttle_classes=[PublicSettingsRateThrottle],
    )
    def public_firebase(self, request):
        """
        Public endpoint to get Firebase configuration for frontend.
        Does not require authentication.
        Returns only public Firebase config (not secret keys).
        """
        # Auto-initialize integration settings if none exist
        from .settings_init import cleanup_deprecated_settings, initialize_category_settings, supported_setting_keys
        cleanup_deprecated_settings('integration')
        settings_count = SystemSettings.objects.filter(
            category='integration',
            key__in=supported_setting_keys('integration'),
        ).count()
        if settings_count == 0:
            initialize_category_settings('integration')
        
        # Get Firebase settings using secure get_setting (prioritizes .env)
        firebase_enabled = SystemSettings.get_setting('firebase_enabled', 'false')
        firebase_api_key = SystemSettings.get_setting('firebase_api_key', '')
        firebase_project_id = SystemSettings.get_setting('firebase_project_id', '')
        firebase_messaging_sender_id = SystemSettings.get_setting('firebase_messaging_sender_id', '')
        firebase_app_id = SystemSettings.get_setting('firebase_app_id', '')
        
        # Only return config if Firebase is enabled
        if firebase_enabled.lower() == 'true' and firebase_project_id:
            return Response({
                'enabled': True,
                'apiKey': firebase_api_key, # Usually required for frontend Firebase JS
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
    
    @action(
        detail=False,
        methods=['get'],
        permission_classes=[AllowAny],
        authentication_classes=[],
        url_path='public/integrations',
        throttle_classes=[PublicSettingsRateThrottle],
    )
    def public_integrations(self, request):
        """
        Public endpoint to get integration settings (Google Analytics, Facebook Pixel, etc.)
        Does not require authentication.
        Returns only non-secret integration settings.
        """
        # Auto-initialize integration settings if none exist
        from .settings_init import cleanup_deprecated_settings, initialize_category_settings, supported_setting_keys
        cleanup_deprecated_settings('integration')
        settings_count = SystemSettings.objects.filter(
            category='integration',
            key__in=supported_setting_keys('integration'),
        ).count()
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
                    from .settings_utils import (
                        clear_public_branding_cache,
                        clear_public_display_cache,
                        clear_setting_cache,
                    )
                    setting = SystemSettings.objects.get(id=setting_id)
                    
                    # old_value = setting.value
                    
                    setting.value = setting_data.get('value', setting.value)
                    setting.description = setting_data.get('description', setting.description)
                    setting.is_active = setting_data.get('is_active', setting.is_active)
                    setting.updated_by = request.user
                    setting.save()
                    clear_setting_cache(setting.key)
                    if setting.category in ('branding', 'company'):
                        clear_public_branding_cache()
                    if setting.category == 'payment' or setting.key in ('currency', 'currency_symbol'):
                        clear_public_display_cache()
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
        file_path_keys = ['logo_path', 'logo_dark_path', 'favicon_path', 'login_background']
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
        from .settings_utils import clear_public_branding_cache, clear_setting_cache
        clear_setting_cache(setting.key)
        clear_public_branding_cache()
        
        # Return updated setting with full URL
        full_url = f"{settings.MEDIA_URL}{relative_path}"
        
        return Response({
            'message': 'File uploaded successfully',
            'setting': self.get_serializer(setting).data,
            'file_path': relative_path,
            'file_url': full_url
        })


from rest_framework.pagination import PageNumberPagination

class AuditLogPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 1000

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing audit logs (read-only)
    """
    pagination_class = AuditLogPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = []
    search_fields = ['object_repr', 'actor__email', 'actor__username', 'remote_addr']
    ordering_fields = ['timestamp', 'action', 'user__last_name', 'model_name', 'ip_address']
    ordering = ['-timestamp']

    def get_permissions(self):
        if self.action == 'archive':
            return [IsAuthenticated(), HasPermission('manage_settings')()]
        return [IsAuthenticated(), HasPermission('view_audit_logs')()]

    def get_queryset(self):
        # Use LogEntry from django-auditlog
        queryset = LogEntry.objects.select_related('actor', 'content_type').all()
        queryset = queryset.exclude(actor__role='super-admin')

        try:
            from django.contrib.contenttypes.models import ContentType

            user_content_type = ContentType.objects.get_for_model(User)
            super_admin_ids = list(
                User.objects.filter(role='super-admin').values_list('id', flat=True)
            )
            if super_admin_ids:
                queryset = queryset.exclude(
                    content_type=user_content_type,
                    object_pk__in=[str(user_id) for user_id in super_admin_ids],
                )
        except Exception:
            pass

        # Handle manual date filtering (Bug 1 fix: use proper datetime objects)
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')

        if date_from:
            try:
                from_dt = timezone.make_aware(
                    datetime.combine(datetime.strptime(date_from, '%Y-%m-%d').date(), dt_time.min)
                )
                queryset = queryset.filter(timestamp__gte=from_dt)
            except ValueError:
                pass  # Ignore malformed date
        if date_to:
            try:
                to_dt = timezone.make_aware(
                    datetime.combine(datetime.strptime(date_to, '%Y-%m-%d').date(), dt_time.max)
                )
                queryset = queryset.filter(timestamp__lte=to_dt)
            except ValueError:
                pass  # Ignore malformed date

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
        """Get audit log statistics (respects same filters as list)."""
        logs = self.filter_queryset(self.get_queryset())

        total = logs.count()
        by_action = logs.values('action').annotate(count=Count('id')).order_by('-count')
        by_user = logs.values('actor__email', 'actor__username').annotate(count=Count('id')).order_by('-count')[:10]
        by_model = logs.values('content_type__model').annotate(count=Count('id')).order_by('-count')[:10]

        action_map = {0: 'create', 1: 'update', 2: 'delete'}
        formatted_actions = []
        for item in by_action:
            formatted_actions.append({
                'action': action_map.get(item['action'], str(item['action'])),
                'count': item['count'],
            })

        from .admin_serializers import audit_model_label

        formatted_models = []
        for item in by_model:
            model_name = item['content_type__model']
            formatted_models.append({
                'model_name': model_name,
                'model_label': audit_model_label(model_name),
                'count': item['count'],
            })

        formatted_users = []
        for item in by_user:
            email = item.get('actor__email') or ''
            username = item.get('actor__username') or ''
            formatted_users.append({
                'user_email': email,
                'user_username': username,
                'user_name': (email.split('@')[0] if email else username) or 'System',
                'count': item['count'],
            })

        return Response({
            'total': total,
            'by_action': formatted_actions,
            'top_users': formatted_users,
            'top_models': formatted_models,
        })

    @action(detail=False, methods=['get'], url_path='filter_options')
    def filter_options(self, request):
        """Distinct models and recent actors for filter dropdowns."""
        from .admin_serializers import audit_model_label

        logs = self.get_queryset()
        model_names = (
            logs.values_list('content_type__model', flat=True)
            .distinct()
            .order_by('content_type__model')
        )
        models = [
            {'value': name, 'label': audit_model_label(name)}
            for name in model_names
            if name
        ]

        actor_rows = (
            logs.exclude(actor_id__isnull=True)
            .values('actor_id', 'actor__email', 'actor__username', 'actor__first_name', 'actor__last_name')
            .annotate(count=Count('id'))
            .order_by('-count')[:50]
        )
        users = []
        for row in actor_rows:
            full_name = f"{row.get('actor__first_name') or ''} {row.get('actor__last_name') or ''}".strip()
            display = full_name or row.get('actor__username') or row.get('actor__email') or 'Unknown'
            users.append({
                'id': row['actor_id'],
                'label': display,
                'email': row.get('actor__email') or '',
            })

        return Response({'models': models, 'users': users})
    
    @action(detail=False, methods=['get'])
    def import_history(self, request):
        """Get import history (filtered audit logs for import actions)"""
        queryset = self.filter_queryset(self.get_queryset()).filter(
            object_repr__icontains='Import'
        )

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
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
        Download audit logs as Excel, PDF, or JSON.
        Supports same filters as list endpoint.
        """
        import json
        import openpyxl
        from django.http import HttpResponse
        from django.utils import timezone
        from io import BytesIO
        
        format_type = request.query_params.get('file_format', 'xlsx').lower()
        if format_type not in ['xlsx', 'pdf', 'json']:
            return Response(
                {'error': 'Format must be xlsx, pdf, or json'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get filtered queryset (date filters are already applied via filter_queryset → get_queryset)
        queryset = self.filter_queryset(self.get_queryset())
        
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

        if format_type in ['xlsx', 'pdf']:
            fieldnames = set()
            for log in logs:
                fieldnames.update(log.keys())

            ordered_fields = [
                'id', 'timestamp', 'user_name', 'user_email', 'action',
                'model_name', 'object_id', 'object_repr', 'ip_address',
                'changes'
            ]
            # Add any remaining fields
            for field in sorted(fieldnames):
                if field not in ordered_fields:
                    ordered_fields.append(field)

            rows = [ordered_fields]
            for log in logs:
                rows.append([
                    json.dumps(log.get(field), default=str) if isinstance(log.get(field), (dict, list)) else str(log.get(field, ''))
                    for field in ordered_fields
                ])

        if format_type == 'xlsx':
            workbook = openpyxl.Workbook()
            worksheet = workbook.active
            worksheet.title = 'Audit Logs'
            for row in rows:
                worksheet.append(row)
            for column_cells in worksheet.columns:
                max_length = max(len(str(cell.value or '')) for cell in column_cells)
                worksheet.column_dimensions[column_cells[0].column_letter].width = min(max(max_length + 2, 12), 40)
            output = BytesIO()
            workbook.save(output)
            output.seek(0)
            response = HttpResponse(
                output.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response

        if format_type == 'pdf':
            from apps.core.services.report_pdf import build_table_pdf_response

            return build_table_pdf_response(
                title='Audit Logs',
                subtitle=f"Generated on {timezone.now().strftime('%Y-%m-%d %H:%M')}",
                filename=filename,
                headers=ordered_fields,
                rows=rows[1:],
                landscape=True,
                max_rows=500,
                summary=[
                    f'Records included: {min(len(rows) - 1, 500)}',
                    f'Filtered records available: {total_count}',
                ],
            )

        else:
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
    permission_classes = [IsAuthenticated, HasPermission('manage_backups')]
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
        backup = serializer.save(created_by=self.request.user, status='pending')
        from .tasks import create_system_backup
        async_enabled = str(
            getattr(settings, 'SYSTEM_BACKUP_ASYNC', os.environ.get('SYSTEM_BACKUP_ASYNC', 'false'))
        ).lower() in ('1', 'true', 'yes', 'on')
        if async_enabled:
            create_system_backup.delay(backup.id)
        else:
            create_system_backup(backup.id)
            backup.refresh_from_db()
        
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
        if backup.status != 'completed' or not backup.file_path or not os.path.exists(backup.file_path):
            return Response(
                {'error': 'Backup not available for download'},
                status=status.HTTP_400_BAD_REQUEST
            )

        filename = os.path.basename(backup.file_path)
        return FileResponse(
            open(backup.file_path, 'rb'),
            as_attachment=True,
            filename=filename,
            content_type='application/zip',
        )
    
    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Restore from backup"""
        backup = self.get_object()
        if backup.status != 'completed':
            return Response(
                {'error': 'Backup not completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return Response({
            'error': 'Automatic restore is not enabled. Download the backup and restore it through a supervised maintenance workflow.'
        }, status=status.HTTP_501_NOT_IMPLEMENTED)


class EmailTemplateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing email templates
    """
    permission_classes = [IsAuthenticated, HasPermission('manage_notifications')]
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
    permission_classes = [IsAuthenticated, HasPermission('manage_notifications')]
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
@permission_classes([IsAuthenticated, HasPermission('manage_settings')])
def admin_dashboard_stats(request):
    """Get admin dashboard statistics"""
    visible_users = User.objects.exclude(role='super-admin')
    total_users = visible_users.count()
    active_users = visible_users.filter(is_active=True).count()
    total_settings = SystemSettings.objects.count()
    
    # Recent audit logs
    recent_logs = (
        LogEntry.objects.select_related('actor', 'content_type')
        .exclude(actor__role='super-admin')
        .order_by('-timestamp')[:10]
    )
    
    # Users by role
    user_by_role = visible_users.values('role').annotate(count=Count('id'))
    
    # Recent backups
    recent_backups = SystemBackup.objects.exclude(created_by__role='super-admin').order_by('-started_at')[:5]
    
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
    permission_classes = [IsAuthenticated, HasPermission('manage_roles')]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'is_system']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['name', 'priority', 'created_at']
    ordering = ['-priority', 'name']
    
    def get_queryset(self):
        return Role.objects.prefetch_related('permissions').exclude(code='super-admin')
    
    def get_serializer_class(self):
        from .admin_serializers import RoleSerializer, RoleCreateUpdateSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return RoleCreateUpdateSerializer
        return RoleSerializer
    
    def perform_create(self, serializer):
        from apps.accounts.role_utils import clear_role_permission_cache
        serializer.save()
        clear_role_permission_cache()
    
    def perform_update(self, serializer):
        from apps.accounts.role_utils import clear_role_permission_cache
        serializer.save()
        clear_role_permission_cache()

    def perform_destroy(self, instance):
        if instance.is_system:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'Cannot delete system roles'})
        instance.delete()
    
    @action(detail=True, methods=['get'])
    def permissions(self, request, pk=None):
        """Get all permissions for a role"""
        role = self.get_object()
        permissions = role.permissions.all()
        if getattr(request.user, 'role', None) != 'super-admin':
            permissions = permissions.exclude(code__in=['view_modules', 'manage_modules'])
        from .admin_serializers import PermissionSerializer
        return Response(PermissionSerializer(permissions, many=True).data)
    
    @action(detail=True, methods=['post'])
    def assign_permissions(self, request, pk=None):
        """Assign permissions to a role"""
        if not HasPermission('manage_permissions').has_permission(request, self):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to assign role permissions.")

        role = self.get_object()
        permission_ids = list(dict.fromkeys(request.data.get('permission_ids', [])))
        if getattr(request.user, 'role', None) != 'super-admin':
            restricted_ids = set(
                Permission.objects.filter(
                    id__in=permission_ids,
                    code__in=['view_modules', 'manage_modules'],
                ).values_list('id', flat=True)
            )
            if restricted_ids:
                return Response(
                    {'permission_ids': ['Invalid or inactive permission ids.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        active_ids = set(Permission.objects.filter(id__in=permission_ids, is_active=True).values_list('id', flat=True))
        missing_ids = [permission_id for permission_id in permission_ids if permission_id not in active_ids]
        if missing_ids:
            return Response(
                {'permission_ids': [f'Invalid or inactive permission ids: {missing_ids}']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        role.permissions.set(permission_ids)
        from apps.accounts.role_utils import clear_role_permission_cache
        clear_role_permission_cache()

        return Response({'detail': 'Permissions updated successfully'})


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing permissions (read-only)
    """
    permission_classes = [IsAuthenticated, HasPermission('manage_permissions')]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'is_active', 'is_system']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['category', 'name']
    ordering = ['category', 'name']
    
    def get_queryset(self):
        queryset = Permission.objects.all()
        if getattr(self.request.user, 'role', None) != 'super-admin':
            queryset = queryset.exclude(code__in=['view_modules', 'manage_modules'])
        return queryset
    
    def get_serializer_class(self):
        from .admin_serializers import PermissionSerializer
        return PermissionSerializer


class SystemModuleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing system modules
    """
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_enabled']
    search_fields = ['name', 'slug', 'description']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']
    
    def get_queryset(self):
        return SystemModule.objects.all()
    
    def get_serializer_class(self):
        from .admin_serializers import SystemModuleSerializer
        return SystemModuleSerializer

    def get_permissions(self):
        """
        Module visibility and management are owner-only. This endpoint is not
        permission-delegable because module availability is a system boundary.
        """
        return [IsAuthenticated(), IsSuperAdmin()]


class SystemUpdateViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Check for application updates and trigger bare-metal production deploys.
    """
    permission_classes = [IsAuthenticated, HasPermission('manage_system_updates')]
    ordering = ['-started_at']

    def get_queryset(self):
        return SystemUpdateRun.objects.all()

    def get_serializer_class(self):
        from .admin_serializers import (
            SystemUpdateRunSerializer,
            SystemUpdateCheckSerializer,
            SystemUpdateTriggerSerializer,
        )
        if self.action == 'check':
            return SystemUpdateCheckSerializer
        if self.action == 'apply':
            return SystemUpdateTriggerSerializer
        return SystemUpdateRunSerializer

    @action(detail=False, methods=['get'])
    def check(self, request):
        from .system_updater import check_for_updates, updater_status

        ref = request.query_params.get('ref') or None
        availability = check_for_updates(ref=ref)
        payload = availability.as_dict()
        payload['updater'] = updater_status()
        serializer = self.get_serializer(payload)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def apply(self, request):
        from .system_updater import (
            check_for_updates,
            deployed_commit,
            updater_status,
        )

        status_info = updater_status()
        if not status_info['can_apply']:
            return Response(
                {
                    'detail': (
                        'System updates are not available on this server. '
                        'Install deploy/sudoers-svr-system-update and set SYSTEM_UPDATE_ENABLED=true.'
                    ),
                    'updater': status_info,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if SystemUpdateRun.objects.filter(status__in=['pending', 'in_progress']).exists():
            return Response(
                {'detail': 'Another update is already running.'},
                status=status.HTTP_409_CONFLICT,
            )

        trigger = self.get_serializer(data=request.data)
        trigger.is_valid(raise_exception=True)
        git_ref = trigger.validated_data.get('git_ref') or 'main'

        availability = check_for_updates(ref=git_ref)
        run = SystemUpdateRun.objects.create(
            status='pending',
            git_ref=git_ref,
            from_commit=availability.deployed_commit or deployed_commit() or '',
            to_commit=availability.remote_commit or '',
            created_by=request.user,
        )

        from .tasks import run_system_update
        async_enabled = str(
            getattr(settings, 'SYSTEM_UPDATE_ASYNC', os.environ.get('SYSTEM_UPDATE_ASYNC', 'true'))
        ).lower() in ('1', 'true', 'yes', 'on')
        if async_enabled:
            run_system_update.delay(run.id)
        else:
            run_system_update(run.id)
            run.refresh_from_db()

        output = SystemUpdateRunSerializer(run, context={'request': request})
        return Response(output.data, status=status.HTTP_202_ACCEPTED)
