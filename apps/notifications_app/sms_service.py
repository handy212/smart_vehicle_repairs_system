"""
SMS Service Integration
Supports Twilio, Hubtel, and mock providers.
"""
from __future__ import annotations

import logging
from typing import List, Optional

from django.conf import settings

from apps.accounts.settings_utils import get_sms_settings
from apps.notifications_app.phone_utils import normalize_phone_e164

logger = logging.getLogger(__name__)

# Twilio message body hard limit (concatenated SMS).
TWILIO_MAX_BODY_LENGTH = 1600


def _clean_credential(value) -> str:
    """Strip placeholders like your-twilio-sid so they are treated as unset."""
    text = str(value or '').strip()
    if not text:
        return ''
    lowered = text.lower()
    if (
        lowered.startswith('your-')
        or lowered.startswith('your_')
        or lowered in {'changeme', 'xxx', 'placeholder', 'todo', 'none', 'null'}
    ):
        return ''
    return text


def get_twilio_config() -> dict:
    """Resolve Twilio credentials from admin SMS settings, then Django/.env."""
    sms_settings = get_sms_settings()
    account_sid = _clean_credential(
        sms_settings.get('twilio_account_sid') or getattr(settings, 'TWILIO_ACCOUNT_SID', '')
    )
    auth_token = _clean_credential(
        sms_settings.get('twilio_auth_token') or getattr(settings, 'TWILIO_AUTH_TOKEN', '')
    )
    phone_number = _clean_credential(
        sms_settings.get('twilio_phone_number') or getattr(settings, 'TWILIO_PHONE_NUMBER', '')
    )
    messaging_service_sid = _clean_credential(
        sms_settings.get('twilio_messaging_service_sid')
        or getattr(settings, 'TWILIO_MESSAGING_SERVICE_SID', '')
    )
    return {
        'account_sid': account_sid,
        'auth_token': auth_token,
        'phone_number': phone_number,
        'messaging_service_sid': messaging_service_sid,
    }


def is_twilio_available() -> bool:
    """True when Twilio can send (credentials + from number or messaging service)."""
    config = get_twilio_config()
    if not config['account_sid'] or not config['auth_token']:
        return False
    return bool(config['phone_number'] or config['messaging_service_sid'])


def format_twilio_e164(phone: str) -> str:
    """Format a phone number for Twilio (E.164 with leading +)."""
    digits = normalize_phone_e164(phone)
    if not digits:
        return ''
    return f'+{digits}'


class SMSService:
    """Base SMS service class"""

    def __init__(self):
        self.name = "Base SMS Service"

    def send_sms(
        self,
        to: str,
        message: str,
        from_number: Optional[str] = None,
    ) -> tuple[bool, str]:
        raise NotImplementedError

    def send_bulk_sms(
        self,
        to: List[str],
        message: str,
        from_number: Optional[str] = None,
    ) -> dict:
        results = {'success': 0, 'failed': 0, 'results': []}

        for number in to:
            success, result = self.send_sms(number, message, from_number)
            if success:
                results['success'] += 1
                results['results'].append({'to': number, 'status': 'success', 'message_id': result})
            else:
                results['failed'] += 1
                results['results'].append({'to': number, 'status': 'failed', 'error': result})

        return results


class TwilioSMSService(SMSService):
    """Twilio SMS service integration"""

    def __init__(self):
        super().__init__()
        self.name = "Twilio"
        self.client = None
        self.from_number = ''
        self.messaging_service_sid = ''

        try:
            from twilio.rest import Client
        except ImportError:
            logger.error("Twilio library not installed. Install with: pip install twilio")
            return

        config = get_twilio_config()
        if not config['account_sid'] or not config['auth_token']:
            logger.warning("Twilio credentials not configured")
            return

        if not config['phone_number'] and not config['messaging_service_sid']:
            logger.warning(
                "Twilio phone number / messaging service SID not configured"
            )
            return

        try:
            self.client = Client(config['account_sid'], config['auth_token'])
            self.from_number = (
                format_twilio_e164(config['phone_number'])
                if config['phone_number']
                else ''
            )
            self.messaging_service_sid = config['messaging_service_sid']
        except Exception as e:
            logger.error("Failed to create Twilio client: %s", e)
            self.client = None

    def send_sms(
        self,
        to: str,
        message: str,
        from_number: Optional[str] = None,
    ) -> tuple[bool, str]:
        if not self.client:
            logger.error("Twilio client not configured")
            return False, "Twilio client not configured"

        if not message or not str(message).strip():
            return False, "Message cannot be empty"

        try:
            to_e164 = format_twilio_e164(to)
            if not to_e164 or len(to_e164) < 8:
                return False, f"Invalid phone number: {to}"

            body = str(message)
            if len(body) > TWILIO_MAX_BODY_LENGTH:
                logger.warning(
                    "Twilio message too long (%s chars), truncating to %s",
                    len(body),
                    TWILIO_MAX_BODY_LENGTH,
                )
                body = body[: TWILIO_MAX_BODY_LENGTH - 3] + "..."

            create_kwargs = {
                'body': body,
                'to': to_e164,
            }

            override_from = format_twilio_e164(from_number) if from_number else ''
            if override_from:
                create_kwargs['from_'] = override_from
            elif self.messaging_service_sid:
                create_kwargs['messaging_service_sid'] = self.messaging_service_sid
            elif self.from_number:
                create_kwargs['from_'] = self.from_number
            else:
                return False, "Twilio phone number not configured"

            message_obj = self.client.messages.create(**create_kwargs)

            logger.info(
                "SMS sent successfully via Twilio to %s, SID: %s",
                to_e164,
                message_obj.sid,
            )
            return True, message_obj.sid
        except Exception as e:
            error_msg = str(e)
            logger.error("Twilio SMS error: %s", error_msg)
            return False, error_msg


class HubtelSMSService(SMSService):
    """Hubtel SMS service integration for Ghana"""

    def __init__(self):
        super().__init__()
        self.name = "Hubtel"
        try:
            from apps.notifications_app.hubtel_sms import send_sms

            self.send_hubtel = send_sms
        except ImportError:
            logger.warning("Hubtel SMS module not found")
            self.send_hubtel = None

    def send_sms(
        self,
        to: str,
        message: str,
        from_number: Optional[str] = None,
    ) -> tuple[bool, str]:
        if not self.send_hubtel:
            return False, "Hubtel module not available"

        success, result = self.send_hubtel(to, message, from_number)

        if success:
            if isinstance(result, dict):
                return True, result.get('message_id', 'sent')
            return True, str(result)
        return False, str(result)


class MockSMSService(SMSService):
    """Mock SMS service for testing/development"""

    def __init__(self):
        super().__init__()
        self.name = "Mock SMS"
        self.sent_messages = []

    def send_sms(
        self,
        to: str,
        message: str,
        from_number: Optional[str] = None,
    ) -> tuple[bool, str]:
        logger.info("[MOCK SMS] To: %s, Message: %s...", to, message[:50])
        self.sent_messages.append({
            'to': to,
            'message': message,
            'from': from_number,
        })
        return True, f"mock_{len(self.sent_messages)}"


def get_sms_service(service_name: str = None) -> SMSService:
    """
    Get SMS service instance.

    Args:
        service_name: 'twilio', 'hubtel', or 'mock'.
                      If None, uses admin sms_provider / SMS_SERVICE setting.
    """
    if not service_name:
        sms_settings = get_sms_settings()
        service_name = sms_settings.get('sms_provider')
        if not service_name:
            service_name = getattr(settings, 'SMS_SERVICE', 'mock')

    service_name = str(service_name).lower().strip()

    if service_name == 'twilio':
        return TwilioSMSService()
    if service_name == 'hubtel':
        return HubtelSMSService()
    return MockSMSService()


def send_notification_sms(
    recipient_phone: str,
    message: str,
    service_name: str = None,
) -> bool:
    """Send a notification SMS. Returns True on success."""
    try:
        sms_service = get_sms_service(service_name)
        success, result = sms_service.send_sms(recipient_phone, message)
        if not success:
            logger.warning("send_notification_sms failed: %s", result)
        return success
    except Exception as e:
        logger.error("Failed to send notification SMS: %s", e)
        return False
