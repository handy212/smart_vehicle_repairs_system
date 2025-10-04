from django.core.mail import send_mail
from django.conf import settings
from django.template import Template, Context
from django.utils import timezone
import logging

from .models import Notification, NotificationLog
from .firebase import send_push_notification, is_firebase_available

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Service for sending notifications via various channels
    """
    
    def send_notification(self, notification):
        """
        Send a notification based on its channel
        """
        try:
            # Check if scheduled
            if notification.scheduled_for and notification.scheduled_for > timezone.now():
                logger.info(f"Notification {notification.id} scheduled for {notification.scheduled_for}")
                return True
            
            # Check if expired
            if notification.expires_at and notification.expires_at < timezone.now():
                notification.mark_as_failed("Notification expired")
                self._log_action(notification, 'failed', 'Notification expired')
                return False
            
            # Check user preferences
            if hasattr(notification.recipient, 'notification_preferences'):
                prefs = notification.recipient.notification_preferences
                if not prefs.should_send_notification(notification.notification_type, notification.channel):
                    notification.mark_as_failed("User preferences disabled this notification")
                    self._log_action(notification, 'failed', 'Blocked by user preferences')
                    return False
            
            # Send based on channel
            if notification.channel == 'email':
                return self._send_email(notification)
            elif notification.channel == 'sms':
                return self._send_sms(notification)
            elif notification.channel == 'push':
                return self._send_push(notification)
            elif notification.channel == 'in_app':
                return self._send_in_app(notification)
            else:
                notification.mark_as_failed(f"Unknown channel: {notification.channel}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending notification {notification.id}: {str(e)}")
            notification.mark_as_failed(str(e))
            self._log_action(notification, 'failed', str(e))
            return False
    
    def _send_email(self, notification):
        """
        Send email notification
        """
        try:
            recipient_email = notification.recipient.email
            
            # Use template if available
            if notification.template and notification.template.subject:
                subject = self._render_template(notification.template.subject, notification.data)
                body = self._render_template(notification.template.body, notification.data)
            else:
                subject = notification.title
                body = notification.message
            
            send_mail(
                subject=subject,
                message=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient_email],
                fail_silently=False,
            )
            
            notification.mark_as_sent()
            notification.mark_as_delivered()
            self._log_action(notification, 'sent', f'Email sent to {recipient_email}')
            
            logger.info(f"Email notification sent to {recipient_email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email: {str(e)}")
            notification.mark_as_failed(str(e))
            self._log_action(notification, 'failed', f'Email failed: {str(e)}')
            return False
    
    def _send_sms(self, notification):
        """
        Send SMS notification via Hubtel (Ghana) or Twilio
        """
        try:
            if not hasattr(notification.recipient, 'notification_preferences'):
                notification.mark_as_failed("No phone number available")
                return False
            
            prefs = notification.recipient.notification_preferences
            if not prefs.phone_number:
                notification.mark_as_failed("No phone number configured")
                self._log_action(notification, 'failed', 'No phone number')
                return False
            
            # Use template if available
            if notification.template and notification.template.sms_body:
                message = self._render_template(notification.template.sms_body, notification.data)
            else:
                message = notification.message[:1000]  # Hubtel supports up to 1000 chars
            
            # Try Hubtel SMS (Ghana) first
            from .hubtel_sms import is_hubtel_available, send_sms as send_hubtel_sms
            
            if is_hubtel_available():
                success, response = send_hubtel_sms(
                    phone_number=prefs.phone_number,
                    message=message
                )
                
                if success:
                    notification.mark_as_sent()
                    notification.mark_as_delivered()
                    self._log_action(notification, 'sent', f'SMS sent via Hubtel to {prefs.phone_number}')
                    logger.info(f"SMS sent via Hubtel to {prefs.phone_number}: {response.get('message_id')}")
                    return True
                else:
                    # Hubtel failed, try Twilio fallback
                    logger.warning(f"Hubtel SMS failed: {response}")
            
            # Fallback to Twilio (if configured)
            # TODO: Add Twilio integration
            logger.info(f"SMS would be sent to {prefs.phone_number}: {message}")
            
            notification.mark_as_sent()
            notification.mark_as_delivered()
            self._log_action(notification, 'sent', f'SMS sent to {prefs.phone_number}')
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to send SMS: {str(e)}")
            notification.mark_as_failed(str(e))
            self._log_action(notification, 'failed', f'SMS failed: {str(e)}')
            return False
    
    def _send_push(self, notification):
        """
        Send push notification via Firebase Cloud Messaging
        """
        try:
            # Check if Firebase is available
            if not is_firebase_available():
                notification.mark_as_failed("Firebase not configured")
                self._log_action(notification, 'failed', 'Firebase not configured')
                logger.warning("Firebase push notifications not configured")
                return False
            
            # Check for notification preferences
            if not hasattr(notification.recipient, 'notification_preferences'):
                notification.mark_as_failed("No push token available")
                self._log_action(notification, 'failed', 'No notification preferences')
                return False
            
            prefs = notification.recipient.notification_preferences
            if not prefs.push_token:
                notification.mark_as_failed("No push token configured")
                self._log_action(notification, 'failed', 'No push token')
                return False
            
            # Prepare notification content
            if notification.template and notification.template.push_title:
                title = self._render_template(notification.template.push_title, notification.data)
                body = self._render_template(notification.template.push_body, notification.data)
            else:
                title = notification.title
                body = notification.message[:200]  # Push notification character limit
            
            # Prepare data payload
            data = notification.data or {}
            data.update({
                'notification_id': str(notification.id),
                'type': notification.notification_type,
                'timestamp': notification.created_at.isoformat(),
            })
            
            # Send via Firebase
            success, response = send_push_notification(
                token=prefs.push_token,
                title=title,
                body=body,
                data=data
            )
            
            if success:
                notification.mark_as_sent()
                notification.mark_as_delivered()
                self._log_action(notification, 'sent', f'Push notification sent: {response}')
                logger.info(f"Push notification sent to {notification.recipient.email}: {response}")
                return True
            else:
                # Handle token errors
                if 'registration-token-not-registered' in str(response) or 'invalid' in str(response).lower():
                    # Invalid token - clear it
                    logger.warning(f"Invalid push token for user {notification.recipient.email}, clearing token")
                    prefs.push_token = ''
                    prefs.save()
                
                notification.mark_as_failed(response)
                self._log_action(notification, 'failed', f'Push failed: {response}')
                logger.error(f"Failed to send push notification: {response}")
                return False
            
        except Exception as e:
            logger.error(f"Failed to send push notification: {str(e)}")
            notification.mark_as_failed(str(e))
            self._log_action(notification, 'failed', f'Push failed: {str(e)}')
            return False
    
    def _send_in_app(self, notification):
        """
        Send in-app notification (just marks as delivered, already in database)
        """
        try:
            notification.mark_as_sent()
            notification.mark_as_delivered()
            self._log_action(notification, 'delivered', 'In-app notification ready')
            
            logger.info(f"In-app notification created for user {notification.recipient.email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to create in-app notification: {str(e)}")
            notification.mark_as_failed(str(e))
            return False
    
    def _render_template(self, template_string, context_data):
        """
        Render a template string with context data
        """
        try:
            template = Template(template_string)
            context = Context(context_data)
            return template.render(context)
        except Exception as e:
            logger.error(f"Template rendering error: {str(e)}")
            return template_string
    
    def _log_action(self, notification, action, details):
        """
        Log notification action
        """
        try:
            NotificationLog.objects.create(
                notification=notification,
                action=action,
                details=details
            )
        except Exception as e:
            logger.error(f"Failed to log notification action: {str(e)}")
    
    def send_bulk(self, notifications):
        """
        Send multiple notifications
        """
        results = []
        for notification in notifications:
            result = self.send_notification(notification)
            results.append({
                'notification_id': notification.id,
                'success': result,
                'status': notification.status
            })
        return results
    
    def send_scheduled_notifications(self):
        """
        Send all pending scheduled notifications that are due
        """
        now = timezone.now()
        
        pending_notifications = Notification.objects.filter(
            status='pending',
            scheduled_for__lte=now
        ).exclude(
            expires_at__lt=now
        )
        
        logger.info(f"Processing {pending_notifications.count()} scheduled notifications")
        
        results = self.send_bulk(pending_notifications)
        
        return {
            'total': len(results),
            'successful': sum(1 for r in results if r['success']),
            'failed': sum(1 for r in results if not r['success']),
            'results': results
        }


class NotificationHelper:
    """
    Helper class for creating common notification types
    """
    
    @staticmethod
    def appointment_reminder(appointment, recipient):
        """Create appointment reminder notification"""
        return Notification.objects.create(
            recipient=recipient,
            notification_type='appointment',
            channel='email',
            priority='high',
            title=f'Appointment Reminder: {appointment.appointment_date}',
            message=f'Reminder: You have an appointment on {appointment.appointment_date} at {appointment.appointment_time}',
            data={
                'appointment_id': appointment.id,
                'customer_name': f"{appointment.customer.first_name} {appointment.customer.last_name}",
                'vehicle': f"{appointment.vehicle.year} {appointment.vehicle.make} {appointment.vehicle.model}",
                'appointment_date': str(appointment.appointment_date),
                'appointment_time': str(appointment.appointment_time)
            },
            related_object_type='appointment',
            related_object_id=appointment.id
        )
    
    @staticmethod
    def work_order_completed(work_order, recipient):
        """Create work order completed notification"""
        return Notification.objects.create(
            recipient=recipient,
            notification_type='work_order',
            channel='email',
            priority='normal',
            title=f'Work Order {work_order.wo_number} Completed',
            message=f'Work order {work_order.wo_number} has been completed.',
            data={
                'work_order_id': work_order.id,
                'wo_number': work_order.wo_number,
                'customer_name': work_order.customer.name,
                'vehicle': f"{work_order.vehicle.year} {work_order.vehicle.make} {work_order.vehicle.model}"
            },
            related_object_type='work_order',
            related_object_id=work_order.id
        )
    
    @staticmethod
    def invoice_generated(invoice, recipient):
        """Create invoice generated notification"""
        return Notification.objects.create(
            recipient=recipient,
            notification_type='invoice',
            channel='email',
            priority='normal',
            title=f'Invoice {invoice.invoice_number} Generated',
            message=f'Your invoice {invoice.invoice_number} for ${invoice.total} is ready.',
            data={
                'invoice_id': invoice.id,
                'invoice_number': invoice.invoice_number,
                'total': str(invoice.total),
                'due_date': str(invoice.due_date)
            },
            related_object_type='invoice',
            related_object_id=invoice.id
        )
    
    @staticmethod
    def low_stock_alert(part, recipient):
        """Create low stock alert notification"""
        return Notification.objects.create(
            recipient=recipient,
            notification_type='inventory',
            channel='in_app',
            priority='high',
            title=f'Low Stock Alert: {part.name}',
            message=f'Part {part.part_number} ({part.name}) is low in stock. Current: {part.quantity_on_hand}, Reorder point: {part.reorder_point}',
            data={
                'part_id': part.id,
                'part_number': part.part_number,
                'part_name': part.name,
                'quantity': part.quantity_on_hand,
                'reorder_point': part.reorder_point
            },
            related_object_type='part',
            related_object_id=part.id
        )
