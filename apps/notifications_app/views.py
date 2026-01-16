from rest_framework import viewsets, status, filters
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from django.db.models import Count, Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from apps.accounts.permissions import HasPermission

from .models import NotificationTemplate, Notification, NotificationPreference, NotificationLog, WebPushSubscription
from .serializers import (
    NotificationTemplateSerializer, NotificationTemplateListSerializer,
    NotificationSerializer, NotificationListSerializer, NotificationCreateSerializer,
    NotificationPreferenceSerializer, NotificationLogSerializer,
    BulkNotificationSerializer, NotificationStatsSerializer
)
from .services import NotificationService
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
        if self.action in ['list', 'retrieve', 'by_type']:
            return [IsAuthenticated(), HasPermission('manage_notification_templates')]
        elif self.action in ['create', 'update', 'partial_update', 'destroy', 'test_send']:
            return [IsAuthenticated(), HasPermission('manage_notification_templates')]
        return [IsAuthenticated()]
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
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['create', 'bulk_send', 'resend']:
            return [IsAuthenticated(), HasPermission('send_notifications')]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), HasPermission('manage_notifications')]
        return [IsAuthenticated()]
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
        
        # Admins and managers can see all IF explicitly requested
        if user.role in ['admin', 'manager'] and self.request.query_params.get('all', 'false') == 'true':
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
        
        serializer = self.get_serializer(logs, many=True)
        
        return Response(serializer.data)


class SMSConsoleViewSet(viewsets.ViewSet):
    """
    ViewSet for SMS Console operations (Single & Bulk)
    """
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """
        Require 'send_notifications' permission
        """
        return [IsAuthenticated(), HasPermission('send_notifications')]

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
                notification = Notification.objects.create(
                    recipient_id=recipient_id,
                    notification_type='custom',
                    channel='sms',
                    priority='normal',
                    title='SMS Console Message', # SMS usually doesn't show title but it's required field
                    message=message,
                    status='pending',
                    scheduled_for=scheduled_for
                )
                
                service = NotificationService()
                success = service.send_notification(notification)
                
                return Response({
                    'status': 'success' if success else 'failed',
                    'message': 'SMS scheduled' if scheduled_for else ('SMS sent via Notification system' if success else notification.error_message),
                    'notification_id': notification.id
                })
            except Exception as e:
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Case 2: Send to Raw Phone - Direct Hubtel Call
        if phone:
            success, response = send_sms(phone, message)
            
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
            
        results = []
        raw_phones = []
        
        # Process User recipients first
        for recipient in recipients:
            if recipient.get('type') == 'user':
                try:
                    user_id = recipient.get('value')
                    notification = Notification.objects.create(
                        recipient_id=user_id,
                        notification_type='custom',
                        channel='sms',
                        priority='normal',
                        title='SMS Console Message',
                        message=message,
                        scheduled_for=scheduled_for
                    )
                    service = NotificationService()
                    success = service.send_notification(notification)
                    
                    # If scheduled, we consider it "successful" for now (queued)
                    is_scheduled = bool(scheduled_for)
                    status_label = 'scheduled' if is_scheduled else ('sent' if success else 'failed')
                    
                    results.append({
                        'recipient': f"User ID {user_id}",
                        'success': success or is_scheduled,
                        'status': status_label,
                        'error': None if (success or is_scheduled) else notification.error_message
                    })
                except Exception as e:
                    results.append({
                        'recipient': f"User ID {recipient.get('value')}",
                        'success': False,
                        'status': 'failed',
                        'error': str(e)
                    })
            elif recipient.get('type') == 'phone':
                raw_phones.append(recipient.get('value'))
        
        # Process Raw Phones in (pseudo) bulk
        # We use our existing bulk helper if available, or just loop
        # The existing send_bulk_sms takes a list of numbers
        if raw_phones:
            if scheduled_for:
                # Raw phones + scheduling is tricky if Hubtel API doesn't support it directly.
                # We can't use Notification model easily without a dummy user.
                # For now, we'll mark them as failed/unsupported for scheduling.
                for phone in raw_phones:
                    results.append({
                        'recipient': phone,
                        'success': False,
                        'status': 'failed',
                        'error': 'Scheduling not supported for raw phone numbers yet'
                    })
            else:
                bulk_results = send_bulk_sms(raw_phones, message)
                for phone, res in bulk_results.items():
                    results.append({
                        'recipient': phone,
                        'success': res['success'],
                        'status': 'sent' if res['success'] else 'failed',
                        'error': None if res['success'] else str(res['response'])
                    })

        success_count = sum(1 for r in results if r['success'])
        failed_count = len(results) - success_count
        
        # Build clear message
        if failed_count == 0:
            message = f"Successfully sent to all {len(results)} recipient(s)."
        elif success_count == 0:
            message = f"Failed to send to all {len(results)} recipient(s)."
        else:
            message = f"Sent to {success_count} recipient(s). {failed_count} failed."
        
        return Response({
            'message': message,
            'results': results,
            'total': len(results),
            'successful': success_count,
            'failed': failed_count
        })

    @action(detail=False, methods=['get'])
    def history(self, request):
        """
        Get recent SMS history (last 50)
        """
        # Filter notifications:
        # 1. Channel is SMS
        # 2. Type is 'custom' (sent from console) OR has logs with 'sms'
        # For simplicity, we track 'custom' type sent via console
        
        recent = Notification.objects.filter(
            channel='sms',
            notification_type='custom'
        ).select_related('recipient').order_by('-created_at')[:50]
        
        data = []
        for n in recent:
            # Get recipient name with proper fallbacks
            try:
                if n.recipient:
                    # Try full name first
                    recipient_name = n.recipient.get_full_name()
                    # If no full name, try customer profile company_name
                    if not recipient_name or recipient_name.strip() == '':
                        try:
                            if hasattr(n.recipient, 'customer_profile') and n.recipient.customer_profile.company_name:
                                recipient_name = n.recipient.customer_profile.company_name
                        except:
                            pass
                    # If no customer name, try username (but skip AnonymousUser)
                    if (not recipient_name or recipient_name.strip() == '') and n.recipient.username not in ['AnonymousUser', '']:
                        recipient_name = n.recipient.username
                    # If still nothing, use email
                    if not recipient_name or recipient_name.strip() == '':
                        recipient_name = n.recipient.email or f"User #{n.recipient.id}"
                    # Add phone if available
                    if n.recipient.phone:
                        recipient_name += f" ({n.recipient.phone})"
                else:
                    recipient_name = "Unknown Recipient"
            except Exception as e:
                recipient_name = "Unknown Recipient"
                
            data.append({
                'id': n.id,
                'created_at': n.created_at,
                'recipient': recipient_name,
                'message': n.message,
                'status': n.status,
                'scheduled_for': n.scheduled_for,
                'error_message': n.error_message
            })
            
        return Response(data)

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
    permission_classes = [IsAuthenticated]
    
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


class PushSubscribeView(APIView):
    """
    Subscribe to Web Push notifications
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
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
        preference.push_enabled = True
        preference.save()
        
        return Response({
            'id': subscription.id,
            'created': created,
            'message': 'Successfully subscribed to push notifications'
        })


class PushUnsubscribeView(APIView):
    """
    Unsubscribe from Web Push notifications
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        endpoint = request.data.get('endpoint')
        
        if not endpoint:
            return Response(
                {'error': 'endpoint is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Deactivate subscription
        WebPushSubscription.objects.filter(
            user=request.user,
            endpoint=endpoint
        ).update(is_active=False)
        
        return Response({
            'message': 'Successfully unsubscribed from push notifications'
        })
