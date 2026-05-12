from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from unittest.mock import patch
from apps.accounts.admin_models import SystemModule
from apps.accounts.permission_models import Permission, Role

User = get_user_model()

class SMSConsoleViewSetTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        SystemModule.objects.update_or_create(
            slug='sms',
            defaults={'name': 'SMS', 'is_enabled': True}
        )
        send_notifications = Permission.objects.create(
            code='send_notifications',
            name='Send Notifications',
            category='notifications',
        )
        manager_role = Role.objects.create(
            code='manager',
            name='Manager',
            is_active=True,
        )
        manager_role.permissions.add(send_notifications)
        self.user = User.objects.create_user(
            username='staff_user',
            email='staff@example.com',
            password='password123',
            role='manager'
        )
        self.client.force_authenticate(user=self.user)
        self.url_single = '/api/notifications/sms-console/send_single/'
        self.url_bulk = '/api/notifications/sms-console/send_bulk/'
        
        # Create a recipient user
        self.recipient = User.objects.create_user(
            username='customer',
            email='customer@example.com',
            password='password123',
            role='customer',
            phone='233244123456'
        )

    @patch('apps.notifications_app.views.send_sms')
    def test_send_single_manual(self, mock_send_sms):
        mock_send_sms.return_value = (True, {'message_id': '123'})
        
        data = {
            'phone': '0244123456',
            'message': 'Test Message'
        }
        
        response = self.client.post(self.url_single, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Assuming formatted phone is passed to mock
        mock_send_sms.assert_called() 
        self.assertEqual(response.data['status'], 'success')

    def test_send_single_user(self):
        # This will create a pending notification instead of immediate send if Hubtel not configured,
        # but the ViewSet logic will try to send via service.
        # We should patch NotificationService.send_notification to avoid actual calls.
        with patch('apps.notifications_app.services.NotificationService.send_notification') as mock_send_notification:
            mock_send_notification.return_value = True
            
            data = {
                'recipient_id': self.recipient.id,
                'message': 'Test Message User'
            }
            
            response = self.client.post(self.url_single, data)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data['status'], 'success')
            mock_send_notification.assert_called()

    @patch('apps.notifications_app.tasks.send_bulk_sms_async')
    def test_send_bulk(self, mock_send_bulk_async):
        mock_send_bulk_async.delay.return_value = None
        
        with patch('apps.notifications_app.services.NotificationService.send_notification') as mock_send_notif:
            mock_send_notif.return_value = True
            
            data = {
                'message': 'Bulk Message',
                'recipients': [
                    {'type': 'user', 'value': self.recipient.id},
                    {'type': 'phone', 'value': '0244000001'}
                ]
            }
            
            response = self.client.post(self.url_bulk, data, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data['successful'], 2)
            
            # Bulk sends are queued for async processing.
            mock_send_notif.assert_not_called()
            mock_send_bulk_async.delay.assert_called_once_with(
                data['recipients'],
                data['message'],
                None,
            )

    def test_permissions(self):
        self.client.logout()
        response = self.client.post(self.url_single, {})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch('apps.notifications_app.hubtel_sms.requests.get')
    @patch('apps.notifications_app.hubtel_sms.is_hubtel_available')
    def test_hubtel_balance_is_unsupported_without_http_call(self, mock_available, mock_get):
        mock_available.return_value = True

        from apps.notifications_app.hubtel_sms import get_sms_balance

        balance = get_sms_balance()

        self.assertFalse(balance['success'])
        self.assertFalse(balance['supported'])
        self.assertIn('not supported', balance['error'])
        mock_get.assert_not_called()

    def test_schedule_sms(self):
        # Scheduling works best with User recipients as it uses Notification model
        scheduled_time = '2026-12-25T10:00:00Z'
        data = {
            'recipient_id': self.recipient.id,
            'message': 'Scheduled Message',
            'scheduled_for': scheduled_time
        }
        
        with patch('apps.notifications_app.services.NotificationService.send_notification') as mock_send:
            # Service should return True (even if it just queues)
            mock_send.return_value = True
            
            response = self.client.post(self.url_single, data)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertIn('scheduled', response.data['message'])
            
            # Verify Notification created with correct time
            from apps.notifications_app.models import Notification
            notif = Notification.objects.get(id=response.data['notification_id'])
            self.assertEqual(notif.status, 'pending')
            self.assertIsNotNone(notif.scheduled_for)

    def test_history(self):
        # Create some history
        from apps.notifications_app.models import Notification
        Notification.objects.create(
            recipient=self.recipient,
            notification_type='custom',
            channel='sms',
            title='History SMS',
            message='History 1',
            status='sent'
        )
        
        url_history = '/api/notifications/sms-console/history/'
        response = self.client.get(url_history)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['message'], 'History 1')
