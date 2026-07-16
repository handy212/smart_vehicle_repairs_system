
import os
import django
from django.conf import settings

# Configure Django settings if not already configured
if not settings.configured:
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()

import pytest
from unittest.mock import patch, MagicMock
from django.test import SimpleTestCase
from apps.notifications_app.whatsapp_service import WhatsAppService, get_whatsapp_service
from apps.notifications_app.services import NotificationService
from apps.notifications_app.models import NotificationPreference
from apps.accounts.settings_utils import get_whatsapp_settings

class TestWhatsAppService(SimpleTestCase):
    def setUp(self):
        self.patcher = patch('apps.notifications_app.whatsapp_service.get_whatsapp_settings')
        self.mock_settings = self.patcher.start()
        self.mock_settings.return_value = {
            'whatsapp_enabled': 'true',
            'whatsapp_access_token': 'test_token',
            'whatsapp_phone_number_id': '123456789',
            'whatsapp_business_account_id': '987654321',
            'whatsapp_api_version': 'v17.0'
        }
        self.service = WhatsAppService()
        
    def tearDown(self):
        self.patcher.stop()
        
    def test_is_available(self):
        self.assertTrue(self.service.is_available())
        
        self.mock_settings.return_value['whatsapp_enabled'] = 'false'
        self.service._load_config()
        self.assertFalse(self.service.is_available())

    def test_format_ghana_phone_numbers_for_meta(self):
        self.assertEqual(self.service._format_phone_number('0548996607'), '233548996607')
        self.assertEqual(self.service._format_phone_number('+233548996607'), '233548996607')
        self.assertEqual(self.service._format_phone_number('548996607'), '233548996607')
        
    @patch('requests.post')
    def test_send_message_success(self, mock_post):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.json.return_value = {
            'messages': [{'id': 'wamid.123456'}]
        }
        mock_post.return_value = mock_response
        
        success, result = self.service.send_message('1234567890', 'Hello World')
        
        self.assertTrue(success)
        self.assertEqual(result, 'wamid.123456')
        
        payload = mock_post.call_args[1]['json']
        self.assertEqual(payload['to'], '1234567890')
        self.assertEqual(payload['type'], 'text')
        self.assertEqual(payload['text']['body'], 'Hello World')
        
    @patch('requests.post')
    def test_send_document_success(self, mock_post):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.json.return_value = {
            'messages': [{'id': 'wamid.doc.123'}]
        }
        mock_post.return_value = mock_response
        
        success, result = self.service.send_document(
            '1234567890', 
            'https://example.com/invoice.pdf',
            'Your Invoice',
            'invoice.pdf'
        )
        
        self.assertTrue(success)
        self.assertEqual(result, 'wamid.doc.123')
        
        payload = mock_post.call_args[1]['json']
        self.assertEqual(payload['type'], 'document')
        self.assertEqual(payload['document']['link'], 'https://example.com/invoice.pdf')
        self.assertEqual(payload['document']['caption'], 'Your Invoice')
        
class TestNotificationServiceWhatsApp(SimpleTestCase):
    def setUp(self):
        self.service = NotificationService()
        # Mock _log_action to avoid DB access
        self.service._log_action = MagicMock()
        
    @patch('apps.notifications_app.services.get_whatsapp_service')
    def test_send_whatsapp_notification(self, mock_get_service):
        # Mock WhatsApp service
        mock_wa_service = MagicMock()
        mock_wa_service.is_available.return_value = True
        mock_wa_service.send_message.return_value = (True, 'wamid.test')
        mock_get_service.return_value = mock_wa_service
        
        # Mock Notification
        notification = MagicMock()
        notification.channel = 'whatsapp'
        notification.notification_type = 'system'
        notification.message = 'Test Message'
        
        # Mock Recipient
        recipient = MagicMock()
        pref = MagicMock()
        pref.phone_number = '1234567890'
        recipient.notification_preferences = pref
        notification.recipient = recipient
        notification.template = None
        
        # Test
        result = self.service._send_whatsapp(notification)
        
        self.assertTrue(result)
        mock_wa_service.send_message.assert_called_with('1234567890', 'Test Message', preview_url=True)
        notification.mark_as_sent.assert_called()
        
    @patch('apps.notifications_app.services.get_whatsapp_service')
    def test_send_whatsapp_invoice_document(self, mock_get_service):
        # Mock WhatsApp service
        mock_wa_service = MagicMock()
        mock_wa_service.is_available.return_value = True
        mock_wa_service.send_document.return_value = (True, 'wamid.doc')
        mock_get_service.return_value = mock_wa_service
        
        # Mock Notification
        notification = MagicMock()
        notification.channel = 'whatsapp'
        notification.notification_type = 'invoice'
        notification.message = 'Invoice Ready'
        notification.template = None
        notification.data = {
            'invoice_pdf_url': 'http://test.com/inv.pdf',
            'filename': 'inv.pdf'
        }
        
        # Mock Recipient
        recipient = MagicMock()
        pref = MagicMock()
        pref.phone_number = '1234567890'
        recipient.notification_preferences = pref
        notification.recipient = recipient
        
        # Test
        result = self.service._send_whatsapp(notification)
        
        self.assertTrue(result)
        mock_wa_service.send_document.assert_called_with(
            to='1234567890',
            media_url='http://test.com/inv.pdf',
            caption='Invoice Ready',
            filename='inv.pdf'
        )
