"""Tests for QBO OAuth token refresh (no duplicate refresh on get_client)."""
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.utils import timezone

from apps.quickbooks_online.models import QBOConfig, QBOToken
from apps.quickbooks_online.services import QuickBooksService


class QBOTokenRefreshTests(TestCase):
    def setUp(self):
        self.config = QBOConfig.objects.create(
            client_id="client-id",
            client_secret="client-secret",
            realm_id="realm-123",
            is_sandbox=True,
            is_active=True,
        )
        self.token = QBOToken.objects.create(
            config=self.config,
            access_token="access-token",
            refresh_token="refresh-token",
            expires_at=timezone.now() + timedelta(hours=1),
            refresh_token_expires_at=timezone.now() + timedelta(days=30),
        )

    @patch("apps.quickbooks_online.services.QuickBooks")
    @patch.object(QuickBooksService, "get_auth_client")
    def test_get_client_does_not_refresh_when_auth_client_seeded(self, mock_get_auth_client, mock_quickbooks):
        auth_client = MagicMock()
        auth_client.access_token = None
        auth_client.refresh_token = None
        mock_get_auth_client.return_value = auth_client

        mock_client = MagicMock()
        mock_quickbooks.return_value = mock_client

        client = QuickBooksService.get_client()

        self.assertIs(client, mock_client)
        self.assertEqual(auth_client.access_token, "access-token")
        self.assertEqual(auth_client.refresh_token, "refresh-token")
        auth_client.refresh.assert_not_called()
        self.assertEqual(mock_client.access_token, "access-token")

    @patch.object(QuickBooksService, "get_auth_client")
    def test_refresh_token_skips_when_another_worker_refreshed(self, mock_get_auth_client):
        auth_client = MagicMock()
        mock_get_auth_client.return_value = auth_client

        self.token.expires_at = timezone.now() + timedelta(minutes=1)
        self.token.save()

        QBOToken.objects.filter(pk=self.token.pk).update(
            expires_at=timezone.now() + timedelta(hours=2),
            access_token="already-refreshed",
            refresh_token="already-refreshed-rt",
        )

        in_memory = QBOToken.objects.get(pk=self.token.pk)
        result = QuickBooksService.refresh_token(self.config, in_memory)

        self.assertTrue(result)
        auth_client.refresh.assert_not_called()
        self.assertEqual(in_memory.access_token, "already-refreshed")
