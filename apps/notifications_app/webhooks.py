"""Public provider webhooks for notification delivery updates."""
from __future__ import annotations

import base64
import hmac
import json
import logging
from typing import Any

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.settings_utils import get_sms_settings

from .models import Notification, NotificationLog

logger = logging.getLogger(__name__)

DELIVERED_GROUPS = {'DELIVERED'}
FAILED_GROUPS = {'UNDELIVERABLE', 'EXPIRED', 'REJECTED'}


def _enum_text(value: Any) -> str:
    raw = getattr(value, 'value', value)
    return str(raw or '').upper()


def _model_value(value: Any, key: str, default: Any = '') -> Any:
    if isinstance(value, dict):
        return value.get(key, default)
    return getattr(value, key, default)


def _serialize(value: Any) -> Any:
    if hasattr(value, 'model_dump'):
        return value.model_dump(mode='json', by_alias=True)
    if hasattr(value, 'to_dict'):
        return value.to_dict()
    if isinstance(value, dict):
        return {key: _serialize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize(item) for item in value]
    if hasattr(value, '__dict__'):
        return {
            key: _serialize(item)
            for key, item in vars(value).items()
            if not key.startswith('_')
        }
    return value


def _basic_credentials(request) -> tuple[str, str] | None:
    authorization = request.headers.get('Authorization', '')
    scheme, _, encoded = authorization.partition(' ')
    if scheme.lower() != 'basic' or not encoded:
        return None
    try:
        decoded = base64.b64decode(encoded, validate=True).decode('utf-8')
    except (ValueError, UnicodeDecodeError):
        return None
    username, separator, password = decoded.partition(':')
    if not separator:
        return None
    return username, password


def _is_authorized(request) -> bool:
    settings = get_sms_settings()
    expected_username = str(settings.get('infobip_webhook_username') or '')
    expected_password = str(settings.get('infobip_webhook_password') or '')
    if not expected_username or not expected_password:
        return False
    supplied = _basic_credentials(request)
    if not supplied:
        return False
    username, password = supplied
    return hmac.compare_digest(username, expected_username) and hmac.compare_digest(
        password,
        expected_password,
    )


def _callback_notification_id(callback_data: Any) -> int | None:
    if callback_data in (None, ''):
        return None
    text = str(callback_data)
    if text.startswith('notification_id:'):
        text = text.partition(':')[2]
    else:
        try:
            decoded = json.loads(text)
            text = str(decoded.get('notification_id', ''))
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    try:
        return int(text)
    except (TypeError, ValueError):
        return None


def _provider_timestamp(result: Any):
    raw = _model_value(result, 'done_at') or _model_value(result, 'sent_at')
    if not raw:
        return timezone.now()
    if hasattr(raw, 'tzinfo'):
        value = raw
    else:
        value = parse_datetime(str(raw))
    if value is None:
        return timezone.now()
    if timezone.is_naive(value):
        return timezone.make_aware(value, timezone.get_current_timezone())
    return value


@method_decorator(csrf_exempt, name='dispatch')
class InfobipDeliveryReportWebhook(APIView):
    """Receive authenticated Infobip SMS delivery reports."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        if not _is_authorized(request):
            return Response(
                {'detail': 'Invalid delivery webhook credentials'},
                status=401,
                headers={'WWW-Authenticate': 'Basic realm="Infobip delivery reports"'},
            )

        payload = request.data
        if not isinstance(payload, dict) or not isinstance(payload.get('results'), list):
            return Response({'detail': 'Invalid delivery report payload'}, status=400)

        try:
            from infobip_api_client.models import SmsDeliveryResult

            parsed = SmsDeliveryResult(results=payload['results'])
            results = parsed.results
        except ImportError:
            return Response({'detail': 'Infobip client is not installed'}, status=503)
        except Exception as exc:
            logger.warning('Invalid Infobip delivery report: %s', exc)
            return Response({'detail': 'Invalid delivery report payload'}, status=400)

        processed = 0
        ignored = 0
        for result in results:
            message_id = str(_model_value(result, 'message_id') or '')
            status_data = _model_value(result, 'status', {}) or {}
            group_name = _enum_text(_model_value(status_data, 'group_name'))
            status_name = str(_model_value(status_data, 'name') or group_name)
            description = str(_model_value(status_data, 'description') or '')
            callback_data = _model_value(result, 'callback_data')

            callback_id = _callback_notification_id(callback_data)

            with transaction.atomic():
                notification = None
                if message_id:
                    notification = Notification.objects.select_for_update().filter(
                        provider='infobip',
                        provider_message_id=message_id,
                    ).first()
                if not notification and callback_id:
                    notification = Notification.objects.select_for_update().filter(
                        id=callback_id,
                        provider='infobip',
                    ).first()
                if not notification:
                    ignored += 1
                    logger.info(
                        'Ignoring Infobip report for unknown message ID %s',
                        message_id,
                    )
                    continue

                if (
                    notification.provider_status == status_name
                    or notification.provider_status == group_name
                ):
                    ignored += 1
                    continue

                # A late or intermediate callback must never downgrade a completed item.
                if notification.status in {'delivered', 'read'} and group_name != 'DELIVERED':
                    ignored += 1
                    continue
                if (
                    notification.status == 'failed'
                    and group_name not in DELIVERED_GROUPS | FAILED_GROUPS
                ):
                    ignored += 1
                    continue

                provider_time = _provider_timestamp(result)
                notification.provider_status = status_name or group_name
                notification.provider_status_updated_at = provider_time
                update_fields = [
                    'provider_status',
                    'provider_status_updated_at',
                    'updated_at',
                ]
                action = 'sent'

                if group_name in DELIVERED_GROUPS:
                    notification.status = 'delivered'
                    notification.delivered_at = provider_time
                    notification.error_message = ''
                    update_fields.extend(['status', 'delivered_at', 'error_message'])
                    action = 'delivered'
                elif group_name in FAILED_GROUPS:
                    notification.status = 'failed'
                    notification.failed_at = provider_time
                    notification.error_message = (
                        description or status_name or group_name
                    )
                    update_fields.extend([
                        'status',
                        'failed_at',
                        'error_message',
                    ])
                    action = 'failed'

                notification.save(update_fields=update_fields)
                NotificationLog.objects.create(
                    notification=notification,
                    action=action,
                    details=(
                        f'Infobip status {status_name or group_name}'
                        + (f': {description}' if description else '')
                    ),
                    metadata={
                        'provider': 'infobip',
                        'message_id': message_id,
                        'group_name': group_name,
                        'status_name': status_name,
                        'callback_data': callback_data,
                        'raw_report': _serialize(result),
                    },
                )
                processed += 1

        return Response({'processed': processed, 'ignored': ignored})
