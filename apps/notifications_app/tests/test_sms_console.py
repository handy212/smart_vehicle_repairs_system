from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from unittest.mock import patch

User = get_user_model()

class SMSConsoleViewSetTest(TestCase):
    def setUp(self):
        self.client = APIClient()
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
    @patch('apps.accounts.permissions.user_has_permission')
    def test_send_single_manual(self, mock_has_perm, mock_send_sms):
        mock_has_perm.return_value = True
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

    @patch('apps.accounts.permissions.user_has_permission')
    def test_send_single_user(self, mock_has_perm):
        mock_has_perm.return_value = True
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

    @patch('apps.notifications_app.views.send_bulk_sms')
    @patch('apps.accounts.permissions.user_has_permission')
    def test_send_bulk(self, mock_has_perm, mock_send_bulk):
        mock_has_perm.return_value = True
        mock_send_bulk.return_value = {
            '233244000001': {'success': True, 'response': {}}
        }
        
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
            
            # Verify user notification created
            mock_send_notif.assert_called()
            # Verify raw phone sent
            mock_send_bulk.assert_called()

    def test_permissions(self):
        self.client.logout()
        response = self.client.post(self.url_single, {})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch('apps.accounts.permissions.user_has_permission')
    def test_schedule_sms(self, mock_has_perm):
        mock_has_perm.return_value = True
        
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

    @patch('apps.accounts.permissions.user_has_permission')
    def test_history(self, mock_has_perm):
        mock_has_perm.return_value = True
        
        # Create some history
        from apps.notifications_app.models import Notification
        Notification.objects.create(
            recipient=self.recipient,
            notification_type='custom',
            channel='sms',
            message='History 1',
            status='sent'
        )
        
        url_history = '/api/notifications/sms-console/history/'
        response = self.client.get(url_history)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['message'], 'History 1')
