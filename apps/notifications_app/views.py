from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from django.db.models import Count, Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend

from .models import NotificationTemplate, Notification, NotificationPreference, NotificationLog
from .serializers import (
    NotificationTemplateSerializer, NotificationTemplateListSerializer,
    NotificationSerializer, NotificationListSerializer, NotificationCreateSerializer,
    NotificationPreferenceSerializer, NotificationLogSerializer,
    BulkNotificationSerializer, NotificationStatsSerializer
)
from .services import NotificationService


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
        result = service.send_notification(notification)
        
        return Response({
            'notification_id': notification.id,
            'result': result,
            'status': notification.status
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
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['notification_type', 'channel', 'status', 'priority', 'is_read']
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
        
        # Admins and managers can see all
        if user.role in ['admin', 'manager']:
            return queryset
        
        # Others see only their own
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
        if notification.recipient != request.user and request.user.role not in ['admin', 'manager']:
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
        
        count = notifications.count()
        now = timezone.now()
        
        notifications.update(
            is_read=True,
            read_at=now,
            status='read'
        )
        
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
            result = service.send_notification(notification)
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
        result = service.send_notification(notification)
        
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
    queryset = NotificationPreference.objects.all()
    serializer_class = NotificationPreferenceSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """
        Users can only see their own preferences
        """
        user = self.request.user
        
        if user.role in ['admin', 'manager']:
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
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['notification', 'action']
    ordering_fields = ['timestamp']
    ordering = ['-timestamp']
    
    def get_queryset(self):
        """
        Filter logs based on user permissions
        """
        user = self.request.user
        
        if user.role in ['admin', 'manager']:
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
        
        logs = self.queryset.filter(notification_id=notification_id)
        serializer = self.get_serializer(logs, many=True)
        
        return Response(serializer.data)
