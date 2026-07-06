"""API tests for QuickBooks setup status endpoint."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

User = get_user_model()


class QboSetupStatusApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='qbo-setup-status@test.com',
            username='qbo-setup-status',
            password='testpass123',
            role='super-admin',
            is_staff=True,
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    @patch('apps.quickbooks_online.qbo_setup_status.get_qbo_setup_status')
    def test_setup_status_returns_overview(self, mock_status):
        mock_status.return_value = {
            'is_connected': True,
            'is_api_ready': True,
            'company_mappings': {'mapped': 5, 'total': 10},
            'branches': {
                'active_count': 2,
                'unmapped_locations': 1,
                'override_slots_per_branch': 8,
                'items': [],
            },
            'next_steps': [{'id': 'connect', 'label': 'Connected', 'done': True}],
        }

        response = self.client.get('/api/quickbooks/setup-status/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_connected'])
        self.assertEqual(response.data['company_mappings']['mapped'], 5)
