from rest_framework import viewsets, status, filters
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from django.db.models import Count, Q
from django.utils import timezone
from django.conf import settings
from django_filters.rest_framework import DjangoFilterBackend
from apps.accounts.permissions import (
    HasAnyPermission,
    HasPermission,
    IsModuleEnabled,
    user_has_permission,
)
import logging
from datetime import timedelta

logger = logging.getLogger(__name__)

from .models import NotificationTemplate, Notification, NotificationPreference, NotificationLog, WebPushSubscription
from .serializers import (
    NotificationTemplateSerializer, NotificationTemplateListSerializer,
    NotificationSerializer, NotificationListSerializer, NotificationCreateSerializer,
    NotificationPreferenceSerializer, NotificationLogSerializer,
    BulkNotificationSerializer, NotificationStatsSerializer,
    WebPushSubscriptionSerializer
)
from .services import NotificationService
from .preview_context import build_sample_context
from .currency import enrich_money_context
from .template_variables import (
    get_variable_hints as get_template_variable_hints,
    find_unresolved_placeholders,
)
from .hubtel_sms import send_sms, send_bulk_sms, is_hubtel_available


class LargePageSizePagination(PageNumberPagination):
    """
    Pagination class with large page size for templates.
    This allows loading all templates in one request while still supporting
    pagination if the number of templates grows significantly.
    """
    page_size = 200
    page_size_query_param = 'page_size'
    max_page_size = 500


class NotificationTemplateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing notification templates
    """
    queryset = NotificationTemplate.objects.all()
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve', 'by_type', 'preview', 'variable_hints']:
            return [IsAuthenticated(), HasAnyPermission(['view_notifications', 'manage_notification_templates', 'manage_email_templates', 'send_notifications'])]
        elif self.action in ['create', 'update', 'partial_update', 'destroy', 'test_send']:
            return [IsAuthenticated(), HasAnyPermission(['manage_notification_templates', 'manage_email_templates'])]
        return [IsAuthenticated(), HasAnyPermission(['view_notifications', 'manage_notification_templates', 'send_notifications'])()]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['template_type', 'channel', 'is_active']
    search_fields = ['name', 'subject', 'body']
    ordering_fields = ['created_at', 'name', 'template_type']
    ordering = ['-created_at']
    pagination_class = LargePageSizePagination  # Large page size to load all templates in one request
    
    def get_serializer_class(self):
        if self.action == 'list':
            return NotificationTemplateListSerializer
        return NotificationTemplateSerializer
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def test_send(self, request, pk=None):
        """
        Test send a notification template
        """
        template = self.get_object()
        recipient_id = request.data.get('recipient_id')
        test_data = request.data.get('data', {})
        
        if not recipient_id:
            return Response(
                {'error': 'recipient_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create test notification
        notification = Notification.objects.create(
            recipient_id=recipient_id,
            notification_type='system',
            channel=template.channel,
            priority='normal',
            title=f"Test: {template.name}",
            message=template.body,
            data=test_data,
            template=template
        )
        
        # Send immediately
        service = NotificationService()
        result = service.send_notification(notification, force_sync=True)
        
        return Response({
            'notification_id': notification.id,
            'result': result,
            'status': notification.status
        })

    @action(detail=False, methods=['get'])
    def variable_hints(self, request):
        """Return {variable} placeholders for a template type."""
        template_type = request.query_params.get('template_type', 'custom')
        return Response({
            'template_type': template_type,
            'variables': get_template_variable_hints(template_type),
        })

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        """Render template with sample context (includes system currency)."""
        template = self.get_object()
        context = build_sample_context(template.template_type)
        custom = request.data.get('context') or {}
        if isinstance(custom, dict):
            context.update(custom)
            context = enrich_money_context(context)

        service = NotificationService()
        subject_src = request.data.get('subject', template.subject) or ''
        body_src = request.data.get('body', template.body) or ''
        html_src = request.data.get('html_body', template.html_body) or ''

        subject = service._render_template(subject_src, context)
        body = service._render_template(body_src, context)
        html_body = service._render_template(html_src, context) if html_src else ''

        unresolved = find_unresolved_placeholders(
            subject_src + body_src + html_src, context
        )

        return Response({
            'subject': subject,
            'body': body,
            'html_body': html_body,
            'context': context,
            'unresolved_variables': unresolved,
        })
    
    @action(detail=False, methods=['get'])
    def by_type(self, request):
        """
        Get templates grouped by type
        """
        template_type = request.query_params.get('type')
        if template_type:
            templates = self.queryset.filter(template_type=template_type, is_active=True)
        else:
            templates = self.queryset.filter(is_active=True)
        
        serializer = self.get_serializer(templates, many=True)
        return Response(serializer.data)


class NotificationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing notifications
    """
    queryset = Notification.objects.select_related('recipient', 'template')
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve', 'my_notifications', 'stats', 'unread_count', 'mark_read', 'mark_all_read', 'clear_read']:
            return [IsAuthenticated(), HasPermission('view_notifications')()]
        if self.action == 'admin_stats':
            return [IsAuthenticated(), HasPermission('manage_notifications')()]
        if self.action in ['create', 'bulk_send']:
            return [IsAuthenticated(), HasPermission('send_notifications')()]
        elif self.action in ['update', 'partial_update', 'destroy', 'resend']:
            return [IsAuthenticated(), HasPermission('manage_notifications')()]
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [IsAuthenticated(), HasPermission('view_notifications')()]
        return [IsAuthenticated(), HasPermission('manage_notifications')()]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['notification_type', 'channel', 'status', 'priority', 'is_read', 'related_object_type', 'related_object_id']
    search_fields = ['title', 'message']
    ordering_fields = ['created_at', 'priority', 'scheduled_for']
    ordering = ['-created_at']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return NotificationListSerializer
        elif self.action == 'create':
            return NotificationCreateSerializer
        elif self.action == 'bulk_send':
            return BulkNotificationSerializer
        return NotificationSerializer
    
    def get_queryset(self):
        """
        Filter notifications based on user role
        """
        user = self.request.user
        queryset = self.queryset

        # Technician mobile app: always own notifications only
        tech_app = self.request.headers.get('X-Tech-App', '').lower() in ('1', 'true', 'yes')
        if tech_app or getattr(user, 'role', None) == 'technician':
            return queryset.filter(recipient=user)

        # Admins and managers can see all IF explicitly requested
        from apps.accounts.permissions import user_can_view_all_notifications

        if user_can_view_all_notifications(user) and self.request.query_params.get('all', 'false') == 'true':
            return queryset

        # Default: See only their own
        return queryset.filter(recipient=user)
    
    @action(detail=False, methods=['get'])
    def my_notifications(self, request):
        """
        Get current user's notifications
        """
        notifications = self.queryset.filter(recipient=request.user)
        
        # Apply filters
        unread_only = request.query_params.get('unread_only', 'false').lower() == 'true'
        if unread_only:
            notifications = notifications.filter(is_read=False)
        
        notification_type = request.query_params.get('type')
        if notification_type:
            notifications = notifications.filter(notification_type=notification_type)
        
        page = self.paginate_queryset(notifications)
        if page is not None:
            serializer = NotificationListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = NotificationListSerializer(notifications, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """
        Mark notification as read
        """
        notification = self.get_object()
        
        # Check if user owns this notification
        from apps.accounts.permissions import user_can_view_all_notifications

        if notification.recipient != request.user and not user_can_view_all_notifications(request.user):
            return Response(
                {'error': 'You do not have permission to mark this notification'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        notification.mark_as_read()
        
        return Response({
            'status': 'success',
            'message': 'Notification marked as read'
        })
    
    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """
        Mark all user's notifications as read
        """
        notifications = Notification.objects.filter(
            recipient=request.user,
            is_read=False
        )
        
        notifications_to_log = list(notifications)
        count = len(notifications_to_log)
        now = timezone.now()
        
        notifications.update(
            is_read=True,
            read_at=now,
            status='read'
        )
        NotificationLog.objects.bulk_create([
            NotificationLog(notification=notification, action='read', details='Marked read in bulk')
            for notification in notifications_to_log
        ])
        
        return Response({
            'status': 'success',
            'message': f'{count} notifications marked as read',
            'count': count
        })
    
    @action(detail=False, methods=['delete'])
    def clear_read(self, request):
        """
        Delete all read notifications for current user
        """
        notifications = Notification.objects.filter(
            recipient=request.user,
            is_read=True
        )
        
        count = notifications.count()
        notifications.delete()
        
        return Response({
            'status': 'success',
            'message': f'{count} notifications deleted',
            'count': count
        })
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        Get notification statistics for current user
        """
        notifications = Notification.objects.filter(recipient=request.user)
        
        total = notifications.count()
        unread = notifications.filter(is_read=False).count()
        
        # By type
        by_type = notifications.values('notification_type').annotate(
            count=Count('id')
        )
        by_type_dict = {item['notification_type']: item['count'] for item in by_type}
        
        # By channel
        by_channel = notifications.values('channel').annotate(
            count=Count('id')
        )
        by_channel_dict = {item['channel']: item['count'] for item in by_channel}
        
        # By status
        by_status = notifications.values('status').annotate(
            count=Count('id')
        )
        by_status_dict = {item['status']: item['count'] for item in by_status}
        
        # Recent notifications
        recent = notifications.order_by('-created_at')[:5]
        
        stats_data = {
            'total_notifications': total,
            'unread_count': unread,
            'by_type': by_type_dict,
            'by_channel': by_channel_dict,
            'by_status': by_status_dict,
            'recent_notifications': NotificationListSerializer(recent, many=True).data
        }
        
        return Response(stats_data)

    @action(detail=False, methods=['get'])
    def admin_stats(self, request):
        """
        Compact system-wide notification analytics for managers/admins.
        """
        days = int(request.query_params.get('days', 30))
        days = max(1, min(days, 365))
        since = timezone.now() - timedelta(days=days)
        notifications = Notification.objects.filter(created_at__gte=since)

        total = notifications.count()
        unread = notifications.filter(is_read=False).count()
        failed = notifications.filter(status='failed').count()
        pending = notifications.filter(status='pending').count()
        delivered = notifications.filter(status__in=['sent', 'delivered', 'read']).count()

        def counts(field):
            return {
                item[field]: item['count']
                for item in notifications.values(field).annotate(count=Count('id')).order_by('-count')
            }

        failed_recent = NotificationListSerializer(
            notifications.filter(status='failed').order_by('-updated_at')[:10],
            many=True,
        ).data

        return Response({
            'days': days,
            'total': total,
            'unread': unread,
            'failed': failed,
            'pending': pending,
            'delivered': delivered,
            'success_rate': round((delivered / total) * 100, 1) if total else 0,
            'by_type': counts('notification_type'),
            'by_channel': counts('channel'),
            'by_status': counts('status'),
            'failed_recent': failed_recent,
        })
    
    @action(detail=False, methods=['post'])
    def bulk_send(self, request):
        """
        Send notifications to multiple users
        """
        serializer = BulkNotificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        data = serializer.validated_data
        recipient_ids = data.pop('recipient_ids')
        
        # Create notifications for each recipient
        notifications = []
        for recipient_id in recipient_ids:
            notification = Notification.objects.create(
                recipient_id=recipient_id,
                **data
            )
            notifications.append(notification)
        
        # Send notifications
        service = NotificationService()
        results = []
        for notification in notifications:
            result = service.send_notification(notification, force_sync=True)
            results.append({
                'notification_id': notification.id,
                'recipient_id': notification.recipient.id,
                'status': notification.status,
                'success': result
            })
        
        return Response({
            'message': f'Sent {len(notifications)} notifications',
            'results': results
        })
    
    @action(detail=True, methods=['post'])
    def resend(self, request, pk=None):
        """
        Resend a failed notification
        """
        notification = self.get_object()
        
        if notification.status != 'failed':
            return Response(
                {'error': 'Only failed notifications can be resent'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Reset status
        notification.status = 'pending'
        notification.error_message = ''
        notification.save()
        
        # Attempt to send again
        service = NotificationService()
        result = service.send_notification(notification, force_sync=True)
        
        return Response({
            'status': 'success' if result else 'failed',
            'notification_status': notification.status,
            'message': 'Notification resent' if result else 'Resend failed'
        })
    
    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        """
        Get count of unread notifications
        """
        count = Notification.objects.filter(
            recipient=request.user,
            is_read=False
        ).count()
        
        return Response({'unread_count': count})


class NotificationPreferenceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing notification preferences
    """
    queryset = NotificationPreference.objects.all().order_by('user_id')
    serializer_class = NotificationPreferenceSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if (
            self.action == 'list'
            and self.request.query_params.get('all', 'false') == 'true'
        ):
            return [IsAuthenticated(), HasPermission('manage_notifications')()]
        return [IsAuthenticated()]

    def get_queryset(self):
        """
        Users can only see their own preferences
        """
        user = self.request.user

        if (
            user_has_permission(user, 'manage_notifications')
            and self.request.query_params.get('all', 'false') == 'true'
        ):
            return self.queryset

        return self.queryset.filter(user=user)
    
    @action(detail=False, methods=['get'])
    def my_preferences(self, request):
        """
        Get current user's notification preferences
        """
        preferences, created = NotificationPreference.objects.get_or_create(
            user=request.user
        )
        
        serializer = self.get_serializer(preferences)
        return Response(serializer.data)
    
    @action(detail=False, methods=['put', 'patch'])
    def update_preferences(self, request):
        """
        Update current user's notification preferences
        """
        preferences, created = NotificationPreference.objects.get_or_create(
            user=request.user
        )
        
        serializer = self.get_serializer(
            preferences,
            data=request.data,
            partial=request.method == 'PATCH'
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def update_push_token(self, request):
        """
        Update push notification token
        """
        token = request.data.get('push_token')
        if not token:
            return Response(
                {'error': 'push_token is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        preferences, created = NotificationPreference.objects.get_or_create(
            user=request.user
        )
        preferences.push_token = token
        preferences.save()
        
        return Response({
            'status': 'success',
            'message': 'Push token updated'
        })


class NotificationLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing notification logs
    """
    queryset = NotificationLog.objects.select_related('notification')
    serializer_class = NotificationLogSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'by_notification']:
            return [IsAuthenticated(), HasPermission('view_notifications')]
        return [IsAuthenticated(), HasPermission('manage_notifications')()]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['notification', 'action']
    ordering_fields = ['timestamp']
    ordering = ['-timestamp']
    
    def get_queryset(self):
        """
        Filter logs based on user permissions
        """
        user = self.request.user

        if (
            user_has_permission(user, 'manage_notifications')
            and self.request.query_params.get('all', 'false') == 'true'
        ):
            return self.queryset

        # Users can only see logs for their own notifications
        return self.queryset.filter(notification__recipient=user)
    
    @action(detail=False, methods=['get'])
    def by_notification(self, request):
        """
        Get logs for a specific notification
        """
        notification_id = request.query_params.get('notification_id')
        if not notification_id:
            return Response(
                {'error': 'notification_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        logs = self.get_queryset().filter(notification_id=notification_id)
        serializer = self.get_serializer(logs, many=True)

        return Response(serializer.data)


def _build_sms_context(customer=None):
    """
    Build a variable substitution context for SMS console messages.
    Pulls the latest vehicle, work order, invoice and appointment for the customer.
    """
    from apps.accounts.settings_utils import get_company_info
    from django.utils import timezone

    company = get_company_info()
    ctx = {
        'company_name': company.get('company_name', ''),
        'company_phone': company.get('company_phone', ''),
    }

    if not customer:
        return ctx

    # Customer name
    full_name = (
        getattr(customer, 'full_name', None)
        or f"{customer.first_name or ''} {customer.last_name or ''}".strip()
        or getattr(customer, 'company_name', '')
    )
    ctx['customer_name'] = full_name

    # Latest vehicle
    try:
        vehicle = customer.vehicles.order_by('-created_at').first()
        if vehicle:
            display = f"{vehicle.year} {vehicle.make} {vehicle.model}".strip()
            ctx['vehicle'] = display
            ctx['vehicle_display'] = display
    except Exception:
        pass

    # Latest work order
    try:
        wo = customer.work_orders.order_by('-created_at').first()
        if wo:
            ctx['work_order_number'] = wo.work_order_number or ''
            ctx['service_description'] = wo.diagnosis_notes or wo.service_type or ''
            tech = getattr(wo, 'primary_technician', None)
            ctx['technician_name'] = tech.get_full_name() if tech else ''
    except Exception:
        pass

    # Latest appointment
    try:
        apt = customer.appointments.order_by('-appointment_date', '-appointment_time').first()
        if apt:
            ctx['appointment_number'] = getattr(apt, 'appointment_number', '') or ''
            ctx['appointment_date'] = str(apt.appointment_date) if apt.appointment_date else ''
            ctx['appointment_time'] = str(apt.appointment_time) if apt.appointment_time else ''
    except Exception:
        pass

    # Latest invoice
    try:
        inv = customer.invoices.order_by('-invoice_date').first()
        if inv:
            ctx['invoice_number'] = inv.invoice_number or ''
            ctx['invoice_date'] = str(inv.invoice_date) if inv.invoice_date else ''
            ctx['total'] = str(inv.total or '')
            ctx['due_date'] = str(inv.due_date) if inv.due_date else ''
            ctx['balance_due'] = str(inv.amount_due or '')
            ctx['amount_paid'] = str(inv.amount_paid or '')
            # Payment method from latest payment
            try:
                payment = inv.payments.order_by('-created_at').first()
                ctx['payment_method'] = payment.payment_method if payment else ''
            except Exception:
                ctx['payment_method'] = ''
            # Days until/overdue
            if inv.due_date:
                delta = (inv.due_date - timezone.now().date()).days
                ctx['days_until_due'] = str(delta) if delta >= 0 else '0'
                ctx['days_overdue'] = str(abs(delta)) if delta < 0 else '0'
    except Exception:
        pass

    return ctx


class SMSConsoleViewSet(viewsets.ViewSet):
    """
    ViewSet for SMS Console operations (Single & Bulk)
    """
    permission_classes = [IsAuthenticated, IsModuleEnabled('sms')]
    
    def get_permissions(self):
        """
        Require 'send_notifications' permission
        """
        return [IsAuthenticated(), IsModuleEnabled('sms'), HasPermission('send_notifications')]

    def _get_sms_notification(self, pk):
        try:
            return Notification.objects.select_related('recipient').get(
                pk=pk,
                channel='sms',
                notification_type='custom',
            )
        except Notification.DoesNotExist:
            return None

    def _serialize_sms_notification(self, notification):
        recipient_name = "Unknown"
        recipient_phone = ""
        recipient_initials = "U"

        if notification.recipient:
            full_name = notification.recipient.get_full_name()
            if not full_name:
                try:
                    if hasattr(notification.recipient, 'customer_profile') and notification.recipient.customer_profile.company_name:
                        full_name = notification.recipient.customer_profile.company_name
                except Exception:
                    pass

            recipient_name = full_name or notification.recipient.username or notification.recipient.email or f"User #{notification.recipient.id}"
            recipient_phone = notification.recipient.phone or ""

            if full_name:
                parts = full_name.split()
                if len(parts) >= 2:
                    recipient_initials = (parts[0][0] + parts[-1][0]).upper()
                else:
                    recipient_initials = parts[0][:2].upper()
            else:
                recipient_initials = recipient_name[:2].upper()
        elif notification.data.get('direct_send'):
            phone_number = notification.data.get('phone_number', '')
            recipient_name = phone_number
            recipient_phone = phone_number
            recipient_initials = phone_number[:2] if phone_number else 'DP'

        return {
            'id': notification.id,
            'created_at': notification.created_at,
            'updated_at': notification.updated_at,
            'sent_at': notification.sent_at,
            'delivered_at': notification.delivered_at,
            'failed_at': notification.failed_at,
            'recipient_name': recipient_name,
            'recipient_phone': recipient_phone,
            'recipient_initials': recipient_initials,
            'message': notification.message,
            'status': notification.status,
            'scheduled_for': notification.scheduled_for,
            'error_message': notification.error_message,
            'title': notification.title,
            'priority': notification.priority,
            'recipient_id': notification.recipient_id,
            'data': notification.data,
        }

    @action(detail=False, methods=['post'])
    def send_single(self, request):
        """
        Send a single SMS to a phone number or recipient ID
        """
        phone = request.data.get('phone')
        recipient_id = request.data.get('recipient_id')
        message = request.data.get('message')
        
        
        scheduled_for = request.data.get('scheduled_for')
        
        if not message:
            return Response(
                {'error': 'Message is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        if not phone and not recipient_id:
            return Response(
                {'error': 'Either phone or recipient_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Case 1: Send to Recipient (System User) - Creates Notification
        if recipient_id:
            try:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                customer = None
                # Resolve customer profile ID → user ID if needed
                if not User.objects.filter(id=recipient_id).exists():
                    from apps.customers.models import Customer
                    try:
                        customer = Customer.objects.get(id=recipient_id)
                        recipient_id = customer.user_id
                    except Customer.DoesNotExist:
                        return Response({'error': 'Recipient not found'}, status=status.HTTP_400_BAD_REQUEST)

                # Build variable context for {variable} substitution in message
                if customer is None:
                    try:
                        from apps.customers.models import Customer
                        customer = Customer.objects.filter(user_id=recipient_id).first()
                    except Exception:
                        pass

                context = _build_sms_context(customer)
                rendered_message = NotificationService()._render_template(message, context)

                notification = Notification.objects.create(
                    recipient_id=recipient_id,
                    notification_type='custom',
                    channel='sms',
                    priority='normal',
                    title='SMS Console Message',
                    message=rendered_message,
                    status='pending',
                    scheduled_for=scheduled_for
                )
                
                service = NotificationService()
                success = service.send_notification(notification, force_sync=True)

                if not success:
                    return Response(
                        {'error': notification.error_message or 'SMS failed to send'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                return Response({
                    'status': 'success',
                    'message': 'SMS scheduled' if scheduled_for else 'SMS sent successfully',
                    'notification_id': notification.id
                })
            except Exception as e:
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Case 2: Send to Raw Phone - Direct Hubtel Call
        if phone:
            rendered_message = NotificationService()._render_template(message, _build_sms_context(None))

            if scheduled_for:
                notification = Notification.objects.create(
                    recipient=None,
                    notification_type='custom',
                    channel='sms',
                    priority='normal',
                    title='Scheduled Direct SMS',
                    message=rendered_message,
                    status='pending',
                    scheduled_for=scheduled_for,
                    data={'phone_number': phone, 'direct_send': True},
                )
                return Response({
                    'status': 'success',
                    'message': 'SMS scheduled',
                    'notification_id': notification.id,
                })

            success, response = send_sms(phone, rendered_message)

            # Log the direct phone SMS so it appears in history
            log_status = 'sent' if success else 'failed'
            Notification.objects.create(
                recipient=None,
                notification_type='custom',
                channel='sms',
                priority='normal',
                title='Direct SMS',
                message=rendered_message,
                status=log_status,
                scheduled_for=scheduled_for,
                data={'phone_number': phone, 'direct_send': True},
                error_message=str(response) if not success else ''
            )

            if success:
                return Response({
                    'status': 'success',
                    'message': 'SMS sent successfully',
                    'details': response
                })
            else:
                return Response({
                    'error': response
                }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def send_bulk(self, request):
        """
        Send bulk SMS to mixed list of recipients and phone numbers
        """
        recipients = request.data.get('recipients', []) # List of {type: 'user'|'phone', value: '...'}
        message = request.data.get('message')
        scheduled_for = request.data.get('scheduled_for')
        
        if not message:
            return Response(
                {'error': 'Message is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        if not recipients:
             return Response(
                {'error': 'Recipients list is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not isinstance(recipients, list) or any(
            not isinstance(item, dict) or item.get('type') not in ['user', 'phone'] or not item.get('value')
            for item in recipients
        ):
            return Response(
                {'error': 'Recipients must be a list of user or phone entries.'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        results = []
        
        # Dispatch to background task to avoid timeout
        from .tasks import send_bulk_sms_async
        send_bulk_sms_async.delay(recipients, message, scheduled_for)
        
        # We don't have immediate results anymore since it's async,
        # but we need to return a compatible response format for the frontend.
        message_str = f"Bulk SMS queued for {len(recipients)} recipient(s)."
        if scheduled_for:
            message_str = f"Bulk SMS scheduled for {len(recipients)} recipient(s)."
            
        return Response({
            'message': message_str,
            'results': [],
            'total': len(recipients),
            'successful': len(recipients),  # Optimistically assumed successful queuing
            'failed': 0
        })

    @action(detail=False, methods=['get'])
    def history(self, request):
        """
        Get SMS history with structured recipient data
        """
        try:
            limit = int(request.query_params.get('limit', 50))
        except (TypeError, ValueError):
            limit = 50
        limit = max(1, min(limit, 500))

        recent = Notification.objects.filter(
            channel='sms',
            notification_type='custom'
        ).select_related('recipient').order_by('-created_at')[:limit]
        
        data = [self._serialize_sms_notification(n) for n in recent]
            
        return Response(data)

    @action(detail=True, methods=['get'])
    def details(self, request, pk=None):
        """Get one SMS log entry."""
        notification = self._get_sms_notification(pk)
        if not notification:
            return Response({'error': 'SMS log not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(self._serialize_sms_notification(notification))

    @action(detail=True, methods=['post'])
    def resend(self, request, pk=None):
        """Resend an SMS console log entry."""
        notification = self._get_sms_notification(pk)
        if not notification:
            return Response({'error': 'SMS log not found'}, status=status.HTTP_404_NOT_FOUND)

        if notification.data.get('direct_send'):
            phone = notification.data.get('phone_number')
            if not phone:
                return Response({'error': 'Original phone number is missing'}, status=status.HTTP_400_BAD_REQUEST)

            success, response = send_sms(phone, notification.message)
            resent = Notification.objects.create(
                recipient=None,
                notification_type='custom',
                channel='sms',
                priority=notification.priority,
                title='Resent Direct SMS',
                message=notification.message,
                status='sent' if success else 'failed',
                data={'phone_number': phone, 'direct_send': True, 'resent_from': notification.id},
                error_message=str(response) if not success else '',
            )
            if success:
                resent.sent_at = timezone.now()
                resent.save(update_fields=['sent_at', 'updated_at'])
                return Response({
                    'status': 'success',
                    'message': 'SMS resent successfully',
                    'notification_id': resent.id,
                })
            return Response({
                'status': 'failed',
                'error': str(response),
                'notification_id': resent.id,
            }, status=status.HTTP_400_BAD_REQUEST)

        if not notification.recipient_id:
            return Response({'error': 'Original recipient is missing'}, status=status.HTTP_400_BAD_REQUEST)

        resent = Notification.objects.create(
            recipient=notification.recipient,
            notification_type='custom',
            channel='sms',
            priority=notification.priority,
            title='Resent SMS Console Message',
            message=notification.message,
            status='pending',
            data={**notification.data, 'resent_from': notification.id},
        )
        success = NotificationService().send_notification(resent, force_sync=True)
        if not success:
            return Response({
                'status': 'failed',
                'error': resent.error_message or 'SMS failed to resend',
                'notification_id': resent.id,
            }, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'status': 'success',
            'message': 'SMS resent successfully',
            'notification_id': resent.id,
        })

    @action(detail=True, methods=['delete'])
    def delete_log(self, request, pk=None):
        """Delete one SMS log entry."""
        notification = self._get_sms_notification(pk)
        if not notification:
            return Response({'error': 'SMS log not found'}, status=status.HTTP_404_NOT_FOUND)
        notification.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['post'])
    def ai_assist(self, request):
        """
        AI-powered SMS assistant using Google Gemini.
        Supports multi-turn conversation via a 'messages' list.

        Request body:
            messages: list of {role: 'user'|'model', content: str}
            current_draft: str (optional — current message in compose box)
            mode: 'sms'|'template' (optional, default 'sms')
        """
        from django.conf import settings

        messages = request.data.get('messages', [])
        current_draft = request.data.get('current_draft', '')
        mode = request.data.get('mode', 'sms')

        if not messages:
            return Response({'error': 'messages list is required'}, status=status.HTTP_400_BAD_REQUEST)

        api_key = getattr(settings, 'GEMINI_API_KEY', '')
        if not api_key:
            return Response({'error': 'AI assistant is not configured'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        try:
            from google import genai
            from google.genai import types as genai_types

            client = genai.Client(api_key=api_key)

            system_prompt = (
                "You are an expert SMS copywriter for an automotive repair shop. "
                "You help staff craft professional, clear, and friendly SMS messages for customers. "
                "Keep messages concise (under 160 characters when possible). "
                "Use plain, warm language — no HTML, no emojis unless asked. "
                "Available template variables: {customer_name}, {appointment_date}, {appointment_time}, "
                "{vehicle}, {service_description}, {technician_name}, {invoice_number}, {total}, "
                "{due_date}, {balance_due}, {company_name}, {company_phone}. "
                "When you suggest a final SMS message, wrap ONLY the message text in [SMS]...[/SMS] tags "
                "so the system can extract it. You may explain or revise without those tags."
            )
            if current_draft:
                system_prompt += f"\n\nCurrent draft in compose box: \"{current_draft}\""
            if mode == 'template':
                system_prompt += "\n\nThe user is writing a reusable template — use variable placeholders freely."

            # Build contents list for Gemini
            contents = []
            for msg in messages:
                role = msg.get('role', 'user')
                content = msg.get('content', '')
                if role not in ('user', 'model'):
                    role = 'user'
                contents.append(genai_types.Content(
                    role=role,
                    parts=[genai_types.Part(text=content)]
                ))

            response = client.models.generate_content(
                model='gemini-flash-lite-latest',
                contents=contents,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    max_output_tokens=400,
                    temperature=0.7,
                )
            )

            reply = response.text or ''

            # Extract [SMS]...[/SMS] suggestion if present
            import re
            match = re.search(r'\[SMS\](.*?)\[/SMS\]', reply, re.DOTALL)
            suggestion = match.group(1).strip() if match else None

            return Response({'reply': reply, 'suggestion': suggestion})

        except Exception as e:
            err_str = str(e)
            logger.error(f"Gemini AI assist error: {err_str}")
            if '429' in err_str or 'RESOURCE_EXHAUSTED' in err_str:
                return Response(
                    {'error': 'AI assistant is temporarily unavailable (quota exceeded). Please try again later.'},
                    status=status.HTTP_429_TOO_MANY_REQUESTS
                )
            return Response({'error': 'AI assistant encountered an error. Please try again.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        Get SMS console statistics
        """
        from django.utils import timezone
        from datetime import timedelta
        
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Get stats for custom SMS sent via console
        sent_today = Notification.objects.filter(
            channel='sms',
            notification_type='custom',
            created_at__gte=today_start,
            status__in=['sent', 'delivered']
        ).count()
        
        scheduled = Notification.objects.filter(
            channel='sms',
            notification_type='custom',
            status='pending',
            scheduled_for__isnull=False
        ).count()
        
        failed_today = Notification.objects.filter(
            channel='sms',
            notification_type='custom',
            created_at__gte=today_start,
            status='failed'
        ).count()
        
        total_sent = Notification.objects.filter(
            channel='sms',
            notification_type='custom',
            status__in=['sent', 'delivered']
        ).count()
        
        return Response({
            'sent_today': sent_today,
            'scheduled': scheduled,
            'failed_today': failed_today,
            'total_sent': total_sent
        })
    
    @action(detail=False, methods=['get'])
    def balance(self, request):
        """
        Get SMS account balance
        """
        from .hubtel_sms import get_sms_balance
        
        balance_info = get_sms_balance()
        return Response(balance_info)


class TemplateRenderView(APIView):
    """
    Render a notification template for manual sending (e.g. WhatsApp)
    """
    permission_classes = [IsAuthenticated, HasAnyPermission(['send_notifications', 'manage_notifications'])]
    
    def post(self, request):
        template_type = request.data.get('template_type')
        object_id = request.data.get('object_id')
        channel = request.data.get('channel', 'whatsapp_manual')
        
        if not template_type or not object_id:
            return Response(
                {'error': 'template_type and object_id are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # 1. Find Template
        try:
            # Try specific channel first, then fallback to any active
            template = NotificationTemplate.objects.filter(
                template_type=template_type, 
                channel=channel,
                is_active=True
            ).first()
            
            if not template:
                 # Fallback to SMS if available (similar length)
                template = NotificationTemplate.objects.filter(
                    template_type=template_type, 
                    channel='sms',
                    is_active=True
                ).first()
                
            if not template:
                return Response(
                    {'error': f'No active template found for {template_type}'},
                    status=status.HTTP_404_NOT_FOUND
                )
        except Exception as e:
             return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # 2. Get Object and Context
        context = {}
        phone_number = ""
        
        try:
            if 'appointment' in template_type:
                from apps.appointments.models import Appointment
                obj = Appointment.objects.get(id=object_id)
                
                # Context
                customer_name = obj.customer.company_name if obj.customer.company_name else obj.customer.user.get_full_name()
                context = {
                    'appointment_id': obj.id,
                    'customer_name': customer_name,
                    'vehicle': f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}",
                    'appointment_date': str(obj.appointment_date),
                    'appointment_time': str(obj.appointment_time)
                }
                
                # Phone
                if obj.customer.phone:
                    phone_number = obj.customer.phone
                elif obj.customer.user.phone:
                    phone_number = obj.customer.user.phone
                    
            elif 'work_order' in template_type:
                from apps.workorders.models import WorkOrder
                obj = WorkOrder.objects.get(id=object_id)
                
                customer_name = obj.customer.company_name if obj.customer.company_name else obj.customer.user.get_full_name()
                context = {
                    'work_order_id': obj.id, 
                    'wo_number': obj.work_order_number,
                    'customer_name': customer_name,
                    'vehicle': f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
                }
                
                if obj.customer.phone:
                    phone_number = obj.customer.phone
                elif obj.customer.user.phone:
                    phone_number = obj.customer.user.phone

            elif 'invoice' in template_type:
                from apps.billing.models import Invoice
                obj = Invoice.objects.get(id=object_id)
                 
                context = {
                    'invoice_id': obj.id,
                    'invoice_number': obj.invoice_number,
                    'total': str(obj.total),
                    'due_date': str(obj.due_date)
                }
                
                # Invoice -> WorkOrder -> Customer or Invoice -> Customer
                if hasattr(obj, 'work_order') and obj.work_order:
                     c = obj.work_order.customer
                     if c.phone: phone_number = c.phone
                     elif c.user.phone: phone_number = c.user.phone
                elif hasattr(obj, 'customer') and obj.customer:
                     c = obj.customer
                     if c.phone: phone_number = c.phone
                     elif c.user.phone: phone_number = c.user.phone

            elif 'customer' in template_type or 'user' in template_type or 'custom' in template_type:
                from apps.customers.models import Customer
                # Try to get customer by ID (assuming object_id is customer_id)
                obj = Customer.objects.get(id=object_id)
                
                customer_name = obj.company_name if obj.company_name else obj.user.get_full_name()
                context = {
                    'customer_id': obj.id,
                    'customer_name': customer_name,
                    'email': obj.user.email
                }
                
                if obj.phone:
                    phone_number = obj.phone
                elif obj.user.phone:
                    phone_number = obj.user.phone

            # Add more types as needed
            
        except Exception as e:
            return Response(
                {'error': f'Error fetching object: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # 3. Render Message
        service = NotificationService()
        # Prefer sms_body for WhatsApp, else body
        template_string = template.body
        if template.sms_body:
            template_string = template.sms_body
            
        message = service._render_template(template_string, context)
        
        return Response({
            'message': message,
            'phone_number': phone_number,
            'template_used': template.name
        })


class WebPushSubscriptionViewSet(viewsets.GenericViewSet):
    """
    ViewSet for managing Web Push subscriptions
    """
    permission_classes = [IsAuthenticated]
    serializer_class = WebPushSubscriptionSerializer
    queryset = WebPushSubscription.objects.all()

    @action(detail=False, methods=['get'])
    def public_key(self, request):
        """
        Return the public VAPID key used by browser push subscriptions.
        """
        public_key = getattr(settings, 'VAPID_PUBLIC_KEY', '')
        return Response({
            'public_key': public_key,
            'configured': bool(public_key),
        })
    
    @action(detail=False, methods=['post'])
    def subscribe(self, request):
        """
        Create or update a subscription
        """
        endpoint = request.data.get('endpoint')
        keys = request.data.get('keys', {})
        user_agent = request.META.get('HTTP_USER_AGENT', '')
        device_name = request.data.get('device_name', '')
        
        if not endpoint or not keys.get('p256dh') or not keys.get('auth'):
            return Response(
                {'error': 'endpoint, keys.p256dh, and keys.auth are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create or update subscription
        subscription, created = WebPushSubscription.objects.update_or_create(
            user=request.user,
            endpoint=endpoint,
            defaults={
                'p256dh': keys['p256dh'],
                'auth': keys['auth'],
                'user_agent': user_agent,
                'device_name': device_name,
                'is_active': True,
                'last_used': timezone.now(),
            }
        )
        
        # Update user's push preference
        preference, _ = NotificationPreference.objects.get_or_create(user=request.user)
        if not preference.push_enabled:
            preference.push_enabled = True
            preference.save()
            
        serializer = self.get_serializer(subscription)
        
        return Response({
            'subscription': serializer.data,
            'created': created,
            'message': 'Successfully subscribed to push notifications'
        })
    
    @action(detail=False, methods=['post'])
    def unsubscribe(self, request):
        """
        Unsubscribe from notifications
        """
        endpoint = request.data.get('endpoint')
        
        if not endpoint:
            return Response(
                {'error': 'endpoint is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Deactivate subscription
        count = WebPushSubscription.objects.filter(
            user=request.user,
            endpoint=endpoint
        ).update(is_active=False)
        
        return Response({
            'message': 'Successfully unsubscribed from push notifications',
            'count': count
        })
