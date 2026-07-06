"""Tests for QBO webhook debounced inbound dispatch."""

from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from apps.quickbooks_online.webhook_dispatch import (
    INBOUND_WEBHOOK_HANDLERS,
    normalize_webhook_entity_name,
    queue_inbound_pull_for_entity,
)


@override_settings(
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    },
)
class WebhookDispatchTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_normalize_entity_name(self):
        self.assertEqual(normalize_webhook_entity_name('Credit Memo'), 'credit_memo')
        self.assertEqual(normalize_webhook_entity_name('BillPayment'), 'billpayment')

    def test_unknown_entity_is_ignored(self):
        self.assertFalse(queue_inbound_pull_for_entity('department'))

    @override_settings(QUICKBOOKS_WEBHOOK_DEBOUNCE_SECONDS=30)
    @patch('apps.quickbooks_online.tasks.task_pull_invoices_from_qbo.delay')
    def test_queues_supported_entity(self, mock_delay):
        self.assertTrue(queue_inbound_pull_for_entity('invoice'))
        mock_delay.assert_called_once()

    @override_settings(QUICKBOOKS_WEBHOOK_DEBOUNCE_SECONDS=30)
    @patch('apps.quickbooks_online.tasks.task_pull_invoices_from_qbo.delay')
    def test_debounces_duplicate_entity_within_window(self, mock_delay):
        self.assertTrue(queue_inbound_pull_for_entity('invoice'))
        self.assertFalse(queue_inbound_pull_for_entity('invoice'))
        mock_delay.assert_called_once()

    def test_payment_maps_to_invoice_pull(self):
        self.assertEqual(
            INBOUND_WEBHOOK_HANDLERS.get('payment'),
            'task_pull_invoices_from_qbo',
        )
