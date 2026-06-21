from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import override_settings
from django.utils import timezone
from datetime import timedelta
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.accounts.admin_models import SystemModule
from apps.billing.models import Bill, BillLineItem, VendorCredit, VendorCreditLineItem
from apps.billing.serializers import BillSerializer, VendorCreditDetailSerializer
from apps.branches.models import Branch
from apps.inventory.models import Supplier
from apps.quickbooks_online.models import QBOMapping, QBOConfig, QBOToken
from apps.quickbooks_online.services import QuickBooksService
from apps.quickbooks_online.sync_policy import is_outbound_eligible

User = get_user_model()


class VendorBillSyncPolicyTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='vb-policy@test.com',
            username='vb_policy_admin',
            password='password',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN-VB', created_by=self.admin)
        self.supplier = Supplier.objects.create(name='Vendor', supplier_code='V-VB')
        self.bill = Bill.objects.create(
            vendor=self.supplier,
            branch=self.branch,
            status='draft',
            bill_date=timezone.now().date(),
            due_date=timezone.now().date(),
            total=Decimal('100.00'),
            amount_due=Decimal('100.00'),
            created_by=self.admin,
        )

    def test_draft_vendor_bill_not_eligible(self):
        self.assertFalse(is_outbound_eligible('vendor_bill', self.bill))

    def test_open_vendor_bill_is_eligible(self):
        self.bill.status = 'open'
        self.assertTrue(is_outbound_eligible('vendor_bill', self.bill))


class VendorCreditSyncPolicyTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='vc-policy@test.com',
            username='vc_policy_admin',
            password='password',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN-VC', created_by=self.admin)
        self.supplier = Supplier.objects.create(name='Vendor', supplier_code='V-VC')
        self.vendor_credit = VendorCredit.objects.create(
            vendor=self.supplier,
            branch=self.branch,
            status='draft',
            total=Decimal('50.00'),
            created_by=self.admin,
        )

    def test_draft_vendor_credit_not_eligible(self):
        self.assertFalse(is_outbound_eligible('vendor_credit', self.vendor_credit))

    def test_issued_vendor_credit_is_eligible(self):
        self.vendor_credit.status = 'issued'
        self.assertTrue(is_outbound_eligible('vendor_credit', self.vendor_credit))


class VendorBillOutboundApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='vb-api@test.com',
            username='vb_api_admin',
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
        SystemModule.objects.get_or_create(slug='billing', defaults={'name': 'Billing', 'is_enabled': True})
        self.branch = Branch.objects.create(name='Main', code='MAIN-VB2', created_by=self.admin)
        self.supplier = Supplier.objects.create(name='Vendor', supplier_code='V-VB2')
        self.bill = Bill.objects.create(
            vendor=self.supplier,
            branch=self.branch,
            status='open',
            bill_date=timezone.now().date(),
            due_date=timezone.now().date(),
            total=Decimal('200.00'),
            amount_due=Decimal('200.00'),
            created_by=self.admin,
        )
        BillLineItem.objects.create(
            bill=self.bill,
            description='Rent',
            quantity=Decimal('1'),
            unit_price=Decimal('200.00'),
        )

    @patch.object(QuickBooksService, 'sdk_available', return_value=True)
    @patch('apps.quickbooks_online.task_dispatch.schedule_entity_sync')
    def test_outbound_sync_queues_vendor_bill(self, mock_schedule, _mock_sdk):
        response = self.client.post(
            '/api/quickbooks/sync-outbound/',
            {'entity_type': 'vendor_bill', 'object_id': self.bill.id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_schedule.assert_called_once()


class VendorBillSerializerQboTests(APITestCase):
    def setUp(self):
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
        self.admin = User.objects.create_superuser(
            email='vb-ser@test.com',
            username='vb_ser_admin',
            password='password',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN-VB3', created_by=self.admin)
        self.supplier = Supplier.objects.create(name='Vendor', supplier_code='V-VB3')
        self.bill = Bill.objects.create(
            vendor=self.supplier,
            branch=self.branch,
            status='open',
            bill_date=timezone.now().date(),
            due_date=timezone.now().date(),
            total=Decimal('75.00'),
            amount_due=Decimal('75.00'),
            created_by=self.admin,
        )

    @patch.object(QuickBooksService, 'is_connected', return_value=True)
    def test_bill_serializer_includes_qbo_fields(self, _mock_connected):
        ct = ContentType.objects.get_for_model(self.bill)
        QBOMapping.objects.create(
            content_type=ct,
            object_id=self.bill.id,
            qbo_id='BILL-1',
            status='synced',
        )
        data = BillSerializer(self.bill).data
        self.assertEqual(data['qbo_sync_status'], 'synced')


class PullVendorBillTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='pull-vb@test.com',
            username='pull_vb_admin',
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
        self.branch = Branch.objects.create(name='Main', code='MAIN-PVB', created_by=self.admin)
        self.supplier = Supplier.objects.create(name='Vendor', supplier_code='V-PVB')
        self.bill = Bill.objects.create(
            vendor=self.supplier,
            branch=self.branch,
            status='open',
            bill_date=timezone.now().date(),
            due_date=timezone.now().date(),
            total=Decimal('100.00'),
            amount_paid=Decimal('0.00'),
            amount_due=Decimal('100.00'),
            created_by=self.admin,
        )
        ct = ContentType.objects.get_for_model(self.bill)
        QBOMapping.objects.create(
            content_type=ct,
            object_id=self.bill.id,
            qbo_id='QB-BILL-1',
            status='synced',
        )

    @patch.object(QuickBooksService, 'get_client')
    def test_pull_bills_updates_vendor_bill_payment(self, mock_get_client):
        mock_get_client.return_value = MagicMock()
        qb_bill = MagicMock()
        qb_bill.Id = 'QB-BILL-1'
        qb_bill.Balance = 0
        qb_bill.TotalAmt = 100
        qb_bill.SyncToken = '1'

        service = QuickBooksService()
        with patch('apps.quickbooks_online.services.QBBill') as mock_bill_cls:
            mock_bill_cls.all.return_value = [qb_bill]
            log = service.pull_bills()

        self.bill.refresh_from_db()
        self.assertEqual(self.bill.status, 'paid')
        self.assertEqual(self.bill.amount_paid, Decimal('100.00'))
        self.assertEqual(log.records_updated, 1)
