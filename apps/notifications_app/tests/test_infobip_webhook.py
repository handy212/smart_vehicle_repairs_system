"""Authenticated Infobip delivery-report webhook tests."""
import base64
from unittest.mock import patch

from rest_framework.test import APITestCase

from apps.notifications_app.models import Notification, NotificationLog


class InfobipDeliveryWebhookTests(APITestCase):
    url = '/api/notifications/webhooks/infobip/delivery-report/'

    def setUp(self):
        super().setUp()
        token = base64.b64encode(b'infobip-user:strong-password').decode()
        self.authorization = f'Basic {token}'
        self.notification = Notification.objects.create(
            recipient=None,
            notification_type='custom',
            channel='sms',
            title='Direct SMS',
            message='Hello',
            status='sent',
            provider='infobip',
            provider_message_id='message-123',
            provider_status='PENDING_ACCEPTED',
            data={'phone_number': '233244123456', 'direct_send': True},
        )

    def _post(self, result, authorized=True):
        headers = {}
        if authorized:
            headers['HTTP_AUTHORIZATION'] = self.authorization
        with patch(
            'apps.notifications_app.webhooks.get_sms_settings',
            return_value={
                'infobip_webhook_username': 'infobip-user',
                'infobip_webhook_password': 'strong-password',
            },
        ):
            return self.client.post(
                self.url,
                {'results': [result]},
                format='json',
                **headers,
            )

    def test_rejects_missing_basic_auth(self):
        response = self._post({}, authorized=False)
        self.assertEqual(response.status_code, 401)

    def test_delivered_report_updates_notification_and_logs_event(self):
        response = self._post({
            'messageId': 'message-123',
            'doneAt': '2026-07-19T10:00:00.000+0000',
            'status': {
                'groupId': 3,
                'groupName': 'DELIVERED',
                'id': 5,
                'name': 'DELIVERED_TO_HANDSET',
                'description': 'Message delivered',
            },
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['processed'], 1)
        self.notification.refresh_from_db()
        self.assertEqual(self.notification.status, 'delivered')
        self.assertEqual(self.notification.provider_status, 'DELIVERED_TO_HANDSET')
        self.assertTrue(NotificationLog.objects.filter(
            notification=self.notification,
            action='delivered',
        ).exists())

    def test_failed_report_updates_error(self):
        response = self._post({
            'messageId': 'message-123',
            'status': {
                'groupId': 4,
                'groupName': 'UNDELIVERABLE',
                'id': 50,
                'name': 'UNDELIVERABLE_REJECTED_OPERATOR',
                'description': 'Rejected by operator',
            },
        })

        self.assertEqual(response.status_code, 200)
        self.notification.refresh_from_db()
        self.assertEqual(self.notification.status, 'failed')
        self.assertEqual(self.notification.error_message, 'Rejected by operator')

    def test_duplicate_and_late_reports_do_not_downgrade_delivery(self):
        self.notification.status = 'delivered'
        self.notification.provider_status = 'DELIVERED_TO_HANDSET'
        self.notification.save(update_fields=['status', 'provider_status', 'updated_at'])

        response = self._post({
            'messageId': 'message-123',
            'status': {
                'groupId': 1,
                'groupName': 'PENDING',
                'id': 26,
                'name': 'PENDING_ENROUTE',
                'description': 'In transit',
            },
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['ignored'], 1)
        self.notification.refresh_from_db()
        self.assertEqual(self.notification.status, 'delivered')
        self.assertEqual(self.notification.provider_status, 'DELIVERED_TO_HANDSET')

    def test_unknown_message_id_is_acknowledged(self):
        response = self._post({
            'messageId': 'unknown-message',
            'status': {
                'groupId': 3,
                'groupName': 'DELIVERED',
                'id': 5,
                'name': 'DELIVERED_TO_HANDSET',
            },
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'processed': 0, 'ignored': 1})

    def test_callback_data_correlates_when_message_id_does_not_match(self):
        response = self._post({
            'messageId': 'unexpected-message-id',
            'callbackData': f'notification_id:{self.notification.id}',
            'status': {
                'groupId': 3,
                'groupName': 'DELIVERED',
                'id': 5,
                'name': 'DELIVERED_TO_HANDSET',
            },
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['processed'], 1)
        self.notification.refresh_from_db()
        self.assertEqual(self.notification.status, 'delivered')
