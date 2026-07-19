"""Infobip SMS integration using the official generated Python client."""
from __future__ import annotations

import logging
from typing import Any, Optional

from django.conf import settings

from apps.accounts.settings_utils import get_sms_settings
from apps.notifications_app.phone_utils import normalize_phone_e164

logger = logging.getLogger(__name__)

TERMINAL_FAILURE_GROUPS = {'UNDELIVERABLE', 'EXPIRED', 'REJECTED'}


def _clean(value: Any) -> str:
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


def get_infobip_config() -> dict[str, str]:
    """Resolve admin-managed credentials before Django/.env fallbacks."""
    sms_settings = get_sms_settings()
    return {
        'base_url': _clean(
            sms_settings.get('infobip_base_url')
            or getattr(settings, 'INFOBIP_BASE_URL', '')
        ).rstrip('/'),
        'api_key': _clean(
            sms_settings.get('infobip_api_key')
            or getattr(settings, 'INFOBIP_API_KEY', '')
        ),
        'sender_id': _clean(
            sms_settings.get('infobip_sender_id')
            or getattr(settings, 'INFOBIP_SENDER_ID', '')
        ),
    }


def is_infobip_available() -> bool:
    config = get_infobip_config()
    return bool(config['base_url'] and config['api_key'] and config['sender_id'])


def _serialize_model(value: Any) -> Any:
    if hasattr(value, 'model_dump'):
        return value.model_dump(mode='json', by_alias=True)
    if hasattr(value, 'to_dict'):
        return value.to_dict()
    return str(value)


def send_sms(
    phone_number: str,
    message: str,
    sender: Optional[str] = None,
    callback_data: str = '',
) -> tuple[bool, dict[str, Any] | str]:
    """Submit one SMS and return normalized Infobip response metadata."""
    config = get_infobip_config()
    if not is_infobip_available():
        return False, 'Infobip SMS is not configured'

    destination = normalize_phone_e164(phone_number)
    if not destination or len(destination) < 7:
        return False, f'Invalid phone number: {phone_number}'
    if not message or not str(message).strip():
        return False, 'Message cannot be empty'

    try:
        from infobip_api_client.api.sms_api import SmsApi
        from infobip_api_client.api_client import ApiClient, Configuration
        from infobip_api_client.exceptions import ApiException
        from infobip_api_client.models import (
            SmsDestination,
            SmsMessage,
            SmsMessageContent,
            SmsMessageDeliveryReporting,
            SmsRequest,
            SmsTextContent,
            SmsWebhooks,
        )
    except ImportError:
        logger.exception('Infobip client is not installed')
        return False, 'Infobip client is not installed'

    try:
        client_config = Configuration(
            host=config['base_url'],
            api_key=config['api_key'],
        )
        sms_message = SmsMessage(
            destinations=[SmsDestination(to=destination)],
            sender=_clean(sender) or config['sender_id'],
            content=SmsMessageContent(
                actual_instance=SmsTextContent(text=str(message))
            ),
        )
        if callback_data:
            sms_message.webhooks = SmsWebhooks(
                delivery=SmsMessageDeliveryReporting(notify=True),
                content_type='application/json',
                callback_data=str(callback_data)[:4000],
            )
        sms_request = SmsRequest(messages=[sms_message])

        with ApiClient(client_config) as api_client:
            response = SmsApi(api_client).send_sms_messages(sms_request=sms_request)

        messages = getattr(response, 'messages', None) or []
        if not messages:
            return False, 'Infobip returned no message result'

        submitted = messages[0]
        status = getattr(submitted, 'status', None)
        raw_status_group = getattr(status, 'group_name', '') or ''
        status_group = str(
            getattr(raw_status_group, 'value', raw_status_group)
        ).upper()
        status_name = str(getattr(status, 'name', '') or '')
        description = str(getattr(status, 'description', '') or '')
        result = {
            'message_id': str(getattr(submitted, 'message_id', '') or ''),
            'bulk_id': str(getattr(response, 'bulk_id', '') or ''),
            'status_group': status_group,
            'status_name': status_name,
            'description': description,
            'raw_response': _serialize_model(response),
        }
        if status_group in TERMINAL_FAILURE_GROUPS:
            return False, description or status_name or status_group
        if not result['message_id']:
            return False, 'Infobip response did not include a message ID'

        logger.info(
            'SMS accepted by Infobip for %s, message ID: %s',
            destination,
            result['message_id'],
        )
        return True, result
    except ApiException as exc:
        body = getattr(exc, 'body', None)
        error = str(body or exc)
        logger.error('Infobip SMS API error: %s', error)
        return False, error
    except Exception as exc:
        logger.exception('Infobip SMS error')
        return False, str(exc)
