"""Infobip configuration, adapter, and provider routing tests."""
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase, override_settings

from apps.accounts.settings_utils import clear_settings_cache
from apps.notifications_app.infobip_sms import (
    get_infobip_config,
    is_infobip_available,
    send_sms,
)
from apps.notifications_app.models import Notification
from apps.notifications_app.services import NotificationService
from apps.notifications_app.sms_service import InfobipSMSService


class InfobipConfigurationTests(TestCase):
    def tearDown(self):
        clear_settings_cache()
        super().tearDown()

    @override_settings(
        INFOBIP_BASE_URL='https://example.api.infobip.com',
        INFOBIP_API_KEY='real-api-key',
        INFOBIP_SENDER_ID='RepairShop',
    )
    def test_environment_credentials_make_infobip_available(self):
        clear_settings_cache()

        config = get_infobip_config()

        self.assertTrue(is_infobip_available())
        self.assertEqual(config['base_url'], 'https://example.api.infobip.com')
        self.assertEqual(config['sender_id'], 'RepairShop')

    @override_settings(
        INFOBIP_BASE_URL='https://example.api.infobip.com',
        INFOBIP_API_KEY='your-api-key',
        INFOBIP_SENDER_ID='RepairShop',
    )
    def test_placeholder_api_key_is_not_available(self):
        clear_settings_cache()
        self.assertFalse(is_infobip_available())


class InfobipServiceTests(TestCase):
    @override_settings(
        INFOBIP_BASE_URL='https://example.api.infobip.com',
        INFOBIP_API_KEY='real-api-key',
        INFOBIP_SENDER_ID='RepairShop',
    )
    @patch('infobip_api_client.api.sms_api.SmsApi')
    def test_sdk_request_uses_normalized_destination_and_sender(
        self,
        mock_sms_api,
    ):
        clear_settings_cache()
        mock_sms_api.return_value.send_sms_messages.return_value = SimpleNamespace(
            bulk_id='bulk-1',
            messages=[
                SimpleNamespace(
                    message_id='message-1',
                    status=SimpleNamespace(
                        group_name='PENDING',
                        name='PENDING_ACCEPTED',
                        description='Message accepted',
                    ),
                )
            ],
        )

        success, result = send_sms(
            '0244123456',
            'Hello from the shop',
            callback_data='notification_id:42',
        )

        self.assertTrue(success)
        self.assertEqual(result['message_id'], 'message-1')
        request = mock_sms_api.return_value.send_sms_messages.call_args.kwargs[
            'sms_request'
        ]
        self.assertEqual(request.messages[0].sender, 'RepairShop')
        self.assertEqual(request.messages[0].destinations[0].to, '233244123456')
        self.assertTrue(request.messages[0].webhooks.delivery.notify)
        self.assertEqual(
            request.messages[0].webhooks.callback_data,
            'notification_id:42',
        )

    @patch('apps.notifications_app.infobip_sms.send_sms')
    def test_service_returns_message_id_and_retains_response(self, mock_send):
        mock_send.return_value = (
            True,
            {
                'message_id': 'infobip-message-1',
                'status_group': 'PENDING',
                'status_name': 'PENDING_ACCEPTED',
            },
        )

        service = InfobipSMSService()
        success, message_id = service.send_sms('0244123456', 'Hello')

        self.assertTrue(success)
        self.assertEqual(message_id, 'infobip-message-1')
        self.assertEqual(service.last_response['status_group'], 'PENDING')
        self.assertTrue(service.supports_delivery_reports)

    @patch('apps.notifications_app.services.get_notification_settings')
    @patch('apps.notifications_app.sms_service.get_ordered_sms_services')
    def test_infobip_acceptance_stays_sent_until_delivery_report(
        self,
        mock_services,
        mock_notification_settings,
    ):
        mock_notification_settings.return_value = {
            'notification_sms_enabled': 'true',
        }
        service = InfobipSMSService()
        service.send_sms = lambda _to, _message: (True, 'infobip-message-2')
        service.last_response = {
            'message_id': 'infobip-message-2',
            'status_name': 'PENDING_ACCEPTED',
        }
        mock_services.return_value = [service]
        notification = Notification.objects.create(
            recipient=None,
            notification_type='custom',
            channel='sms',
            title='Direct SMS',
            message='Hello',
            data={'phone_number': '0244123456', 'direct_send': True},
        )

        success = NotificationService().send_notification(
            notification,
            force_sync=True,
        )

        self.assertTrue(success)
        notification.refresh_from_db()
        self.assertEqual(notification.status, 'sent')
        self.assertEqual(notification.provider, 'infobip')
        self.assertEqual(notification.provider_message_id, 'infobip-message-2')
        self.assertEqual(notification.provider_status, 'PENDING_ACCEPTED')
