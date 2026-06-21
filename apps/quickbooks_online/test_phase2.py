from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.accounts.admin_models import SystemModule
from apps.billing.models import CreditNote, Estimate, Invoice
from apps.billing.serializers import CreditNoteDetailSerializer, EstimateDetailSerializer
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.quickbooks_online.models import QBOMapping, QBOConfig, QBOSyncLog, QBOToken
from apps.quickbooks_online.services import QuickBooksService

User = get_user_model()


class QBOPhase2ApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='qbo-phase2@test.com',
            username='qbo_phase2_admin',
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
            slug='accounting',
            defaults={'name': 'Accounting', 'is_enabled': True},
        )
        SystemModule.objects.get_or_create(
            slug='billing',
            defaults={'name': 'Billing', 'is_enabled': True},
        )

        self.branch = Branch.objects.create(name='Main', code='MAIN', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='phase2cust',
            email='phase2cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-P2-001')

        QBOSyncLog.objects.create(
            entity_type='vendor',
            direction='inbound',
            status='success',
            records_pulled=5,
            records_updated=2,
            finished_at=timezone.now(),
            triggered_by=self.admin,
        )

    def test_sync_logs_list_returns_recent_entries(self):
        response = self.client.get('/api/quickbooks/sync-logs/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['entity_type'], 'vendor')

    @patch.object(QuickBooksService, 'is_connected', return_value=True)
    @patch.object(QuickBooksService, 'sdk_available', return_value=True)
    @patch('apps.quickbooks_online.api_views.get_account_mapping_service')
    def test_tax_codes_list_endpoint(self, mock_service_factory, *_mocks):
        mock_service = MagicMock()
        mock_service.list_tax_codes.return_value = (
            [{'id': '3', 'name': 'GST', 'active': True, 'description': ''}],
            None,
        )
        mock_service_factory.return_value = mock_service

        response = self.client.get('/api/quickbooks/tax-codes/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['tax_codes']), 1)

    @patch.object(QuickBooksService, 'sdk_available', return_value=True)
    @patch.object(QuickBooksService, 'sync_estimate')
    def test_outbound_sync_inline_estimate(self, mock_sync_estimate, _mock_sdk):
        estimate = Estimate.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            total=Decimal('150.00'),
            estimate_date=timezone.now().date(),
            valid_until=timezone.now().date() + timedelta(days=14),
            created_by=self.admin,
        )
        mock_result = MagicMock()
        mock_result.Id = '88'
        mock_sync_estimate.return_value = mock_result

        response = self.client.post(
            '/api/quickbooks/sync-outbound/',
            {'entity_type': 'estimate', 'object_id': estimate.id, 'inline': True},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['entity_type'], 'estimate')
        mock_sync_estimate.assert_called_once()

    @patch.object(QuickBooksService, 'sdk_available', return_value=True)
    @patch('apps.quickbooks_online.task_dispatch.schedule_entity_sync')
    def test_outbound_sync_queues_credit_note(self, mock_schedule, _mock_sdk):
        credit_note = CreditNote.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='issued',
            total=Decimal('50.00'),
            credit_date=timezone.now().date(),
            created_by=self.admin,
        )

        response = self.client.post(
            '/api/quickbooks/sync-outbound/',
            {'entity_type': 'credit_note', 'object_id': credit_note.id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['queued'])
        mock_schedule.assert_called_once()


class QBOPhase2SerializerTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='qbo-ser@test.com',
            username='qbo_ser_admin',
            password='password',
        )
        QBOConfig.objects.create(
            client_id='test_id',
            client_secret='test_secret',
            realm_id='12345',
            is_active=True,
        )
        QBOToken.objects.create(
            config=QBOConfig.objects.first(),
            access_token='access',
            refresh_token='refresh',
            expires_at=timezone.now() + timedelta(days=1),
            refresh_token_expires_at=timezone.now() + timedelta(days=1),
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='sercust',
            email='sercust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-SER-001')

    @patch.object(QuickBooksService, 'is_connected', return_value=True)
    def test_estimate_detail_includes_qbo_fields(self, _mock_connected):
        estimate = Estimate.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='approved',
            total=Decimal('200.00'),
            estimate_date=timezone.now().date(),
            valid_until=timezone.now().date() + timedelta(days=7),
            created_by=self.admin,
        )
        ct = ContentType.objects.get_for_model(estimate)
        QBOMapping.objects.create(
            content_type=ct,
            object_id=estimate.id,
            qbo_id='12',
            status='synced',
        )

        data = EstimateDetailSerializer(estimate).data
        self.assertEqual(data['qbo_sync_status'], 'synced')

    @patch.object(QuickBooksService, 'is_connected', return_value=True)
    def test_credit_note_detail_includes_qbo_fields(self, _mock_connected):
        credit_note = CreditNote.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='issued',
            total=Decimal('75.00'),
            credit_date=timezone.now().date(),
            created_by=self.admin,
        )
        ct = ContentType.objects.get_for_model(credit_note)
        QBOMapping.objects.create(
            content_type=ct,
            object_id=credit_note.id,
            qbo_id='99',
            status='failed',
            error_message='Invalid customer',
        )

        data = CreditNoteDetailSerializer(credit_note).data
        self.assertEqual(data['qbo_sync_status'], 'failed')
        self.assertEqual(data['qbo_sync_error'], 'Invalid customer')


class EstimateQboTxnStatusTests(TestCase):
    def test_apply_estimate_txn_status_maps_approved_to_accepted(self):
        service = QuickBooksService()
        qb_estimate = MagicMock()
        local_estimate = MagicMock(status='approved')
        service._apply_estimate_txn_status(qb_estimate, local_estimate)
        self.assertEqual(qb_estimate.TxnStatus, 'Accepted')

    def test_apply_estimate_txn_status_omits_sent_status(self):
        service = QuickBooksService()
        qb_estimate = MagicMock()
        qb_estimate.TxnStatus = 'Pending'
        local_estimate = MagicMock(status='sent')
        service._apply_estimate_txn_status(qb_estimate, local_estimate)
        self.assertEqual(qb_estimate.TxnStatus, 'Pending')
