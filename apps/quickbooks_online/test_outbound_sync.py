from unittest.mock import MagicMock, patch

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from datetime import timedelta
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.accounts.admin_models import SystemModule
from apps.billing.models import Invoice
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.customers.serializers import CustomerDetailSerializer
from apps.inventory.models import Part, PartCategory, Supplier
from apps.quickbooks_online.models import QBOMapping, QBOConfig, QBOToken
from apps.quickbooks_online.services import QuickBooksService

User = get_user_model()


class QBOOutboundSyncApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='qbo-out@test.com',
            username='qbo_out_admin',
            password='password',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

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

        SystemModule.objects.get_or_create(
            slug='billing',
            defaults={'name': 'Billing', 'is_enabled': True},
        )
        SystemModule.objects.get_or_create(
            slug='customers',
            defaults={'name': 'Customers', 'is_enabled': True},
        )
        SystemModule.objects.get_or_create(
            slug='inventory',
            defaults={'name': 'Inventory', 'is_enabled': True},
        )

        self.branch = Branch.objects.create(name='Main', code='MAIN', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='cust1',
            email='cust1@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-001')
        self.invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            total=Decimal('100.00'),
            amount_due=Decimal('100.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        self.supplier = Supplier.objects.create(name='Vendor', supplier_code='V-001')
        self.part_category = PartCategory.objects.create(name='General')
        self.part = Part.objects.create(
            part_number='PART-001',
            name='Test Part',
            category=self.part_category,
            branch=self.branch,
            cost_price=Decimal('5.00'),
            selling_price=Decimal('10.00'),
            created_by=self.admin,
        )

    @patch.object(QuickBooksService, 'is_connected', return_value=False)
    def test_outbound_sync_requires_connection(self, _mock_connected):
        response = self.client.post(
            '/api/quickbooks/sync-outbound/',
            {'entity_type': 'invoice', 'object_id': self.invoice.id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch.object(QuickBooksService, 'sdk_available', return_value=True)
    @patch('apps.quickbooks_online.tasks.task_sync_invoice_to_qbo.delay')
    def test_outbound_sync_queues_invoice(self, mock_delay, _mock_sdk):
        response = self.client.post(
            '/api/quickbooks/sync-outbound/',
            {'entity_type': 'invoice', 'object_id': self.invoice.id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['queued'])
        self.assertEqual(response.data['entity_type'], 'invoice')
        mock_delay.assert_called_once_with(self.invoice.id)

    @patch.object(QuickBooksService, 'sdk_available', return_value=True)
    @patch('apps.quickbooks_online.tasks.task_sync_part_to_qbo.delay')
    def test_outbound_sync_queues_part(self, mock_delay, _mock_sdk):
        response = self.client.post(
            '/api/quickbooks/sync-outbound/',
            {'entity_type': 'part', 'object_id': self.part.id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['queued'])
        self.assertEqual(response.data['entity_type'], 'part')
        mock_delay.assert_called_once_with(self.part.id)

    @patch.object(QuickBooksService, 'sdk_available', return_value=True)
    @patch('apps.quickbooks_online.tasks.task_sync_supplier_to_qbo')
    def test_outbound_sync_falls_back_to_inline_task(self, mock_task, _mock_sdk):
        mock_task.delay.side_effect = Exception('broker unavailable')

        response = self.client.post(
            '/api/quickbooks/sync-outbound/',
            {'entity_type': 'supplier', 'object_id': self.supplier.id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['queued'])
        mock_task.assert_called_once_with(self.supplier.id)

    @patch.object(QuickBooksService, 'sdk_available', return_value=True)
    @patch.object(QuickBooksService, 'sync_customer')
    def test_outbound_sync_inline_customer(self, mock_sync_customer, _mock_sdk):
        mock_result = MagicMock()
        mock_result.Id = '55'
        mock_sync_customer.return_value = mock_result

        ct = ContentType.objects.get_for_model(self.customer)
        QBOMapping.objects.create(
            content_type=ct,
            object_id=self.customer.id,
            qbo_id='55',
            status='synced',
        )

        response = self.client.post(
            '/api/quickbooks/sync-outbound/',
            {
                'entity_type': 'customer',
                'object_id': self.customer.id,
                'inline': True,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['queued'])
        self.assertEqual(response.data['status'], 'success')
        self.assertEqual(response.data['qbo_id'], '55')
        mock_sync_customer.assert_called_once()

    def test_outbound_sync_rejects_unknown_entity_type(self):
        response = self.client.post(
            '/api/quickbooks/sync-outbound/',
            {'entity_type': 'purchase_receipt', 'object_id': 1},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_outbound_sync_returns_404_for_missing_object(self):
        response = self.client.post(
            '/api/quickbooks/sync-outbound/',
            {'entity_type': 'invoice', 'object_id': 999999},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class CustomerQboSerializerTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='qbo-cust@test.com',
            username='qbo_cust_admin',
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
        customer_user = User.objects.create_user(
            username='cust2',
            email='cust2@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-002')

    @patch.object(QuickBooksService, 'is_connected', return_value=True)
    def test_customer_detail_includes_qbo_sync_fields(self, _mock_connected):
        ct = ContentType.objects.get_for_model(self.customer)
        QBOMapping.objects.create(
            content_type=ct,
            object_id=self.customer.id,
            qbo_id='77',
            status='failed',
            error_message='Duplicate name in QBO',
        )

        data = CustomerDetailSerializer(self.customer).data
        self.assertEqual(data['qbo_sync_status'], 'failed')
        self.assertEqual(data['qbo_sync_error'], 'Duplicate name in QBO')

    @patch.object(QuickBooksService, 'is_connected', return_value=False)
    def test_customer_detail_hides_qbo_fields_when_disconnected(self, _mock_connected):
        data = CustomerDetailSerializer(self.customer).data
        self.assertNotIn('qbo_sync_status', data)
        self.assertNotIn('qbo_sync_error', data)
