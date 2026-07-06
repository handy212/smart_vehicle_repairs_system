"""Tests for PO ↔ Bill QBO mapping separation."""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase


class ResolvePoQboPurchaseOrderIdTests(SimpleTestCase):
    def test_returns_purchase_order_id_from_mapping(self):
        from apps.quickbooks_online.ap_sync_helpers import resolve_po_qbo_purchase_order_id

        po = SimpleNamespace(id=7)
        mapping = SimpleNamespace(qbo_id='999')

        with patch('apps.quickbooks_online.ap_sync_helpers.ContentType') as ct, patch(
            'apps.quickbooks_online.ap_sync_helpers.QBOMapping'
        ) as mock_model:
            ct.objects.get_for_model.return_value = MagicMock()
            mock_model.objects.filter.return_value.exclude.return_value.first.return_value = mapping
            self.assertEqual(resolve_po_qbo_purchase_order_id(po), '999')


class ApplyBillPoLinkedTxnTests(SimpleTestCase):
    def test_uses_purchase_order_id_not_bill_id(self):
        from apps.quickbooks_online.ap_sync_helpers import apply_bill_po_linked_txn

        po = SimpleNamespace(id=1, items=MagicMock(all=MagicMock(return_value=[])))
        qb_bill = SimpleNamespace(Line=[])
        linked_cls = MagicMock(side_effect=lambda: SimpleNamespace())

        with patch(
            'apps.quickbooks_online.ap_sync_helpers.resolve_po_qbo_purchase_order_id',
            return_value='42',
        ):
            apply_bill_po_linked_txn(qb_bill, po, [], LinkedTxn=linked_cls)

        self.assertEqual(qb_bill.LinkedTxn[0].TxnId, '42')
        self.assertEqual(qb_bill.LinkedTxn[0].TxnType, 'PurchaseOrder')

    def test_skips_when_po_not_synced(self):
        from apps.quickbooks_online.ap_sync_helpers import apply_bill_po_linked_txn

        po = SimpleNamespace(id=1)
        qb_bill = SimpleNamespace()

        with patch(
            'apps.quickbooks_online.ap_sync_helpers.resolve_po_qbo_purchase_order_id',
            return_value=None,
        ):
            apply_bill_po_linked_txn(qb_bill, po, [], LinkedTxn=MagicMock)

        self.assertFalse(hasattr(qb_bill, 'LinkedTxn'))


class ClassTrackingDefaultTests(SimpleTestCase):
    def test_disabled_when_prefs_unavailable(self):
        from apps.quickbooks_online.class_sync_helpers import class_tracking_enabled

        with patch(
            'apps.quickbooks_online.class_sync_helpers.qbo_class_tracking_prefs',
            return_value=None,
        ):
            self.assertFalse(class_tracking_enabled(MagicMock()))


class VendorBillResolveTests(SimpleTestCase):
    def test_resolve_does_not_use_po_mapping_as_bill_id(self):
        """PO mapping stores PurchaseOrder Id — bill lookup uses DocNumber instead."""
        from apps.quickbooks_online.services import QuickBooksService

        local_bill = SimpleNamespace(
            id=1,
            bill_number='BILL-001',
            purchase_order=SimpleNamespace(id=2, po_number='PO-001'),
        )
        service = QuickBooksService()
        qb_bill = SimpleNamespace(Id='555', SyncToken='1')

        with patch.object(service, 'get_client', return_value=MagicMock()), patch.object(
            service,
            '_load_qbo_entity',
            return_value=(None, False, 'not found'),
        ), patch(
            'apps.quickbooks_online.ap_sync_helpers.find_qbo_bill_for_po',
            return_value=qb_bill,
        ), patch('apps.quickbooks_online.services.ContentType') as ct, patch(
            'apps.quickbooks_online.services.QBOMapping'
        ) as mock_mapping:
            ct.objects.get_for_model.return_value = MagicMock()
            result, error = service._resolve_vendor_bill_qbo_bill(local_bill, doc_number='BILL-001')

        self.assertIs(result, qb_bill)
        self.assertIsNone(error)
        mock_mapping.objects.update_or_create.assert_called_once()
