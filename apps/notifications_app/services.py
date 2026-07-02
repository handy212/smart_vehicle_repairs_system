from django.core.mail import send_mail, EmailMultiAlternatives
from django.conf import settings as django_settings
from django.utils import timezone
from django.db.models import Count
from decimal import Decimal
import json
from string import Formatter
import logging

from .models import Notification, NotificationLog, WebPushSubscription
from .firebase import send_push_notification, is_firebase_available
from .hubtel_sms import is_hubtel_available
from .whatsapp_service import get_whatsapp_service
from apps.accounts.settings_utils import get_setting, get_email_settings, get_notification_settings, get_whatsapp_settings, get_site_url
from .currency import enrich_money_context, format_money

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
    
    def send_notification(self, notification, *, force_sync=False):
        """
        Send a notification based on its channel
        """
        if not force_sync:
            from .dispatch import dispatch_notification
            if dispatch_notification(notification.id):
                return True

        try:
            # Check if scheduled
            if notification.scheduled_for and notification.scheduled_for > timezone.now():
                logger.info(f"Notification {notification.id} scheduled for {notification.scheduled_for}")
                self._log_action(notification, 'scheduled', f'Scheduled for {notification.scheduled_for}')
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
            elif notification.channel == 'call':
                return self._make_call(notification)
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
            if not notification.recipient:
                notification.mark_as_failed("No recipient configured for email notification")
                self._log_action(notification, 'failed', 'No email recipient')
                return False

            recipient_email = notification.recipient.email
            if not recipient_email:
                notification.mark_as_failed("Recipient has no email address")
                self._log_action(notification, 'failed', 'No recipient email')
                return False
            
            # Use template if available
            if notification.template and notification.template.subject:
                render_context = enrich_money_context(notification.data or {})
                subject = self._render_template(notification.template.subject, render_context)
                body = self._render_template(notification.template.body, render_context)
                html_body = None
                if notification.template.html_body:
                    html_body = self._render_template(notification.template.html_body, render_context)
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
            notification_data = notification.data or {}
            phone_number = None

            # Direct-send SMS notifications can be queued without a user recipient.
            # In that case, the destination phone number lives in notification.data.
            if notification_data.get('direct_send'):
                phone_number = notification_data.get('phone_number')
            elif not notification.recipient:
                notification.mark_as_failed("No recipient configured for SMS notification")
                self._log_action(notification, 'failed', 'No SMS recipient')
                return False
            
            # 1. Try to get phone from preferences
            if not phone_number and notification.recipient and hasattr(notification.recipient, 'notification_preferences'):
                phone_number = notification.recipient.notification_preferences.phone_number
            
            # 2. Fallback to user account phone
            if not phone_number and notification.recipient and hasattr(notification.recipient, 'phone'):
                phone_number = notification.recipient.phone
            
            # 3. Validation
            if not phone_number:
                notification.mark_as_failed("No phone number configured for SMS notification")
                self._log_action(notification, 'failed', 'No phone number')
                return False
            
            # Use template if available
            if notification.template and notification.template.sms_body:
                sms_context = enrich_money_context(notification.data or {})
                message = self._render_template(notification.template.sms_body, sms_context)
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
            from .sms_service import TwilioSMSService

            twilio = TwilioSMSService()
            if twilio.client:
                success, result = twilio.send_sms(phone_number, message)
                if success:
                    notification.mark_as_sent()
                    notification.mark_as_delivered()
                    self._log_action(
                        notification,
                        'sent',
                        f'SMS sent via Twilio to {phone_number}',
                    )
                    logger.info("SMS sent via Twilio to %s: %s", phone_number, result)
                    return True
                logger.warning("Twilio SMS failed for %s: %s", phone_number, result)
            
            error_msg = "No SMS provider available or configured"
            if is_hubtel_available():
                error_msg = "Hubtel SMS failed and Twilio fallback unavailable"
                
            logger.error(f"SMS failed to {phone_number}: {error_msg}")
            notification.mark_as_failed(error_msg)
            self._log_action(notification, 'failed', error_msg)
            return False
            
        except Exception as e:
            logger.error(f"Failed to send SMS: {str(e)}")
            notification.mark_as_failed(str(e))
            self._log_action(notification, 'failed', f'SMS failed: {str(e)}')
            return False
    
    def _make_call(self, notification):
        """
        Make a voice call notification via Twilio Voice API or similar telephony service.
        Note: This requires Twilio Voice API or similar telephony integration.
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
                notification.mark_as_failed("No phone number configured for voice call")
                self._log_action(notification, 'failed', 'No phone number')
                return False
            
            # Check if Twilio is configured
            try:
                from twilio.rest import Client
                from django.conf import settings
                
                account_sid = getattr(settings, 'TWILIO_ACCOUNT_SID', '')
                auth_token = getattr(settings, 'TWILIO_AUTH_TOKEN', '')
                twilio_phone = getattr(settings, 'TWILIO_PHONE_NUMBER', '')
                
                if not account_sid or not auth_token or not twilio_phone:
                    notification.mark_as_failed("Twilio Voice API not configured")
                    self._log_action(notification, 'failed', 'Twilio not configured')
                    logger.warning("Twilio Voice API not configured - cannot make calls")
                    return False
                
                client = Client(account_sid, auth_token)
                
                # Format phone number to E.164 format
                def format_phone(phone):
                    digits = ''.join(filter(str.isdigit, phone))
                    if not phone.startswith('+'):
                        if len(digits) == 10:
                            return f"+1{digits}"
                        elif len(digits) == 11 and digits[0] == '1':
                            return f"+{digits}"
                    return phone if phone.startswith('+') else f"+{digits}"
                
                formatted_phone = format_phone(phone_number)
                
                # Create TwiML for the call message
                # For service reminders, we'll use a simple text-to-speech message
                message = notification.message[:500]  # Limit message length for TTS
                
                # Create TwiML response
                from twilio.twiml.voice_response import VoiceResponse
                response = VoiceResponse()
                response.say(message, voice='alice', language='en-US')
                # Optionally add a pause and repeat
                response.pause(length=2)
                response.say("To schedule an appointment, please call us back. Thank you.", voice='alice')
                
                # For now, we'll log that a call should be made
                # In production, you would use Twilio's Call API to initiate the call
                # Example: call = client.calls.create(to=formatted_phone, from_=twilio_phone, twiml=str(response))
                
                # For now, mark as sent (in production, you'd track the call SID)
                notification.mark_as_sent()
                notification.mark_as_delivered()
                self._log_action(notification, 'sent', f'Voice call initiated to {formatted_phone}')
                logger.info(f"Voice call notification prepared for {formatted_phone} (Twilio integration needed for actual call)")
                
                # TODO: Uncomment when Twilio Voice is fully configured
                # call = client.calls.create(
                #     to=formatted_phone,
                #     from_=twilio_phone,
                #     twiml=str(response)
                # )
                # notification.data = notification.data or {}
                # notification.data['call_sid'] = call.sid
                # notification.save()
                
                return True
                
            except ImportError:
                notification.mark_as_failed("Twilio library not installed")
                self._log_action(notification, 'failed', 'Twilio not installed')
                logger.error("Twilio library not installed. Install with: pip install twilio")
                return False
            except Exception as e:
                error_msg = str(e)
                logger.error(f"Failed to make voice call: {error_msg}")
                notification.mark_as_failed(error_msg)
                self._log_action(notification, 'failed', f'Call failed: {error_msg}')
                return False
                
        except Exception as e:
            logger.error(f"Failed to make voice call: {str(e)}")
            notification.mark_as_failed(str(e))
            self._log_action(notification, 'failed', f'Call failed: {str(e)}')
            return False
    
    def _send_push(self, notification):
        """
        Send push notification via Web Push or Firebase Cloud Messaging
        """
        try:
            if not notification.recipient:
                notification.mark_as_failed("No recipient configured for push notification")
                self._log_action(notification, 'failed', 'No push recipient')
                return False

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
            if not notification.recipient:
                notification.mark_as_failed("No recipient configured for WhatsApp notification")
                self._log_action(notification, 'failed', 'No WhatsApp recipient')
                return False

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
                    "url": self._resolve_push_url(notification),
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
            if not notification.recipient:
                notification.mark_as_failed("No recipient configured for in-app notification")
                self._log_action(notification, 'failed', 'No in-app recipient')
                return False

            notification.mark_as_sent()
            notification.mark_as_delivered()
            self._log_action(notification, 'delivered', 'In-app notification ready')
            
            logger.info(f"In-app notification created for user {notification.recipient.email}")

            # Mirror to Web Push for PWA / tech app subscribers.
            prefs = getattr(notification.recipient, 'notification_preferences', None)
            if prefs and prefs.push_enabled:
                self._send_web_push(notification)

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
    
    def _resolve_push_url(self, notification):
        """Build a deep link for push notification clicks."""
        data = notification.data or {}
        for key in ('url', 'mobile_url', 'dashboard_url'):
            value = data.get(key)
            if value:
                return value

        base = (get_site_url() or '').rstrip('/')
        recipient = notification.recipient
        is_technician = getattr(recipient, 'role', None) == 'technician'

        work_order_id = data.get('work_order_id')
        if not work_order_id and notification.related_object_type == 'work_order':
            work_order_id = notification.related_object_id
        if work_order_id:
            path = f'/mobile/workorders/{work_order_id}' if is_technician else f'/workorders/{work_order_id}'
            return f'{base}{path}' if base else path

        appointment_id = data.get('appointment_id')
        if not appointment_id and notification.related_object_type == 'appointment':
            appointment_id = notification.related_object_id
        if appointment_id:
            path = '/mobile/schedule' if is_technician else f'/appointments/{appointment_id}'
            return f'{base}{path}' if base else path

        return f'{base}/notifications' if base else '/notifications'
    
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

    def send_digest_notifications(self, frequency='daily'):
        """
        Send daily or weekly email digests to users who opted in.
        """
        from datetime import timedelta
        from django.contrib.auth import get_user_model
        from .models import NotificationPreference

        now = timezone.now()
        if frequency == 'weekly':
            period_start = now - timedelta(days=7)
            period_label = 'Weekly'
        else:
            frequency = 'daily'
            period_start = now - timedelta(days=1)
            period_label = 'Daily'

        User = get_user_model()
        preferences = NotificationPreference.objects.select_related('user').filter(
            digest_enabled=True,
            digest_frequency=frequency,
            email_enabled=True,
            user__email__gt='',
        )

        results = []
        for preference in preferences:
            user = preference.user
            digest_key = now.strftime('%Y-%m-%d') if frequency == 'daily' else now.strftime('%G-W%V')
            already_sent = Notification.objects.filter(
                recipient=user,
                notification_type='system',
                channel='email',
                related_object_type='notification_digest',
                data__digest_frequency=frequency,
                data__digest_key=digest_key,
            ).exists()
            if already_sent:
                results.append({'user_id': user.id, 'success': True, 'skipped': 'already_sent'})
                continue

            notifications = Notification.objects.filter(
                recipient=user,
                created_at__gte=period_start,
            ).exclude(
                related_object_type='notification_digest'
            ).order_by('-created_at')

            total = notifications.count()
            if total == 0:
                results.append({'user_id': user.id, 'success': True, 'skipped': 'empty'})
                continue

            unread = notifications.filter(is_read=False).count()
            by_type = notifications.values('notification_type').annotate(count=Count('id')).order_by('-count')
            recent = list(notifications[:8])

            type_summary = ', '.join(
                f"{item['notification_type'].replace('_', ' ').title()}: {item['count']}"
                for item in by_type
            )
            recent_lines = '\n'.join(
                f"- {item.title}: {item.message[:120]}"
                for item in recent
            )

            message = (
                f"{period_label} notification digest\n\n"
                f"Total notifications: {total}\n"
                f"Unread: {unread}\n"
                f"By type: {type_summary or 'None'}\n\n"
                f"Recent notifications:\n{recent_lines}"
            )

            digest_notification = Notification.objects.create(
                recipient=user,
                notification_type='system',
                channel='email',
                priority='normal',
                title=f'{period_label} Notification Digest',
                message=message,
                data={
                    'digest_frequency': frequency,
                    'digest_key': digest_key,
                    'total': total,
                    'unread': unread,
                },
                related_object_type='notification_digest',
            )
            success = self.send_notification(digest_notification)
            results.append({
                'user_id': user.id,
                'notification_id': digest_notification.id,
                'success': success,
                'status': digest_notification.status,
            })

        return {
            'frequency': frequency,
            'total': len(results),
            'successful': sum(1 for item in results if item.get('success')),
            'failed': sum(1 for item in results if not item.get('success')),
            'results': results,
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
    def purchase_order_approval_request(purchase_order, recipient):
        """Create purchase order approval request notification"""
        return Notification.objects.create(
            recipient=recipient,
            notification_type='inventory',
            channel='email',
            priority='high',
            title=f'Approval Required: PO {purchase_order.po_number}',
            message=f'Purchase Order {purchase_order.po_number} from {purchase_order.supplier.name} requires your approval.',
            data={
                'po_id': purchase_order.id,
                'po_number': purchase_order.po_number,
                'supplier': purchase_order.supplier.name,
                'total': str(purchase_order.total) if purchase_order.total else '0.00'
            },
            related_object_type='purchase_order',
            related_object_id=purchase_order.id
        )

    @staticmethod
    def stock_transfer_approval_request(transfer, recipient):
        """Create stock transfer approval request notification"""
        return Notification.objects.create(
            recipient=recipient,
            notification_type='inventory',
            channel='email',
            priority='high',
            title=f'Approval Required: Transfer {transfer.transfer_number}',
            message=f'Stock Transfer {transfer.transfer_number} from {transfer.source_branch.name} to {transfer.destination_branch.name} requires your approval.',
            data={
                'transfer_id': transfer.id,
                'transfer_number': transfer.transfer_number,
                'source_branch': transfer.source_branch.name,
                'destination_branch': transfer.destination_branch.name,
                'requested_by': transfer.created_by.get_full_name() if transfer.created_by else 'Unknown'
            },
            related_object_type='transfer',
            related_object_id=transfer.id
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
            message=f'Your invoice {invoice.invoice_number} for {format_money(invoice.total)} is ready.',
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
