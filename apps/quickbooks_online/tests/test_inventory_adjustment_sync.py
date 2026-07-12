"""Tests for QBO inventory adjustment sync and multi-branch qty aggregation."""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.branches.models import Branch
from apps.inventory.models import InventoryTransaction, Part, PartCategory, StockItem
from apps.quickbooks_online.inventory_adjustment_sync import (
    QBO_INVENTORY_ADJUSTMENT_TYPES,
    sync_inventory_adjustment,
)
from apps.quickbooks_online.item_sync import (
    part_quantity_on_hand_across_branches,
    sync_part,
)
from apps.quickbooks_online.sync_policy import outbound_eligibility_reason

User = get_user_model()


class InventoryAdjustmentSyncPolicyTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='inv_adj',
            email='inv_adj@example.com',
            password='password',
            role='manager',
        )
        self.branch = Branch.objects.create(name='Main', code='MAIN', created_by=self.user)
        category = PartCategory.objects.create(name='Fluids')
        self.part = Part.objects.create(
            part_number='OIL-001',
            name='Engine Oil',
            category=category,
            item_type='inventory',
            cost_price=Decimal('10.00'),
            selling_price=Decimal('15.00'),
        )

    def _txn(self, transaction_type, quantity=5):
        return InventoryTransaction(
            part=self.part,
            branch=self.branch,
            transaction_type=transaction_type,
            quantity=quantity,
            created_by=self.user,
        )

    def test_correction_is_eligible(self):
        txn = self._txn('correction', 3)
        eligible, reason = outbound_eligibility_reason('inventory_adjustment', txn)
        self.assertTrue(eligible)
        self.assertEqual(reason, '')

    def test_sale_is_not_eligible(self):
        txn = self._txn('sale', -1)
        eligible, reason = outbound_eligibility_reason('inventory_adjustment', txn)
        self.assertFalse(eligible)
        self.assertIn('not eligible', reason)

    def test_all_adjustment_types_covered(self):
        self.assertIn('correction', QBO_INVENTORY_ADJUSTMENT_TYPES)
        self.assertIn('adjustment', QBO_INVENTORY_ADJUSTMENT_TYPES)
        self.assertIn('found', QBO_INVENTORY_ADJUSTMENT_TYPES)


class MultiBranchQuantityAggregationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='qty_agg',
            email='qty_agg@example.com',
            password='password',
            role='manager',
        )
        self.kumasi = Branch.objects.create(name='Kumasi', code='KSI', created_by=self.user)
        self.accra = Branch.objects.create(name='Accra', code='ACC', created_by=self.user)
        self.tamale = Branch.objects.create(name='Tamale', code='TAM', created_by=self.user)
        category = PartCategory.objects.create(name='Filters')
        self.part = Part.objects.create(
            part_number='FILT-001',
            name='Oil Filter',
            category=category,
            item_type='inventory',
            cost_price=Decimal('5.00'),
            selling_price=Decimal('8.00'),
        )
        StockItem.objects.create(part=self.part, branch=self.kumasi, quantity_in_stock=5)
        StockItem.objects.create(part=self.part, branch=self.accra, quantity_in_stock=3)
        StockItem.objects.create(part=self.part, branch=self.tamale, quantity_in_stock=0)

    def test_part_quantity_sums_all_branches(self):
        self.assertEqual(part_quantity_on_hand_across_branches(self.part), 8.0)

    def test_new_branch_without_stock_does_not_change_total(self):
        Branch.objects.create(name='Takoradi', code='TKD', created_by=self.user)
        self.assertEqual(part_quantity_on_hand_across_branches(self.part), 8.0)

    def test_additional_branch_stock_increases_company_total(self):
        takoradi = Branch.objects.create(name='Takoradi', code='TKD', created_by=self.user)
        StockItem.objects.create(part=self.part, branch=takoradi, quantity_in_stock=4)
        self.assertEqual(part_quantity_on_hand_across_branches(self.part), 12.0)


class InventoryAdjustmentQtySyncTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='adj_qty',
            email='adj_qty@example.com',
            password='password',
            role='manager',
        )
        self.branch = Branch.objects.create(name='Kumasi', code='KSI', created_by=self.user)
        category = PartCategory.objects.create(name='Fluids')
        self.part = Part.objects.create(
            part_number='OIL-002',
            name='Gear Oil',
            category=category,
            item_type='inventory',
            cost_price=Decimal('10.00'),
            selling_price=Decimal('15.00'),
        )
        StockItem.objects.create(part=self.part, branch=self.branch, quantity_in_stock=8)
        self.service = MagicMock()
        self.service.get_client.return_value = MagicMock()

    @patch('apps.quickbooks_online.inventory_adjustment_sync.ensure_part_item_for_inventory_adjustment')
    def test_adjustment_sync_uses_qty_safe_item_ensure(self, mock_ensure):
        mock_ensure.return_value = SimpleNamespace(Id='42')
        txn = InventoryTransaction.objects.create(
            part=self.part,
            branch=self.branch,
            transaction_type='correction',
            quantity=3,
            created_by=self.user,
        )

        result, error = sync_inventory_adjustment(self.service, txn)

        self.assertIsNone(error)
        self.assertIsNotNone(result)
        mock_ensure.assert_called_once_with(self.service, self.part)
        saved_adj = self.service._save_qb.call_args[0][0]
        self.assertEqual(saved_adj.Line[0]['ItemAdjustmentLineDetail']['QtyDiff'], 3.0)

    @patch('apps.quickbooks_online.item_sync.QBItem', SimpleNamespace)
    @patch('apps.quickbooks_online.item_sync.Ref', SimpleNamespace)
    @patch('apps.quickbooks_online.item_sync._mapping_service')
    @patch('apps.quickbooks_online.item_sync.resolve_qbo_entity')
    def test_sync_part_without_qty_update_leaves_existing_qbo_qty(
        self,
        mock_resolve,
        mock_mapping_service,
    ):
        qb_item = SimpleNamespace(
            Id='99',
            Type='Inventory',
            QtyOnHand=5,
            InvStartDate=None,
            SyncToken='1',
        )
        mock_resolve.return_value = (qb_item, None)
        mock_mapping_service.return_value.resolve_control_account_qbo_id.side_effect = ['1', '2', '3']

        with patch(
            'apps.quickbooks_online.account_requirements.validate_inventory_part_account_ids',
            return_value=None,
        ):
            sync_part(self.service, self.part, update_qty_on_hand=False)

        self.assertEqual(qb_item.QtyOnHand, 5)

    @patch('apps.quickbooks_online.item_sync.QBItem', SimpleNamespace)
    @patch('apps.quickbooks_online.item_sync.Ref', SimpleNamespace)
    @patch('apps.quickbooks_online.item_sync._mapping_service')
    @patch('apps.quickbooks_online.item_sync.resolve_qbo_entity')
    def test_sync_part_with_qty_update_sets_company_wide_total(
        self,
        mock_resolve,
        mock_mapping_service,
    ):
        qb_item = SimpleNamespace(
            Id='99',
            Type='Inventory',
            QtyOnHand=5,
            InvStartDate=None,
            SyncToken='1',
        )
        mock_resolve.return_value = (qb_item, None)
        mock_mapping_service.return_value.resolve_control_account_qbo_id.side_effect = ['1', '2', '3']

        with patch(
            'apps.quickbooks_online.account_requirements.validate_inventory_part_account_ids',
            return_value=None,
        ):
            sync_part(self.service, self.part, update_qty_on_hand=True)

        self.assertEqual(qb_item.QtyOnHand, 8.0)
