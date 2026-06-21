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
from apps.accounting.models import Account
from apps.billing.models import Invoice, Payment
from apps.billing.serializers import PaymentSerializer
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.inventory.models import PurchaseOrder, Supplier
from apps.quickbooks_online.models import QBOMapping, QBOConfig, QBOSyncLog, QBOToken
from apps.quickbooks_online.outbound_log import run_outbound_entity_sync
from apps.quickbooks_online.services import QuickBooksService
from apps.quickbooks_online.sync_policy import is_outbound_eligible, outbound_eligibility_reason

User = get_user_model()


class SyncPolicyTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='policy-admin@test.com',
            username='policy_admin',
            password='password',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='policy-cust',
            email='policy-cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-POLICY')
        self.invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='draft',
            total=Decimal('100.00'),
            amount_due=Decimal('100.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        self.supplier = Supplier.objects.create(name='Vendor', supplier_code='V-POLICY')
        self.po = PurchaseOrder.objects.create(
            supplier=self.supplier,
            branch=self.branch,
            status='draft',
            created_by=self.admin,
        )

    def test_draft_invoice_not_eligible(self):
        eligible, reason = outbound_eligibility_reason('invoice', self.invoice)
        self.assertFalse(eligible)
        self.assertIn('draft', reason)

    def test_sent_invoice_is_eligible(self):
        self.invoice.status = 'sent'
        self.assertTrue(is_outbound_eligible('invoice', self.invoice))

    def test_pending_payment_not_eligible(self):
        payment = Payment(
            invoice=self.invoice,
            customer=self.customer,
            status='pending',
            amount=Decimal('10.00'),
            payment_method='cash',
        )
        self.assertFalse(is_outbound_eligible('payment', payment))

    def test_completed_payment_is_eligible(self):
        payment = Payment(
            invoice=self.invoice,
            customer=self.customer,
            status='completed',
            amount=Decimal('10.00'),
            payment_method='cash',
        )
        self.assertTrue(is_outbound_eligible('payment', payment))

    def test_draft_purchase_order_not_eligible(self):
        self.assertFalse(is_outbound_eligible('purchase_order', self.po))

    def test_approved_purchase_order_is_eligible(self):
        self.po.status = 'approved'
        self.assertTrue(is_outbound_eligible('purchase_order', self.po))


class OutboundSignalPolicyTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='signal-policy@test.com',
            username='signal_policy_admin',
            password='password',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN2', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='signal-cust',
            email='signal-cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-SIGNAL')

    @override_settings(QUICKBOOKS_AUTO_SYNC_ENABLED=True)
    @patch('apps.quickbooks_online.signals.task_sync_invoice_to_qbo.delay')
    def test_draft_invoice_save_does_not_queue_sync(self, mock_delay):
        Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='draft',
            total=Decimal('50.00'),
            amount_due=Decimal('50.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        mock_delay.assert_not_called()

    @override_settings(QUICKBOOKS_AUTO_SYNC_ENABLED=True)
    @patch('apps.quickbooks_online.signals.task_sync_invoice_to_qbo.delay')
    def test_sent_invoice_save_queues_sync(self, mock_delay):
        invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            total=Decimal('50.00'),
            amount_due=Decimal('50.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        mock_delay.assert_called_once_with(invoice.id)


class OutboundLoggingTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='out-log@test.com',
            username='out_log_admin',
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
        self.branch = Branch.objects.create(name='Main', code='MAIN3', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='out-log-cust',
            email='out-log@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-OUT')
        self.invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            total=Decimal('100.00'),
            amount_due=Decimal('100.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )

    @patch.object(QuickBooksService, 'sync_invoice')
    def test_successful_outbound_sync_writes_log(self, mock_sync):
        mock_result = MagicMock()
        mock_result.Id = 'INV-1'
        mock_sync.return_value = mock_result

        result = run_outbound_entity_sync(
            'invoice', self.invoice.id, 'billing', 'Invoice', 'sync_invoice',
        )
        self.assertIsNotNone(result)
        log = QBOSyncLog.objects.get(direction='outbound', entity_type='invoice')
        self.assertEqual(log.status, 'success')
        self.assertEqual(log.records_updated, 1)

    @patch.object(QuickBooksService, 'sync_invoice')
    def test_failed_outbound_sync_writes_log(self, mock_sync):
        mock_sync.return_value = None
        ct = ContentType.objects.get_for_model(self.invoice)
        QBOMapping.objects.create(
            content_type=ct,
            object_id=self.invoice.id,
            status='failed',
            error_message='Customer missing in QBO',
        )

        run_outbound_entity_sync(
            'invoice', self.invoice.id, 'billing', 'Invoice', 'sync_invoice',
        )
        log = QBOSyncLog.objects.get(direction='outbound', entity_type='invoice')
        self.assertEqual(log.status, 'failed')
        self.assertIn('Customer missing in QBO', log.error_message)


class OutboundApiPolicyTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='api-policy@test.com',
            username='api_policy_admin',
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
        self.branch = Branch.objects.create(name='Main', code='MAIN4', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='api-policy-cust',
            email='api-policy@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-API')
        self.invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='draft',
            total=Decimal('100.00'),
            amount_due=Decimal('100.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )

    @patch.object(QuickBooksService, 'is_connected', return_value=True)
    @patch.object(QuickBooksService, 'sdk_available', return_value=True)
    def test_outbound_sync_rejects_ineligible_invoice(self, _mock_sdk, _mock_connected):
        response = self.client.post(
            '/api/quickbooks/sync-outbound/',
            {'entity_type': 'invoice', 'object_id': self.invoice.id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('draft', response.data['detail'])


class PaymentQboSerializerTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='pay-qbo@test.com',
            username='pay_qbo_admin',
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
        self.branch = Branch.objects.create(name='Main', code='MAIN5', created_by=self.admin)
        customer_user = User.objects.create_user(
            username='pay-qbo-cust',
            email='pay-qbo@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user, customer_number='C-PAY')
        self.invoice = Invoice.objects.create(
            customer=self.customer,
            branch=self.branch,
            status='sent',
            total=Decimal('100.00'),
            amount_due=Decimal('100.00'),
            invoice_date=timezone.now().date(),
            created_by=self.admin,
        )
        self.bank_account = Account.objects.create(
            code='1100',
            name='Operating Bank',
            account_type='asset',
            account_subtype='bank',
            balance_type='debit',
            is_active=True,
        )
        self.payment = Payment.objects.create(
            invoice=self.invoice,
            customer=self.customer,
            status='completed',
            amount=Decimal('25.00'),
            payment_method='check',
            bank_account=self.bank_account,
            processed_by=self.admin,
        )

    @patch.object(QuickBooksService, 'is_connected', return_value=True)
    def test_payment_serializer_includes_qbo_fields(self, _mock_connected):
        ct = ContentType.objects.get_for_model(self.payment)
        QBOMapping.objects.create(
            content_type=ct,
            object_id=self.payment.id,
            qbo_id='PAY-1',
            status='synced',
        )
        data = PaymentSerializer(self.payment).data
        self.assertEqual(data['qbo_sync_status'], 'synced')

    @patch.object(QuickBooksService, 'is_connected', return_value=False)
    def test_payment_serializer_hides_qbo_fields_when_disconnected(self, _mock_connected):
        data = PaymentSerializer(self.payment).data
        self.assertNotIn('qbo_sync_status', data)
        self.assertNotIn('qbo_sync_error', data)
