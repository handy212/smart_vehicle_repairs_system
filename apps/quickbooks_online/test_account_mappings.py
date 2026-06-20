from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.accounting.models import AccountingControl
from apps.quickbooks_online.mapping_services import QBOAccountMappingService
from apps.quickbooks_online.models import QBOAccountMapping, QBOConfig, QBOToken
from apps.quickbooks_online.services import QuickBooksService
from django.utils import timezone
from datetime import timedelta

User = get_user_model()


class QBOAccountMappingServiceTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='qbo-map@test.com',
            username='qbo_map_admin',
            password='password',
        )
        self.config = QBOConfig.objects.create(
            client_id='test_id',
            client_secret='test_secret',
            realm_id='12345',
            is_active=True,
        )
        QBOToken.objects.create(
            config=self.config,
            access_token='access',
            refresh_token='refresh',
            expires_at=timezone.now() + timedelta(days=1),
            refresh_token_expires_at=timezone.now() + timedelta(days=1),
        )
        self.service = QBOAccountMappingService(QuickBooksService())

    @patch('apps.quickbooks_online.mapping_services.QBAccount')
    @patch.object(QuickBooksService, 'get_client')
    def test_list_accounts_returns_sorted_results(self, mock_get_client, mock_qb_account):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        account = MagicMock()
        account.Id = '10'
        account.Name = 'Operating Bank'
        account.AccountType = 'Bank'
        account.AccountSubType = 'Checking'
        account.Active = True
        mock_qb_account.all.return_value = [account]

        accounts, error = self.service.list_accounts()
        self.assertIsNone(error)
        self.assertEqual(len(accounts), 1)
        self.assertEqual(accounts[0]['id'], '10')

    @patch('apps.quickbooks_online.mapping_services.QBAccount')
    @patch.object(QuickBooksService, 'get_client')
    def test_map_control_account_row(self, mock_get_client, mock_qb_account):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        qb_account = MagicMock()
        qb_account.Id = '400'
        qb_account.Name = 'Sales'
        qb_account.AccountType = 'Income'
        mock_qb_account.get.return_value = qb_account

        success, error = self.service.map_row(
            'control_account',
            'sales_revenue_account',
            qbo_account_id='400',
            user=self.admin,
        )
        self.assertTrue(success)
        self.assertIsNone(error)

        mapping = QBOAccountMapping.objects.get(
            mapping_kind='control_account',
            mapping_key='sales_revenue_account',
        )
        self.assertEqual(mapping.qbo_account_id, '400')
        controls = AccountingControl.get_settings()
        self.assertEqual(mapping.svr_account_id, controls.sales_revenue_account_id)

    @patch('apps.quickbooks_online.mapping_services.QBItem')
    @patch.object(QuickBooksService, 'get_client')
    def test_map_invoice_line_item_row(self, mock_get_client, mock_qb_item):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        item = MagicMock()
        item.Id = '55'
        item.Name = 'Labor Service'
        mock_qb_item.get.return_value = item

        success, error = self.service.map_row(
            'invoice_line_type',
            'labor',
            qbo_item_id='55',
            user=self.admin,
        )
        self.assertTrue(success)
        mapping = QBOAccountMapping.objects.get(
            mapping_kind='invoice_line_type',
            mapping_key='labor',
        )
        self.assertEqual(mapping.qbo_item_id, '55')

    def test_get_mapping_overview_includes_control_rows(self):
        overview = self.service.get_mapping_overview()
        kinds = {row['mapping_kind'] for row in overview['rows']}
        self.assertIn('control_account', kinds)
        self.assertIn('payment_method', kinds)
        self.assertIn('invoice_line_type', kinds)


class QBOAccountMappingApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='qbo-api@test.com',
            username='qbo_api_admin',
            password='password',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    @patch.object(QuickBooksService, 'is_connected', return_value=False)
    def test_overview_requires_connection(self, _mock_connected):
        response = self.client.get('/api/quickbooks/account-mappings/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch.object(QuickBooksService, 'is_connected', return_value=True)
    @patch.object(QuickBooksService, 'sdk_available', return_value=True)
    @patch('apps.quickbooks_online.api_views.get_account_mapping_service')
    def test_overview_returns_groups(self, mock_service_factory, *_mocks):
        mock_service = MagicMock()
        mock_service.get_mapping_overview.return_value = {
            'groups': [{'group': 'Revenue & Tax', 'rows': []}],
            'rows': [],
        }
        mock_service_factory.return_value = mock_service

        response = self.client.get('/api/quickbooks/account-mappings/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_connected'])

    @patch.object(QuickBooksService, 'is_connected', return_value=True)
    @patch.object(QuickBooksService, 'sdk_available', return_value=True)
    @patch('apps.quickbooks_online.api_views.get_account_mapping_service')
    def test_detail_mapping_save(self, mock_service_factory, *_mocks):
        mock_service = MagicMock()
        mock_service.map_row.return_value = (True, None)
        mapping = QBOAccountMapping(
            mapping_kind='payment_method',
            mapping_key='cash',
            qbo_account_id='99',
            qbo_account_name='Petty Cash',
        )
        mock_service.get_mapping.return_value = mapping
        mock_service_factory.return_value = mock_service

        response = self.client.post(
            '/api/quickbooks/account-mappings/payment_method/cash/',
            {'qbo_account_id': '99'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_service.map_row.assert_called_once()
