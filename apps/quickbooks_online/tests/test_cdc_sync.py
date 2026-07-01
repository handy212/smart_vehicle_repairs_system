"""Tests for QBO CDC safety-net dispatch."""

from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.quickbooks_online.cdc_sync import run_cdc_and_queue_inbound_pulls
from apps.quickbooks_online.models import QBOConfig, QBOSyncLog, QBOToken


class CDCSyncTests(TestCase):
    def setUp(self):
        self.config = QBOConfig.objects.create(
            client_id='id',
            client_secret='secret',
            realm_id='123',
            is_active=True,
        )
        QBOToken.objects.create(
            config=self.config,
            access_token='access',
            refresh_token='refresh',
            expires_at=timezone.now() + timedelta(hours=1),
            refresh_token_expires_at=timezone.now() + timedelta(days=30),
        )

    @override_settings(
        CACHES={
            'default': {
                'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            }
        }
    )
    @patch('apps.quickbooks_online.webhook_dispatch.queue_inbound_pull_for_entity', return_value=True)
    @patch('quickbooks.cdc.change_data_capture')
    @patch('apps.quickbooks_online.cdc_sync._cdc_qbo_classes')
    def test_run_cdc_queues_changed_entities(self, mock_classes, mock_cdc, mock_queue):
        from apps.quickbooks_online.services import QuickBooksService

        mock_classes.return_value = [MagicMock(qbo_object_name='Invoice')]
        invoice_response = MagicMock()
        invoice_response._object_list = [MagicMock()]
        mock_response = MagicMock(spec=['Invoice'])
        mock_response.Invoice = invoice_response
        mock_cdc.return_value = mock_response

        with patch.object(QuickBooksService, 'get_client', return_value=MagicMock()):
            result = run_cdc_and_queue_inbound_pulls(QuickBooksService())

        self.assertIn('invoice', result['queued'])
        mock_queue.assert_called_with('invoice')
        log = QBOSyncLog.objects.latest('started_at')
        self.assertEqual(log.status, 'success')
