"""Tests for legacy PO QBO mapping repair."""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase


class ClassifyQboIdForPoTests(SimpleTestCase):
    def test_purchase_order_id(self):
        from apps.quickbooks_online.po_mapping_repair import classify_qbo_id_for_po

        client = MagicMock()
        with patch('quickbooks.objects.purchaseorder.PurchaseOrder') as po_cls:
            po_cls.get.return_value = SimpleNamespace(Id='1')
            self.assertEqual(classify_qbo_id_for_po(client, '1'), 'purchase_order')

    def test_bill_id(self):
        from apps.quickbooks_online.po_mapping_repair import classify_qbo_id_for_po

        client = MagicMock()
        with patch('quickbooks.objects.purchaseorder.PurchaseOrder') as po_cls, patch(
            'quickbooks.objects.bill.Bill'
        ) as bill_cls:
            po_cls.get.side_effect = Exception('not a PO')
            bill_cls.get.return_value = SimpleNamespace(Id='2')
            self.assertEqual(classify_qbo_id_for_po(client, '2'), 'bill')

    def test_missing_id(self):
        from apps.quickbooks_online.po_mapping_repair import classify_qbo_id_for_po

        self.assertEqual(classify_qbo_id_for_po(MagicMock(), ''), 'missing')


class RepairLegacyPoMappingsTests(SimpleTestCase):
    def _run_repair(self, *, dry_run, resync):
        from apps.quickbooks_online.po_mapping_repair import repair_legacy_po_qbo_mappings

        service = MagicMock()
        service.get_client.return_value = MagicMock()
        service.sync_purchase_order.return_value = SimpleNamespace(Id='999')
        mapping = SimpleNamespace(id=10, object_id=5, qbo_id='777')
        local_po = SimpleNamespace(id=5, po_number='PO-001')

        with patch('apps.quickbooks_online.po_mapping_repair.ContentType') as ct, patch(
            'apps.quickbooks_online.po_mapping_repair.QBOMapping'
        ) as mock_model, patch(
            'apps.quickbooks_online.po_mapping_repair.classify_qbo_id_for_po',
            return_value='bill',
        ), patch('apps.inventory.models.PurchaseOrder') as po_model:
            ct.objects.get_for_model.return_value = MagicMock()
            mock_model.objects.filter.return_value.exclude.return_value = [mapping]
            po_model.objects.get.return_value = local_po
            return repair_legacy_po_qbo_mappings(service, dry_run=dry_run, resync=resync), service, local_po

    def test_dry_run_reports_legacy_without_clearing(self):
        result, service, _local_po = self._run_repair(dry_run=True, resync=False)
        self.assertEqual(result['legacy_bill'], 1)
        self.assertEqual(result['cleared'], 0)
        service.clear_qbo_mapping.assert_not_called()

    def test_apply_clears_and_resyncs(self):
        result, service, local_po = self._run_repair(dry_run=False, resync=True)
        self.assertEqual(result['cleared'], 1)
        self.assertEqual(result['resynced'], 1)
        service.clear_qbo_mapping.assert_called_once_with(local_po)
        service.sync_purchase_order.assert_called_once_with(local_po)
