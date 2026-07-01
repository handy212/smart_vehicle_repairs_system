"""Tests for QBO company name persistence."""

from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.utils import timezone
from datetime import timedelta

from apps.quickbooks_online.models import QBOConfig, QBOToken
from apps.quickbooks_online.services import QuickBooksService


class CompanyNameTests(TestCase):
    def setUp(self):
        self.config = QBOConfig.objects.create(
            client_id='test-id',
            client_secret='test-secret',
            realm_id='1234567890',
            is_active=True,
        )
        QBOToken.objects.create(
            config=self.config,
            access_token='access',
            refresh_token='refresh',
            expires_at=timezone.now() + timedelta(hours=1),
            refresh_token_expires_at=timezone.now() + timedelta(days=30),
        )

    @patch.object(QuickBooksService, 'get_client')
    def test_fetch_and_store_company_name_persists_name(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        mock_info = MagicMock()
        mock_info.CompanyName = 'Acme Auto Repairs'
        mock_info.LegalName = ''

        with patch('apps.quickbooks_online.services.QBCompanyInfo') as mock_company_info:
            mock_company_info.get.return_value = mock_info
            name = QuickBooksService.fetch_and_store_company_name(self.config)

        self.assertEqual(name, 'Acme Auto Repairs')
        self.config.refresh_from_db()
        self.assertEqual(self.config.company_name, 'Acme Auto Repairs')

    @patch.object(QuickBooksService, 'get_client')
    def test_fetch_falls_back_to_legal_name(self, mock_get_client):
        mock_get_client.return_value = MagicMock()
        mock_info = MagicMock()
        mock_info.CompanyName = ''
        mock_info.LegalName = 'Acme Legal LLC'

        with patch('apps.quickbooks_online.services.QBCompanyInfo') as mock_company_info:
            mock_company_info.get.return_value = mock_info
            name = QuickBooksService.fetch_and_store_company_name(self.config)

        self.assertEqual(name, 'Acme Legal LLC')
        self.config.refresh_from_db()
        self.assertEqual(self.config.company_name, 'Acme Legal LLC')

    def test_get_client_deactivates_when_refresh_token_expired(self):
        self.config.token.refresh_token_expires_at = timezone.now() - timedelta(minutes=1)
        self.config.token.save(update_fields=['refresh_token_expires_at'])

        client = QuickBooksService.get_client()

        self.assertIsNone(client)
        self.config.refresh_from_db()
        self.assertFalse(self.config.is_active)
