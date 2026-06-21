"""PO-linked vendor bill reuses existing QBO Bill from PO push."""

from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta

from apps.billing.models import Bill, BillLineItem
from apps.branches.models import Branch
from apps.inventory.models import Part, PartCategory, PurchaseOrder, Supplier
from apps.quickbooks_online.models import QBOMapping, QBOConfig, QBOToken
from apps.quickbooks_online.services import QuickBooksService

User = get_user_model()


class PoLinkedVendorBillSyncTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email='po-bill-sync@test.com',
            username='po_bill_sync_admin',
            password='password',
        )
        self.branch = Branch.objects.create(name='HQ', code='HQ', created_by=self.admin)
        self.supplier = Supplier.objects.create(name='Parts Co', supplier_code='PARTS')
        self.category = PartCategory.objects.create(name='Filters')
        self.part = Part.objects.create(
            part_number='FIL-1',
            name='Filter',
            category=self.category,
            branch=self.branch,
            cost_price=Decimal('10.00'),
            selling_price=Decimal('15.00'),
            created_by=self.admin,
        )
        self.po = PurchaseOrder.objects.create(
            supplier=self.supplier,
            branch=self.branch,
            po_number='PO000003',
            order_date=timezone.now().date(),
            status='received',
            total=Decimal('100.00'),
            created_by=self.admin,
        )
        self.bill = Bill.objects.create(
            vendor=self.supplier,
            branch=self.branch,
            purchase_order=self.po,
            bill_number='BILL-2026-HQ-000001',
            status='open',
            bill_date=timezone.now().date(),
            due_date=timezone.now().date(),
            total=Decimal('100.00'),
            amount_due=Decimal('100.00'),
            created_by=self.admin,
        )
        BillLineItem.objects.create(
            bill=self.bill,
            description='Filter',
            quantity=Decimal('1'),
            unit_price=Decimal('100.00'),
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
        po_ct = ContentType.objects.get_for_model(self.po)
        QBOMapping.objects.create(
            content_type=po_ct,
            object_id=self.po.id,
            qbo_id='3003',
            qbo_sync_token='1',
            status='synced',
        )

    @patch.object(QuickBooksService, 'sync_supplier')
    @patch.object(QuickBooksService, '_save_qb')
    @patch('apps.quickbooks_online.services.QBBill')
    def test_vendor_bill_updates_existing_po_qbo_bill(
        self, mock_qb_bill_cls, mock_save, mock_sync_supplier
    ):
        mock_client = MagicMock()
        existing_qb_bill = MagicMock()
        existing_qb_bill.Id = '3003'
        existing_qb_bill.SyncToken = '1'
        mock_qb_bill_cls.get.return_value = existing_qb_bill
        mock_qb_bill_cls.__name__ = 'Bill'
        mock_save.side_effect = lambda obj, _client: setattr(obj, 'Id', '3003') or setattr(
            obj, 'SyncToken', '2'
        ) or obj

        mock_sync_supplier.return_value = MagicMock(Id='VEND-1')

        service = QuickBooksService()
        with patch.object(service, 'get_client', return_value=mock_client):
            result = service.sync_vendor_bill(self.bill)

        self.assertIsNotNone(result)
        mock_qb_bill_cls.get.assert_called_once_with(3003, qb=mock_client)
        self.assertEqual(existing_qb_bill.DocNumber, 'BILL-2026-HQ-000001')

        bill_mapping = QBOMapping.objects.get(
            content_type=ContentType.objects.get_for_model(self.bill),
            object_id=self.bill.id,
        )
        po_mapping = QBOMapping.objects.get(
            content_type=ContentType.objects.get_for_model(self.po),
            object_id=self.po.id,
        )
        self.assertEqual(bill_mapping.qbo_id, '3003')
        self.assertEqual(po_mapping.qbo_id, '3003')
