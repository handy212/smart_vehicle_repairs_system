from django.core.mail import send_mail, EmailMultiAlternatives
from django.conf import settings as django_settings
from django.utils import timezone
from decimal import Decimal
import json
from string import Formatter
import logging

from .models import Notification, NotificationLog, WebPushSubscription
from .firebase import send_push_notification, is_firebase_available
from .hubtel_sms import is_hubtel_available
from .whatsapp_service import get_whatsapp_service
from apps.accounts.settings_utils import get_setting, get_email_settings, get_notification_settings, get_whatsapp_settings

try:
    from pywebpush import webpush, WebPushException
    WEBPUSH_AVAILABLE = True
except Exception:
    WEBPUSH_AVAILABLE = False

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
            
            # Check system-level notification settings first
            notification_settings = get_notification_settings()
            
            # Check if channel is globally enabled
            channel_enabled = {
                'email': notification_settings.get('notification_email_enabled', 'true').lower() == 'true',
                'sms': notification_settings.get('notification_sms_enabled', 'true').lower() == 'true',
                'push': notification_settings.get('notification_push_enabled', 'true').lower() == 'true',
                'in_app': notification_settings.get('notification_in_app_enabled', 'true').lower() == 'true',
                'whatsapp': get_whatsapp_settings().get('whatsapp_enabled', 'false').lower() == 'true',
            }.get(notification.channel, True)
            
            if not channel_enabled:
                notification.mark_as_failed(f"Channel {notification.channel} is disabled in system settings")
                self._log_action(notification, 'failed', f'Channel {notification.channel} disabled globally')
                return False
            
            # Check system quiet hours (skip for custom/urgent notifications)
            # Custom notifications from SMS Console should bypass quiet hours
            if notification.notification_type not in ['custom', 'system']:
                quiet_hours_start = notification_settings.get('notification_quiet_hours_start', '22:00')
                quiet_hours_end = notification_settings.get('notification_quiet_hours_end', '08:00')
                
                if quiet_hours_start and quiet_hours_end:
                    from datetime import datetime, time
                    try:
                        start_time = datetime.strptime(quiet_hours_start, '%H:%M').time()
                        end_time = datetime.strptime(quiet_hours_end, '%H:%M').time()
                        current_time = timezone.now().time()
                        
                        # Handle overnight quiet hours (e.g., 22:00 to 08:00)
                        if start_time > end_time:  # Overnight
                            if current_time >= start_time or current_time <= end_time:
                                notification.mark_as_failed("Notification blocked by system quiet hours")
                                self._log_action(notification, 'failed', f'Blocked by quiet hours ({quiet_hours_start}-{quiet_hours_end})')
                                return False
                        else:  # Same day
                            if start_time <= current_time <= end_time:
                                notification.mark_as_failed("Notification blocked by system quiet hours")
                                self._log_action(notification, 'failed', f'Blocked by quiet hours ({quiet_hours_start}-{quiet_hours_end})')
                                return False
                    except (ValueError, AttributeError):
                        pass  # Skip quiet hours check if parsing fails
            
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
            elif notification.channel == 'whatsapp':
                return self._send_whatsapp(notification)
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
        Send email notification with HTML support
        """
        try:
            recipient_email = notification.recipient.email
            
            # Use template if available
            if notification.template and notification.template.subject:
                subject = self._render_template(notification.template.subject, notification.data)
                body = self._render_template(notification.template.body, notification.data)
                html_body = None
                if notification.template.html_body:
                    html_body = self._render_template(notification.template.html_body, notification.data)
            else:
                subject = notification.title
                body = notification.message
                html_body = None
            
            # Get email from address from settings, fallback to Django default
            email_settings = get_email_settings()
            from_email = email_settings.get('email_from_address') or django_settings.DEFAULT_FROM_EMAIL
            from_name = email_settings.get('email_from_name', '')
            if from_name:
                # Format: "Name <email@example.com>"
                from_email = f"{from_name} <{from_email}>"
            
            # Use EmailMultiAlternatives if HTML content exists, otherwise use send_mail
            if html_body:
                email = EmailMultiAlternatives(
                    subject=subject,
                    body=body,
                    from_email=from_email,
                    to=[recipient_email],
                )
                email.attach_alternative(html_body, "text/html")
                email.send()
            else:
                send_mail(
                    subject=subject,
                    message=body,
                    from_email=from_email,
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
            phone_number = None
            
            # 1. Try to get phone from preferences
            if hasattr(notification.recipient, 'notification_preferences'):
                phone_number = notification.recipient.notification_preferences.phone_number
            
            # 2. Fallback to user account phone
            if not phone_number and hasattr(notification.recipient, 'phone'):
                phone_number = notification.recipient.phone
            
            # 3. Validation
            if not phone_number:
                notification.mark_as_failed("No phone number configured (checked prefs and account)")
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
                    phone_number=phone_number,
                    message=message
                )
                
                if success:
                    notification.mark_as_sent()
                    notification.mark_as_delivered()
                    self._log_action(notification, 'sent', f'SMS sent via Hubtel to {phone_number}')
                    logger.info(f"SMS sent via Hubtel to {phone_number}: {response.get('message_id')}")
                    return True
                else:
                    # Hubtel failed, try Twilio fallback
                    logger.warning(f"Hubtel SMS failed: {response}")
            
            # Fallback to Twilio (if configured)
            # TODO: Add Twilio integration
            # For now, if Hubtel is not available/failed and Twilio is not configured, we must FAIL.
            
            error_msg = "No SMS provider available or configured"
            if is_hubtel_available():
                error_msg = "Hubtel SMS failed and no fallback available"
                
            logger.error(f"SMS failed to {phone_number}: {error_msg}")
            notification.mark_as_failed(error_msg)
            self._log_action(notification, 'failed', error_msg)
            return False
            
        except Exception as e:
            logger.error(f"Failed to send SMS: {str(e)}")
            notification.mark_as_failed(str(e))
            self._log_action(notification, 'failed', f'SMS failed: {str(e)}')
            return False
    
    def _send_push(self, notification):
        """
        Send push notification via Web Push or Firebase Cloud Messaging
        """
        try:
            # Try Web Push first (PWA)
            webpush_result = self._send_web_push(notification)
            if webpush_result:
                return True

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
    
    
    def _send_whatsapp(self, notification):
        """
        Send WhatsApp notification
        """
        try:
            # 1. Check if WhatsApp service is available
            whatsapp_service = get_whatsapp_service()
            if not whatsapp_service.is_available():
                notification.mark_as_failed("WhatsApp service not configured")
                self._log_action(notification, 'failed', 'WhatsApp not configured')
                return False
                
            # 2. Get phone number
            phone_number = None
            if hasattr(notification.recipient, 'notification_preferences'):
                phone_number = notification.recipient.notification_preferences.phone_number
            
            if not phone_number and hasattr(notification.recipient, 'phone'):
                phone_number = notification.recipient.phone
                
            if not phone_number:
                notification.mark_as_failed("No phone number configured")
                self._log_action(notification, 'failed', 'No phone number')
                return False
                
            # 3. Determine message type
            # If template is provided, use it (recommended for business initiated)
            # If document URL is in data, send document
            # Otherwise send text
            
            success = False
            result = None
            
            # Check for document
            if notification.notification_type == 'invoice' and notification.data.get('invoice_pdf_url'):
                # Send invoice PDF
                pdf_url = notification.data.get('invoice_pdf_url')
                filename = notification.data.get('filename', 'invoice.pdf')
                caption = notification.message
                
                success, result = whatsapp_service.send_document(
                    to=phone_number,
                    media_url=pdf_url,
                    caption=caption,
                    filename=filename
                )
            
            # Check for template (if configured in notification template)
            elif notification.template and hasattr(notification.template, 'whatsapp_template_name') and notification.template.whatsapp_template_name:
                template_name = notification.template.whatsapp_template_name
                template_vars = notification.template.whatsapp_template_variables
                
                # Build components
                components = []
                body_params = []
                
                if template_vars:
                    for var_name in template_vars:
                        # Find value in notification data or common fields
                        val = notification.data.get(var_name, '')
                        
                        # Fallback to direct attribute lookup if simple string
                        if not val and hasattr(notification, var_name):
                            val = getattr(notification, var_name)
                            
                        # Format if necessary
                        body_params.append({
                            "type": "text",
                            "text": str(val)
                        })
                
                if body_params:
                    components.append({
                        "type": "body",
                        "parameters": body_params
                    })
                    
                success, result = whatsapp_service.send_template_message(
                    to=phone_number,
                    template_name=template_name,
                    components=components
                )
            
            # Default to text message
            else:
                message = notification.message
                success, result = whatsapp_service.send_message(phone_number, message)
            
            if success:
                notification.mark_as_sent()
                notification.mark_as_delivered()
                self._log_action(notification, 'sent', f'WhatsApp sent: {result}')
                logger.info(f"WhatsApp sent to {phone_number}: {result}")
                return True
            else:
                notification.mark_as_failed(str(result))
                self._log_action(notification, 'failed', f'WhatsApp failed: {result}')
                logger.error(f"WhatsApp failed to {phone_number}: {result}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to send WhatsApp: {str(e)}")
            notification.mark_as_failed(str(e))
            self._log_action(notification, 'failed', f'WhatsApp failed: {str(e)}')
            return False

    def _send_web_push(self, notification):
        """
        Send Web Push notifications to all active subscriptions
        """
        if not WEBPUSH_AVAILABLE:
            logger.info("Web Push not available (pywebpush not installed)")
            return False

        try:
            subscriptions = WebPushSubscription.objects.filter(
                user=notification.recipient,
                is_active=True
            )

            if not subscriptions.exists():
                logger.info(f"No web push subscriptions for {notification.recipient.email}")
                return False

            vapid_private_key = getattr(django_settings, 'VAPID_PRIVATE_KEY', None)
            vapid_email = getattr(django_settings, 'VAPID_EMAIL', None) or django_settings.DEFAULT_FROM_EMAIL

            if not vapid_private_key:
                logger.warning("VAPID_PRIVATE_KEY not configured")
                return False

            # Prepare notification content
            if notification.template and notification.template.push_title:
                title = self._render_template(notification.template.push_title, notification.data)
                body = self._render_template(notification.template.push_body, notification.data)
            else:
                title = notification.title
                body = notification.message[:200]

            payload = {
                "title": title,
                "body": body,
                "icon": "/icons/icon-192x192.png",
                "badge": "/icons/icon-72x72.png",
                "data": {
                    "notification_id": str(notification.id),
                    "type": notification.notification_type,
                    "url": notification.data.get("url") if notification.data else None,
                }
            }

            success_count = 0
            for subscription in subscriptions:
                subscription_info = {
                    "endpoint": subscription.endpoint,
                    "keys": {
                        "p256dh": subscription.p256dh,
                        "auth": subscription.auth,
                    },
                }

                try:
                    webpush(
                        subscription_info=subscription_info,
                        data=json.dumps(payload),
                        vapid_private_key=vapid_private_key,
                        vapid_claims={"sub": f"mailto:{vapid_email}"},
                    )
                    subscription.last_used = timezone.now()
                    subscription.save(update_fields=["last_used", "updated_at"])
                    success_count += 1
                except WebPushException as e:
                    status_code = getattr(e.response, "status_code", None)
                    logger.warning(f"Web Push failed for {subscription.endpoint}: {e}")
                    if status_code in (404, 410):
                        subscription.is_active = False
                        subscription.save(update_fields=["is_active", "updated_at"])
                except Exception as e:
                    logger.warning(f"Web Push error for {subscription.endpoint}: {e}")

            if success_count > 0:
                notification.mark_as_sent()
                notification.mark_as_delivered()
                self._log_action(notification, 'sent', f'Web Push sent to {success_count} devices')
                logger.info(f"Web Push notification sent to {success_count} devices")
                return True

            return False
        except Exception as e:
            logger.error(f"Failed to send Web Push: {str(e)}")
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
        Render a template string with context data using Python .format() syntax.
        Supports {variable} syntax (not Django Template {{variable}}).
        
        Handles missing keys gracefully by leaving them as {key} in the output.
        """
        try:
            if not template_string:
                return ""
            
            if not context_data:
                return template_string
            
            # Convert all values to strings for safety, but preserve None as empty string
            safe_context = {}
            for key, value in context_data.items():
                if value is None:
                    safe_context[key] = ""
                elif isinstance(value, (int, float, Decimal)):
                    safe_context[key] = str(value)
                elif isinstance(value, (list, dict)):
                    safe_context[key] = str(value)
                else:
                    safe_context[key] = str(value)
            
            # Use .format() with safe replacement
            # Handle missing keys by using a custom formatter
            from string import Formatter
            
            formatter = Formatter()
            result_parts = []
            last_end = 0
            
            for literal_text, field_name, format_spec, conversion in formatter.parse(template_string):
                # Add literal text
                if literal_text:
                    result_parts.append(literal_text)
                
                # Handle field replacement
                if field_name:
                    if field_name in safe_context:
                        value = safe_context[field_name]
                        # Apply format spec and conversion if any
                        if conversion:
                            value = formatter.convert_field(value, conversion)
                        if format_spec:
                            value = format(value, format_spec)
                        result_parts.append(str(value))
                    else:
                        # Missing key - keep as placeholder
                        result_parts.append(f"{{{field_name}}}")
            
            return ''.join(result_parts)
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
        # Get customer name
        customer_name = appointment.customer.company_name if appointment.customer.company_name else appointment.customer.user.get_full_name()
        
        return Notification.objects.create(
            recipient=recipient,
            notification_type='appointment',
            channel='email',
            priority='high',
            title=f'Appointment Reminder: {appointment.appointment_date}',
            message=f'Reminder: You have an appointment on {appointment.appointment_date} at {appointment.appointment_time}',
            data={
                'appointment_id': appointment.id,
                'customer_name': customer_name,
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
        # Get customer name
        customer_name = work_order.customer.company_name if work_order.customer.company_name else work_order.customer.user.get_full_name()
        
        return Notification.objects.create(
            recipient=recipient,
            notification_type='work_order',
            channel='email',
            priority='normal',
            title=f'Work Order {work_order.work_order_number} Completed',
            message=f'Work order {work_order.work_order_number} has been completed.',
            data={
                'work_order_id': work_order.id,
                'wo_number': work_order.work_order_number,
                'customer_name': customer_name,
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
