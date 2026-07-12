"""
Views for appointments app
"""
import logging

from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import (
    HasPermission,
    HasAnyPermission,
    user_has_permission,
    IsModuleEnabled,
)
from apps.accounts.permission_utils import action_permission_instances
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Count
from django.utils import timezone
from datetime import datetime, timedelta, time

logger = logging.getLogger(__name__)

# Notification triggers
from apps.notifications_app.triggers import notification_triggers
from apps.branches.utils import filter_queryset_for_user_branches, resolve_branch
from apps.core.services.ai_service import AIService

from .models import Appointment, ServiceBay, AppointmentReminder
from .serializers import (
    AppointmentListSerializer,
    AppointmentDetailSerializer,
    AppointmentCreateSerializer,
    AppointmentUpdateSerializer,
    ServiceBaySerializer,
    AppointmentReminderSerializer,
    CalendarDaySerializer,
    TechnicianScheduleSerializer
)


class ServiceBayViewSet(viewsets.ModelViewSet):
    """ViewSet for service bay management"""
    serializer_class = ServiceBaySerializer
    permission_classes = [IsAuthenticated, IsModuleEnabled('appointments')]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'bay_type', 'is_active']
    search_fields = ['name', 'equipment_available']
    ordering_fields = ['name', 'bay_type']
    ordering = ['name']

    def get_permissions(self):
        base = [IsAuthenticated(), IsModuleEnabled('appointments')]
        if self.action in ['list', 'retrieve', 'available']:
            return base + [HasPermission('view_appointments')]
        return base + [HasAnyPermission(['manage_appointments', 'edit_appointments'])()]
    
    def get_queryset(self):
        return ServiceBay.objects.all()
    
    @action(detail=False, methods=['get'])
    def available(self, request):
        """Get available service bays"""
        bays = self.get_queryset().filter(status='available', is_active=True)
        serializer = self.get_serializer(bays, many=True)
        return Response(serializer.data)


class AppointmentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for appointment operations
    
    Provides comprehensive appointment management including:
    - CRUD operations
    - Calendar views
    - Scheduling and rescheduling
    - Status management
    - Technician assignment
    """
    permission_classes = [IsAuthenticated, IsModuleEnabled('appointments')]
    
    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            # Allow customers to view their own appointments
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated(), IsModuleEnabled('appointments')]
            return [IsAuthenticated(), IsModuleEnabled('appointments'), HasPermission('view_appointments')]
        elif self.action == 'create':
            # Allow customers to book appointments
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated(), IsModuleEnabled('appointments')]
            return [IsAuthenticated(), IsModuleEnabled('appointments'), HasPermission('create_appointments')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), IsModuleEnabled('appointments'), HasPermission('edit_appointments')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), IsModuleEnabled('appointments'), HasPermission('delete_appointments')]
        elif self.action in ['send_customer_sms', 'send_customer_email', 'suggested_message']:
            return [IsAuthenticated(), IsModuleEnabled('appointments'), HasPermission('edit_appointments')]
        elif self.action == 'rate_service':
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated(), IsModuleEnabled('appointments')]
            return [IsAuthenticated(), IsModuleEnabled('appointments'), HasPermission('edit_appointments')]
        elif self.action in ['my_schedule', 'today', 'upcoming']:
            # Technicians with view_own_appointments can see their own schedule/today list
            return [
                IsAuthenticated(),
                IsModuleEnabled('appointments'),
                HasAnyPermission(['view_appointments', 'view_own_appointments'])(),
            ]
        elif self.action == 'technician_schedule':
            return [
                IsAuthenticated(),
                IsModuleEnabled('appointments'),
                HasAnyPermission(['view_appointments', 'view_own_appointments', 'manage_technician_schedules'])(),
            ]
        return action_permission_instances(
            'appointments',
            self.action,
            view_code='view_appointments',
            create_code='create_appointments',
            edit_code='edit_appointments',
            delete_code='delete_appointments',
            customer_actions=frozenset({'list', 'retrieve', 'create'}),
            request=self.request,
        )

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        'status', 'service_type', 'priority', 'appointment_date',
        'customer', 'vehicle', 'service_bay'
    ]
    search_fields = [
        'appointment_number', 'customer__user__first_name',
        'customer__user__last_name', 'customer__company_name',
        'vehicle__vin', 'vehicle__license_plate', 'customer_concerns'
    ]
    ordering_fields = [
        'appointment_date', 'appointment_time', 'priority', 'created_at',
        'appointment_number', 'customer__user__last_name', 'customer__user__first_name',
        'vehicle__license_plate', 'vehicle__vin',
        'service_type', 'status'
    ]
    ordering = ['appointment_date', 'appointment_time']
    
    def get_queryset(self):
        """Get queryset with optimizations and active branch filtering"""
        queryset = Appointment.objects.select_related(
            'customer', 'customer__user', 'vehicle', 'service_bay',
            'confirmed_by', 'created_by', 'branch'
        ).prefetch_related('assigned_technicians').all()
        
        # For customers, filter by their customer profile
        if hasattr(self.request.user, 'role') and self.request.user.role == 'customer':
            from apps.customers.models import Customer
            try:
                customer = Customer.objects.get(user=self.request.user)
                queryset = queryset.filter(customer=customer)
            except Customer.DoesNotExist:
                queryset = queryset.none()
        else:
            # For staff, use branch filtering
            show_all = self.request.query_params.get('all_branches', 'false').lower() == 'true'
            queryset = filter_queryset_for_user_branches(
                queryset, 
                self.request.user, 
                request=self.request, 
                use_active_branch=not show_all
            )

            # Own-schedule users (technicians): only appointments assigned to them
            user = self.request.user
            if (
                user_has_permission(user, 'view_own_appointments')
                and not user_has_permission(user, 'view_appointments')
            ):
                queryset = queryset.filter(assigned_technicians=user).distinct()
        
        # Date range filtering for appointments
        if self.action == 'list':
            date_from = self.request.query_params.get('appointment_date__gte') or self.request.query_params.get('date_from')
            date_to = self.request.query_params.get('appointment_date__lte') or self.request.query_params.get('date_to')
            if date_from:
                queryset = queryset.filter(appointment_date__gte=date_from)
            if date_to:
                queryset = queryset.filter(appointment_date__lte=date_to)
        
        return queryset
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return AppointmentListSerializer
        elif self.action == 'create':
            return AppointmentCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return AppointmentUpdateSerializer
        return AppointmentDetailSerializer
    
    def perform_create(self, serializer):
        """Create appointment with branch assignment and created_by tracking"""
        request = self.request
        branch_id = request.data.get('branch') or request.data.get('branch_id')
        branch = resolve_branch(request, branch_id=branch_id)
        
        # If no branch provided, try to get default branch (for customer portal bookings)
        if branch is None:
            from apps.branches.models import Branch
            # Try to get headquarters branch first
            branch = Branch.objects.filter(is_headquarters=True, is_active=True).first()
            # If no headquarters, get first active branch
            if branch is None:
                branch = Branch.objects.filter(is_active=True).first()
        
        if branch is None:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'A valid branch assignment is required. Please contact support.'})
        
        appointment = serializer.save(branch=branch, created_by=request.user)
        
        # Send notification
        try:
            notification_triggers.appointment_created(appointment)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                "Failed to send appointment creation notification: %s", e, exc_info=True
            )
            
        # Note: Subscription deductions for roadside services are handled in the roadside assistance module
        # Appointments are for scheduled services, not roadside breakdown assistance
    
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirm appointment"""
        appointment = self.get_object()
        
        if appointment.status != 'pending':
            return Response(
                {'error': 'Only pending appointments can be confirmed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        confirmation_method = request.data.get('confirmation_method', 'phone')
        
        appointment.status = 'confirmed'
        appointment.confirmed_by = request.user
        appointment.confirmed_at = timezone.now()
        appointment.confirmation_method = confirmation_method
        appointment.save()
        
        # Send confirmation notification
        try:
            notification_triggers.appointment_confirmed(appointment)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                "Failed to send appointment confirmation notification: %s", e, exc_info=True
            )
        
        serializer = AppointmentDetailSerializer(appointment)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def check_in(self, request, pk=None):
        """Check in customer for appointment"""
        appointment = self.get_object()
        
        if appointment.status not in ['pending', 'confirmed']:
            return Response(
                {'error': 'Appointment cannot be checked in'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        appointment.checked_in = True
        appointment.check_in_time = timezone.now()
        appointment.status = 'in_progress'
        appointment.save()
        
        serializer = AppointmentDetailSerializer(appointment)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark appointment as completed"""
        appointment = self.get_object()
        
        if appointment.status != 'in_progress':
            return Response(
                {'error': 'Only in-progress appointments can be completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        appointment.status = 'completed'
        appointment.save()
        
        # Update vehicle last service date
        vehicle = appointment.vehicle
        vehicle.last_service_date = appointment.appointment_date
        vehicle.save()
        
        # Send vehicle ready notification
        try:
            notification_triggers.vehicle_ready(appointment)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                "Failed to send vehicle ready notification: %s", e, exc_info=True
            )
        
        serializer = AppointmentDetailSerializer(appointment)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def rate_service(self, request, pk=None):
        """Allow customer/staff to submit post-appointment rating."""
        appointment = self.get_object()

        if appointment.status != 'completed':
            return Response(
                {'error': 'Only completed appointments can be rated'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = request.user
        if getattr(user, 'role', None) == 'customer':
            from apps.customers.models import Customer
            try:
                customer = Customer.objects.get(user=user)
            except Customer.DoesNotExist:
                return Response({'error': 'Customer profile not found'}, status=status.HTTP_404_NOT_FOUND)
            if appointment.customer_id != customer.id:
                return Response(
                    {'error': 'You do not have permission to rate this appointment'},
                    status=status.HTTP_403_FORBIDDEN
                )

        rating = request.data.get('rating')
        feedback = request.data.get('customer_feedback') or request.data.get('feedback') or ''
        if rating in (None, ''):
            return Response({'error': 'Rating is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            rating = int(rating)
        except (TypeError, ValueError):
            return Response({'error': 'Rating must be a number from 1 to 5'}, status=status.HTTP_400_BAD_REQUEST)

        if rating < 1 or rating > 5:
            return Response({'error': 'Rating must be between 1 and 5'}, status=status.HTTP_400_BAD_REQUEST)

        appointment.customer_rating = rating
        appointment.customer_feedback = str(feedback).strip()
        appointment.save(update_fields=['customer_rating', 'customer_feedback', 'updated_at'])

        serializer = AppointmentDetailSerializer(appointment)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel appointment"""
        appointment = self.get_object()
        
        if appointment.status in ['completed', 'cancelled']:
            return Response(
                {'error': 'Appointment cannot be cancelled'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        cancellation_reason = request.data.get('reason', '')
        
        appointment.status = 'cancelled'
        appointment.cancellation_reason = cancellation_reason
        appointment.cancelled_at = timezone.now()
        appointment.save()
        
        # Send cancellation notification
        try:
            notification_triggers.appointment_cancelled(appointment, cancellation_reason)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                "Failed to send appointment cancellation notification: %s", e, exc_info=True
            )
        
        serializer = AppointmentDetailSerializer(appointment)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def reschedule(self, request, pk=None):
        """Reschedule appointment to new date/time"""
        appointment = self.get_object()
        
        new_date = request.data.get('appointment_date')
        new_time = request.data.get('appointment_time')
        
        if not new_date or not new_time:
            return Response(
                {'error': 'New date and time are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate new date/time
        try:
            new_date = datetime.strptime(new_date, '%Y-%m-%d').date()
            # Accept both HH:MM and HH:MM:SS formats
            try:
                new_time = datetime.strptime(new_time, '%H:%M:%S').time()
            except ValueError:
                try:
                    new_time = datetime.strptime(new_time, '%H:%M').time()
                except ValueError:
                    return Response(
                        {'error': 'Invalid time format. Use HH:MM or HH:MM:SS'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
        except ValueError:
            return Response(
                {'error': 'Invalid date or time format'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if in past - make datetime timezone-aware for comparison
        new_datetime = datetime.combine(new_date, new_time)
        new_datetime = timezone.make_aware(new_datetime)
        if new_datetime < timezone.now():
            return Response(
                {'error': 'Cannot reschedule to past date/time'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        appointment.appointment_date = new_date
        appointment.appointment_time = new_time
        appointment.status = 'rescheduled'
        
        from django.db import IntegrityError
        try:
            appointment.save()
        except IntegrityError:
            return Response(
                {'error': 'Service bay is already booked for this new time slot'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = AppointmentDetailSerializer(appointment)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def send_reminder(self, request, pk=None):
        """Manually send reminder for appointment"""
        appointment = self.get_object()
        
        reminder_type = request.data.get('reminder_type', 'email')
        
        # Create reminder record
        reminder = AppointmentReminder.objects.create(
            appointment=appointment,
            reminder_type=reminder_type,
            scheduled_send_time=timezone.now(),
            status='scheduled',
        )
        
        # Actually send the reminder via NotificationService
        try:
            from apps.notifications_app.models import Notification
            from apps.notifications_app.services import NotificationService
            
            customer_user = appointment.customer.user if appointment.customer else None
            if not customer_user:
                reminder.status = 'failed'
                reminder.error_message = 'No customer user found'
                reminder.save(update_fields=['status', 'error_message'])
                return Response(
                    {'error': 'Customer user not found'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Build reminder message
            message = (
                f"Reminder: You have an appointment ({appointment.appointment_number}) "
                f"scheduled for {appointment.appointment_date} at {appointment.appointment_time}."
            )
            if appointment.customer_concerns:
                message += f" Service: {appointment.customer_concerns[:100]}"
            
            # Map reminder types to delivery channels.
            channel_map = {
                'email': 'email',
                'sms': 'sms',
                'push': 'push',
                'phone': 'call',
            }
            channel = channel_map.get(reminder_type)
            if not channel:
                reminder.status = 'failed'
                reminder.error_message = f'Invalid reminder type: {reminder_type}'
                reminder.save(update_fields=['status', 'error_message'])
                return Response(
                    {'error': 'Invalid reminder type. Must be email, sms, push, or phone.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            notification = Notification.objects.create(
                recipient=customer_user,
                notification_type='appointment',
                channel=channel,
                priority='normal',
                title=f'Appointment Reminder - {appointment.appointment_number}',
                message=message,
                data={
                    'appointment_id': appointment.id,
                    'appointment_number': appointment.appointment_number,
                    'appointment_date': str(appointment.appointment_date),
                    'appointment_time': str(appointment.appointment_time),
                },
                related_object_type='appointment',
                related_object_id=appointment.id
            )
            success = NotificationService().send_notification(notification)
            
            if success:
                reminder.status = 'sent'
                reminder.sent_at = timezone.now()
                reminder.save(update_fields=['status', 'sent_at'])
                
                # Mark appointment reminder as sent
                appointment.reminder_sent = True
                appointment.reminder_sent_at = timezone.now()
                appointment.save(update_fields=['reminder_sent', 'reminder_sent_at'])
                
                return Response({
                    'message': 'Reminder sent successfully',
                    'reminder_type': reminder_type
                })
            else:
                reminder.status = 'failed'
                reminder.error_message = 'NotificationService returned failure'
                reminder.save(update_fields=['status', 'error_message'])
                return Response(
                    {'error': 'Failed to send reminder. Please check notification logs.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        except Exception as e:
            logger.error(f"Error sending appointment reminder: {e}", exc_info=True)
            reminder.status = 'failed'
            reminder.error_message = str(e)
            reminder.save(update_fields=['status', 'error_message'])
            return Response(
                {'error': f'An error occurred: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def suggested_message(self, request, pk=None):
        """Get a suggested message using the centralized AI service"""
        appointment = self.get_object()
        channel = request.query_params.get('channel', 'email')
        suggestion = AIService.get_suggested_message(appointment, channel=channel, context_type='appointment', user=request.user)
        return Response(suggestion)

    @action(detail=True, methods=['post'])
    def send_customer_sms(self, request, pk=None):
        """Send a custom SMS to the customer"""
        appointment = self.get_object()
        message = request.data.get('message', '').strip()
        if not message:
            return Response({'error': 'Message is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        customer_user = appointment.customer.user if appointment.customer else None
        if not customer_user or not customer_user.phone:
            return Response({'error': 'Customer phone number not available'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            from apps.notifications_app.models import Notification
            from apps.notifications_app.services import NotificationService
            notification = Notification.objects.create(
                recipient=customer_user,
                notification_type='custom',
                channel='sms',
                priority='high',
                message=message,
                data={'appointment_id': appointment.id, 'appointment_number': appointment.appointment_number},
                related_object_type='appointment',
                related_object_id=appointment.id
            )
            success = NotificationService().send_notification(notification)
            if success:
                return Response({'success': True, 'message': 'SMS sent successfully'})
            else:
                return Response({'error': 'Failed to send SMS. Please check notification logs.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Error sending custom SMS: {e}", exc_info=True)
            return Response({'error': f'An error occurred: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def send_customer_email(self, request, pk=None):
        """Send a custom email to the customer"""
        appointment = self.get_object()
        message = request.data.get('message', '').strip()
        subject = request.data.get('subject', f'Update on your Appointment {appointment.appointment_number}').strip()
        
        if not message:
            return Response({'error': 'Message is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        customer_user = appointment.customer.user if appointment.customer else None
        if not customer_user or not customer_user.email:
            return Response({'error': 'Customer email address not available'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            from apps.notifications_app.models import Notification
            from apps.notifications_app.services import NotificationService
            notification = Notification.objects.create(
                recipient=customer_user,
                notification_type='custom',
                channel='email',
                priority='high',
                title=subject,
                message=message,
                data={'appointment_id': appointment.id, 'appointment_number': appointment.appointment_number},
                related_object_type='appointment',
                related_object_id=appointment.id
            )
            success = NotificationService().send_notification(notification)
            if success:
                return Response({'success': True, 'message': 'Email sent successfully'})
            else:
                return Response({'error': 'Failed to send email. Please check notification logs.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Error sending custom email: {e}", exc_info=True)
            return Response({'error': f'An error occurred: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'])
    def calendar(self, request):
        """Get calendar view of appointments"""
        # Get date range
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        
        if not start_date_str or not end_date_str:
            # Default to current week
            today = timezone.now().date()
            start_date = today - timedelta(days=today.weekday())
            end_date = start_date + timedelta(days=6)
        else:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
        
        # Get appointments in range
        appointments = self.get_queryset().filter(
            appointment_date__gte=start_date,
            appointment_date__lte=end_date
        ).exclude(status='cancelled')
        
        # Group by date
        calendar_data = []
        current_date = start_date
        while current_date <= end_date:
            day_appointments = appointments.filter(appointment_date=current_date)
            calendar_data.append({
                'date': current_date,
                'appointments': AppointmentListSerializer(day_appointments, many=True).data,
                'total_appointments': day_appointments.count(),
                'available_slots': max(0, ServiceBay.objects.filter(is_active=True, status='available').count() - day_appointments.count())
            })
            current_date += timedelta(days=1)
        
        return Response(calendar_data)
    
    @action(detail=False, methods=['get'])
    def today(self, request):
        """Get today's appointments"""
        today = timezone.now().date()
        appointments = self.get_queryset().filter(
            appointment_date=today
        ).exclude(status='cancelled')
        
        serializer = AppointmentListSerializer(appointments, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        """Get upcoming appointments"""
        today = timezone.now().date()
        days = int(request.query_params.get('days', 7))
        end_date = today + timedelta(days=days)
        
        appointments = self.get_queryset().filter(
            appointment_date__gte=today,
            appointment_date__lte=end_date,
            status__in=['pending', 'confirmed']
        )
        
        serializer = AppointmentListSerializer(appointments, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """Get overdue appointments (no-shows)"""
        now = timezone.now()
        appointments = self.get_queryset().filter(
            Q(status='pending') | Q(status='confirmed'),
        ).filter(
            Q(appointment_date__lt=now.date()) |
            Q(appointment_date=now.date(), appointment_time__lt=now.time())
        )
        
        serializer = AppointmentListSerializer(appointments, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def available_slots(self, request):
        """Get available time slots for a given date"""
        date_str = request.query_params.get('date')
        if not date_str:
            return Response(
                {'error': 'Date parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            selected_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get business hours from system settings
        from apps.accounts.settings_utils import get_business_settings
        business_settings = get_business_settings()
        
        # Parse business hours based on day of week
        weekday = selected_date.weekday()  # 0 = Monday, 6 = Sunday
        
        if weekday == 5:  # Saturday
            hours_str = business_settings.get('business_hours_saturday', '09:00-15:00')
        elif weekday == 6:  # Sunday
            hours_str = business_settings.get('business_hours_sunday', 'Closed')
        else:  # Weekday
            hours_str = business_settings.get('business_hours_weekday', '08:00-18:00')
        
        # Parse hours string (e.g., "08:00-18:00" or "Closed")
        if hours_str.lower() == 'closed':
            return Response({
                'date': selected_date,
                'slots': [],
                'total_slots': 0,
                'available_slots': 0
            })
        
        try:
            from datetime import time
            start_str, end_str = hours_str.split('-')
            start_time = datetime.strptime(start_str.strip(), '%H:%M').time()
            end_time = datetime.strptime(end_str.strip(), '%H:%M').time()
        except (ValueError, AttributeError):
            # Fallback to defaults if parsing fails
            start_time = time(8, 0)
            end_time = time(17, 0)
        
        # Get booked appointments for the date
        booked = self.get_queryset().filter(
            appointment_date=selected_date,
            status__in=['pending', 'confirmed', 'in_progress']
        ).values_list('appointment_time', flat=True)
        
        # Get appointment buffer for slot duration
        buffer_minutes = int(business_settings.get('appointment_buffer', '15'))
        
        # Generate time slots based on business hours
        all_slots = []
        current = datetime.combine(selected_date, start_time)
        end_datetime = datetime.combine(selected_date, end_time)
        
        while current < end_datetime:
            slot_time = current.time()
            all_slots.append({
                'time': slot_time.strftime('%H:%M'),
                'available': slot_time not in booked
            })
            current += timedelta(minutes=buffer_minutes)
        
        return Response({
            'date': selected_date,
            'slots': all_slots,
            'total_slots': len(all_slots),
            'available_slots': len([s for s in all_slots if s['available']])
        })
    
    @action(detail=False, methods=['get'], url_path='my_schedule')
    def my_schedule(self, request):
        """Get schedule for the authenticated technician."""
        from apps.accounts.permissions import user_has_permission

        if not user_has_permission(request.user, 'view_own_appointments'):
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        date_str = request.query_params.get('date', timezone.now().date().isoformat())
        try:
            selected_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'Invalid date format'}, status=status.HTTP_400_BAD_REQUEST)

        appointments = self.get_queryset().filter(
            assigned_technicians__id=request.user.id,
            appointment_date=selected_date,
        ).exclude(status='cancelled')

        total_minutes = sum(apt.estimated_duration or 0 for apt in appointments)
        return Response({
            'technician_id': request.user.id,
            'technician_name': request.user.get_full_name(),
            'date': selected_date,
            'appointments': AppointmentListSerializer(appointments, many=True).data,
            'total_hours': round(total_minutes / 60, 2),
        })

    @action(detail=False, methods=['get'])
    def technician_schedule(self, request):
        """Get schedule for specific technician"""
        from apps.accounts.permissions import user_has_permission
        from rest_framework.exceptions import PermissionDenied

        technician_id = request.query_params.get('technician_id')
        date_str = request.query_params.get('date', timezone.now().date().isoformat())

        if not technician_id:
            return Response(
                {'error': 'Technician ID is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            tech_id = int(technician_id)
        except (TypeError, ValueError):
            return Response(
                {'error': 'Invalid technician ID'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if tech_id != request.user.id and not user_has_permission(request.user, 'view_appointments'):
            raise PermissionDenied('You can only view your own schedule.')

        if tech_id == request.user.id and not (
            user_has_permission(request.user, 'view_appointments')
            or user_has_permission(request.user, 'view_own_appointments')
        ):
            raise PermissionDenied('You do not have permission to view schedules.')

        try:
            selected_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Invalid date format'},
                status=status.HTTP_400_BAD_REQUEST
            )

        appointments = self.get_queryset().filter(
            assigned_technicians__id=tech_id,
            appointment_date=selected_date
        ).exclude(status='cancelled')

        total_minutes = sum(apt.estimated_duration or 0 for apt in appointments)

        from django.contrib.auth import get_user_model
        User = get_user_model()
        technician = User.objects.get(pk=tech_id)

        return Response({
            'technician_id': tech_id,
            'technician_name': technician.get_full_name(),
            'date': selected_date,
            'appointments': AppointmentListSerializer(appointments, many=True).data,
            'total_hours': round(total_minutes / 60, 2)
        })


class AppointmentReminderViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for appointment reminders (read-only)"""
    serializer_class = AppointmentReminderSerializer
    permission_classes = [IsAuthenticated, IsModuleEnabled('appointments')]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['appointment', 'reminder_type', 'status']
    ordering = ['-scheduled_send_time']

    def get_permissions(self):
        return [
            IsAuthenticated(),
            IsModuleEnabled('appointments'),
            HasPermission('view_appointments'),
        ]
    
    def get_queryset(self):
        return AppointmentReminder.objects.select_related(
            'appointment', 'appointment__customer', 'appointment__customer__user'
        ).all()
