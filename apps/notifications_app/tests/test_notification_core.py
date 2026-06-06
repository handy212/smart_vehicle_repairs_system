from datetime import time
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.notifications_app.models import Notification, NotificationPreference
from apps.notifications_app.serializers import (
    NotificationCreateSerializer,
    NotificationListSerializer,
    NotificationPreferenceSerializer,
)
from apps.notifications_app.services import NotificationService


User = get_user_model()


class NotificationCoreTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='notify_user',
            email='notify@example.com',
            password='password123',
            role='customer',
        )

    def test_direct_phone_notifications_serialize_without_recipient(self):
        notification = Notification.objects.create(
            recipient=None,
            notification_type='custom',
            channel='sms',
            priority='normal',
            title='Direct SMS',
            message='Hello',
            data={'phone_number': '0244123456', 'direct_send': True},
        )

        data = NotificationListSerializer(notification).data

        self.assertEqual(data['recipient'], None)
        self.assertEqual(data['recipient_name'], '0244123456')

    @patch('apps.notifications_app.services.get_whatsapp_settings')
    @patch('apps.notifications_app.services.get_notification_settings')
    @patch('apps.notifications_app.hubtel_sms.is_hubtel_available')
    @patch('apps.notifications_app.hubtel_sms.send_sms')
    def test_scheduled_direct_sms_sends_without_user_recipient(
        self,
        mock_send_sms,
        mock_is_hubtel_available,
        mock_get_notification_settings,
        mock_get_whatsapp_settings,
    ):
        mock_is_hubtel_available.return_value = True
        mock_send_sms.return_value = (True, {'message_id': 'abc123'})
        mock_get_notification_settings.return_value = {
            'notification_sms_enabled': 'true',
        }
        mock_get_whatsapp_settings.return_value = {
            'whatsapp_enabled': 'false',
        }

        notification = Notification.objects.create(
            recipient=None,
            notification_type='custom',
            channel='sms',
            priority='normal',
            title='Scheduled Direct SMS',
            message='Hello from the scheduler',
            status='pending',
            scheduled_for=timezone.now() - timedelta(minutes=5),
            data={'phone_number': '0244123456', 'direct_send': True},
        )

        service = NotificationService()
        result = service.send_notification(notification)

        self.assertTrue(result)
        notification.refresh_from_db()
        self.assertEqual(notification.status, 'delivered')
        mock_send_sms.assert_called_once()

    def test_estimate_and_subscription_are_valid_notification_types(self):
        for notification_type in ['estimate', 'subscription']:
            serializer = NotificationCreateSerializer(data={
                'recipient': self.user.id,
                'notification_type': notification_type,
                'channel': 'in_app',
                'priority': 'normal',
                'title': f'{notification_type.title()} Notice',
                'message': 'Test message',
            })

            self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_preferences_serializer_exposes_all_channel_fields(self):
        preferences = NotificationPreference.objects.create(user=self.user)

        data = NotificationPreferenceSerializer(preferences).data

        self.assertIn('sound_enabled', data)
        self.assertIn('whatsapp_manual_enabled', data)
        self.assertIn('whatsapp_enabled', data)
        self.assertIn('roadside_requested_sms', data)

    def test_user_quiet_hours_handles_overnight_ranges(self):
        preferences = NotificationPreference.objects.create(
            user=self.user,
            quiet_hours_enabled=True,
            quiet_hours_start=time(22, 0),
            quiet_hours_end=time(8, 0),
        )

        with patch('apps.notifications_app.models.timezone') as mock_timezone:
            mock_timezone.now.return_value.time.return_value = time(23, 0)
            self.assertFalse(preferences.should_send_notification('invoice', 'email'))

            mock_timezone.now.return_value.time.return_value = time(12, 0)
            self.assertTrue(preferences.should_send_notification('invoice', 'email'))

    @patch('apps.notifications_app.services.send_mail')
    def test_digest_delivery_is_idempotent_per_period(self, mock_send_mail):
        mock_send_mail.return_value = 1
        NotificationPreference.objects.create(
            user=self.user,
            digest_enabled=True,
            digest_frequency='daily',
            email_enabled=True,
        )
        Notification.objects.create(
            recipient=self.user,
            notification_type='invoice',
            channel='in_app',
            priority='normal',
            title='Invoice Ready',
            message='Your invoice is ready.',
        )

        service = NotificationService()
        first = service.send_digest_notifications('daily')
        second = service.send_digest_notifications('daily')

        self.assertEqual(first['total'], 1)
        self.assertEqual(first['successful'], 1)
        self.assertEqual(second['total'], 1)
        self.assertEqual(second['results'][0]['skipped'], 'already_sent')
        self.assertEqual(
            Notification.objects.filter(related_object_type='notification_digest').count(),
            1,
        )
