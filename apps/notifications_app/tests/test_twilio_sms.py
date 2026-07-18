"""Twilio SMS formatting, credential handling, and provider routing."""
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.accounts.settings_utils import clear_settings_cache
from apps.notifications_app.models import Notification
from apps.notifications_app.services import NotificationService
from apps.notifications_app.sms_service import (
    TwilioSMSService,
    _clean_credential,
    format_twilio_e164,
    is_twilio_available,
)


class TwilioPhoneFormattingTests(TestCase):
    def test_ghana_local_formats_to_e164(self):
        self.assertEqual(format_twilio_e164('0244123456'), '+233244123456')
        self.assertEqual(format_twilio_e164('244123456'), '+233244123456')
        self.assertEqual(format_twilio_e164('+233244123456'), '+233244123456')
        self.assertEqual(format_twilio_e164('233244123456'), '+233244123456')

    def test_does_not_force_us_country_code_on_ten_digit_ghana_numbers(self):
        # Regression: old Twilio helper treated 10-digit locals as +1XXXXXXXXXX
        self.assertEqual(format_twilio_e164('0548996607'), '+233548996607')
        self.assertNotEqual(format_twilio_e164('0548996607'), '+10548996607')


class TwilioCredentialTests(TestCase):
    def tearDown(self):
        clear_settings_cache()
        super().tearDown()

    def test_placeholder_credentials_are_rejected(self):
        self.assertEqual(_clean_credential('your-twilio-sid'), '')
        self.assertEqual(_clean_credential('your-twilio-token'), '')
        self.assertEqual(_clean_credential('ACrealaccountsid123'), 'ACrealaccountsid123')

    @override_settings(
        TWILIO_ACCOUNT_SID='your-twilio-sid',
        TWILIO_AUTH_TOKEN='your-twilio-token',
        TWILIO_PHONE_NUMBER='+1234567890',
    )
    def test_placeholders_mean_twilio_unavailable(self):
        clear_settings_cache()
        self.assertFalse(is_twilio_available())

    @override_settings(
        TWILIO_ACCOUNT_SID='ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        TWILIO_AUTH_TOKEN='real-auth-token-value',
        TWILIO_PHONE_NUMBER='+233200000000',
    )
    def test_real_credentials_mean_twilio_available(self):
        clear_settings_cache()
        self.assertTrue(is_twilio_available())

    @override_settings(
        TWILIO_ACCOUNT_SID='ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        TWILIO_AUTH_TOKEN='real-auth-token-value',
        TWILIO_PHONE_NUMBER='',
        TWILIO_MESSAGING_SERVICE_SID='MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    )
    def test_messaging_service_sid_counts_as_configured(self):
        clear_settings_cache()
        self.assertTrue(is_twilio_available())


class TwilioSendTests(TestCase):
    def tearDown(self):
        clear_settings_cache()
        super().tearDown()

    @override_settings(
        TWILIO_ACCOUNT_SID='ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        TWILIO_AUTH_TOKEN='real-auth-token-value',
        TWILIO_PHONE_NUMBER='+233200000000',
    )
    @patch('twilio.rest.Client')
    def test_send_sms_uses_ghana_e164_and_returns_sid(self, mock_client_cls):
        clear_settings_cache()
        mock_client = MagicMock()
        mock_client.messages.create.return_value = MagicMock(sid='SM123')
        mock_client_cls.return_value = mock_client

        service = TwilioSMSService()
        success, result = service.send_sms('0244123456', 'Hello from shop')

        self.assertTrue(success)
        self.assertEqual(result, 'SM123')
        mock_client.messages.create.assert_called_once()
        kwargs = mock_client.messages.create.call_args.kwargs
        self.assertEqual(kwargs['to'], '+233244123456')
        self.assertEqual(kwargs['from_'], '+233200000000')
        self.assertEqual(kwargs['body'], 'Hello from shop')


class SmsProviderRoutingTests(TestCase):
    def tearDown(self):
        clear_settings_cache()
        super().tearDown()

    def _make_direct_sms(self):
        return Notification.objects.create(
            recipient=None,
            notification_type='custom',
            channel='sms',
            priority='normal',
            title='Direct SMS',
            message='Hello routing',
            status='pending',
            scheduled_for=timezone.now() - timedelta(minutes=1),
            data={'phone_number': '0244123456', 'direct_send': True},
        )

    @patch('apps.notifications_app.services.get_whatsapp_settings')
    @patch('apps.notifications_app.services.get_notification_settings')
    @patch('apps.accounts.settings_utils.get_sms_settings')
    @patch('apps.notifications_app.hubtel_sms.is_hubtel_available', return_value=False)
    @patch('apps.notifications_app.sms_service.is_twilio_available', return_value=True)
    @patch('apps.notifications_app.sms_service.TwilioSMSService')
    def test_prefers_twilio_when_provider_is_twilio(
        self,
        mock_twilio_cls,
        _mock_twilio_available,
        _mock_hubtel_available,
        mock_get_sms_settings,
        mock_get_notification_settings,
        mock_get_whatsapp_settings,
    ):
        mock_get_sms_settings.return_value = {'sms_provider': 'twilio'}
        mock_get_notification_settings.return_value = {'notification_sms_enabled': 'true'}
        mock_get_whatsapp_settings.return_value = {'whatsapp_enabled': 'false'}

        twilio = MagicMock()
        twilio.send_sms.return_value = (True, 'SM999')
        mock_twilio_cls.return_value = twilio

        notification = self._make_direct_sms()
        result = NotificationService().send_notification(notification)

        self.assertTrue(result)
        twilio.send_sms.assert_called_once()
        notification.refresh_from_db()
        self.assertEqual(notification.status, 'delivered')

    @patch('apps.notifications_app.services.get_whatsapp_settings')
    @patch('apps.notifications_app.services.get_notification_settings')
    @patch('apps.accounts.settings_utils.get_sms_settings')
    @patch('apps.notifications_app.hubtel_sms.send_sms')
    @patch('apps.notifications_app.hubtel_sms.is_hubtel_available', return_value=True)
    @patch('apps.notifications_app.sms_service.is_twilio_available', return_value=True)
    @patch('apps.notifications_app.sms_service.TwilioSMSService')
    def test_falls_back_to_twilio_when_hubtel_fails(
        self,
        mock_twilio_cls,
        _mock_twilio_available,
        _mock_hubtel_available,
        mock_hubtel_send,
        mock_get_sms_settings,
        mock_get_notification_settings,
        mock_get_whatsapp_settings,
    ):
        mock_get_sms_settings.return_value = {'sms_provider': 'hubtel'}
        mock_get_notification_settings.return_value = {'notification_sms_enabled': 'true'}
        mock_get_whatsapp_settings.return_value = {'whatsapp_enabled': 'false'}
        mock_hubtel_send.return_value = (False, 'Hubtel down')

        twilio = MagicMock()
        twilio.send_sms.return_value = (True, 'SM888')
        mock_twilio_cls.return_value = twilio

        notification = self._make_direct_sms()
        result = NotificationService().send_notification(notification)

        self.assertTrue(result)
        mock_hubtel_send.assert_called_once()
        twilio.send_sms.assert_called_once()
        notification.refresh_from_db()
        self.assertEqual(notification.status, 'delivered')
