"""Tests for QBO account type requirements on inventory item sync."""

from datetime import date, timedelta, timezone as dt_timezone
from unittest.mock import MagicMock, patch

from django.test import TestCase

from apps.quickbooks_online.account_requirements import (
    account_matches_inventory_requirement,
    validate_control_account_for_inventory_item,
    validate_inventory_part_account_ids,
)


class InventoryAccountRequirementTests(TestCase):
    def _account(self, name, account_type, account_sub_type):
        account = MagicMock()
        account.Name = name
        account.AccountType = account_type
        account.AccountSubType = account_sub_type
        return account

    def test_valid_inventory_asset_account(self):
        account = self._account('Inventory Asset', 'Other Current Asset', 'Inventory')
        self.assertTrue(account_matches_inventory_requirement(account, 'inventory_asset_account'))
        self.assertIsNone(
            validate_control_account_for_inventory_item(account, 'inventory_asset_account')
        )

    def test_rejects_wrong_inventory_asset_type(self):
        account = self._account('Purchases', 'Expense', 'SuppliesMaterials')
        message = validate_control_account_for_inventory_item(account, 'inventory_asset_account')
        self.assertIn('Inventory Asset', message)
        self.assertIn('Other Current Asset', message)

    def test_valid_cogs_account(self):
        account = self._account('COGS', 'Cost of Goods Sold', 'SuppliesMaterialsCogs')
        self.assertTrue(account_matches_inventory_requirement(account, 'cost_of_goods_sold_account'))
        self.assertIsNone(
            validate_control_account_for_inventory_item(account, 'cost_of_goods_sold_account')
        )

    def test_rejects_operating_expense_for_cogs_mapping(self):
        account = self._account('Purchases', 'Expense', 'SuppliesMaterials')
        message = validate_control_account_for_inventory_item(account, 'cost_of_goods_sold_account')
        self.assertIn('Cost of Goods Sold', message)
        self.assertIn('Supplies and Materials', message)

    def test_validate_inventory_part_account_ids_collects_errors(self):
        income = self._account('Sales', 'Income', 'SalesOfProductIncome')
        expense = self._account('Purchases', 'Expense', 'SuppliesMaterials')
        asset = self._account('Inventory Asset', 'Other Current Asset', 'Inventory')

        def fake_fetch(_client, account_id):
            mapping = {
                '1': income,
                '2': expense,
                '3': asset,
            }
            return mapping[account_id]

        with self.subTest('invalid expense account'):
            from apps.quickbooks_online import account_requirements

            original = account_requirements.fetch_qbo_account
            account_requirements.fetch_qbo_account = lambda client, account_id: fake_fetch(client, account_id)
            try:
                message = validate_inventory_part_account_ids(
                    MagicMock(),
                    income_id='1',
                    expense_id='2',
                    asset_id='3',
                )
            finally:
                account_requirements.fetch_qbo_account = original

            self.assertIn('Cost of Goods Sold', message)
            self.assertNotIn('Inventory Asset', message)


class InvStartDateSyncTests(TestCase):
    def test_new_item_uses_local_inventory_start_date(self):
        from apps.quickbooks_online.item_sync import _inv_start_date_for_sync

        part = MagicMock()
        part.inventory_start_date = date(2026, 1, 15)
        part.created_at = None
        result = _inv_start_date_for_sync(
            part,
            is_new_qbo_item=True,
            previous_qbo_type=None,
            qb_item=MagicMock(),
        )
        self.assertEqual(result, date(2026, 1, 15))

    def test_existing_inventory_item_corrects_future_start_date(self):
        from django.utils import timezone as dj_timezone

        from apps.quickbooks_online.item_sync import _inv_start_date_for_sync

        qb_item = MagicMock()
        qb_item.InvStartDate = (dj_timezone.now().date() + timedelta(days=1)).isoformat()
        part = MagicMock(inventory_start_date=date(2026, 1, 1), created_at=None)
        with patch('apps.quickbooks_online.item_sync.timezone') as mock_tz:
            mock_tz.now.return_value = dj_timezone.datetime(2026, 6, 21, tzinfo=dt_timezone.utc)
            result = _inv_start_date_for_sync(
                part,
                is_new_qbo_item=False,
                previous_qbo_type='Inventory',
                qb_item=qb_item,
            )
        self.assertEqual(result, date(2026, 1, 1))

    def test_existing_inventory_item_omits_valid_inv_start_date(self):
        from apps.quickbooks_online.item_sync import _inv_start_date_for_sync

        qb_item = MagicMock()
        qb_item.InvStartDate = '2024-06-01'
        result = _inv_start_date_for_sync(
            MagicMock(inventory_start_date=date(2026, 1, 1), created_at=None),
            is_new_qbo_item=False,
            previous_qbo_type='Inventory',
            qb_item=qb_item,
        )
        self.assertIsNone(result)

    def test_conversion_uses_part_start_date_not_future(self):
        from django.utils import timezone as dj_timezone

        from apps.quickbooks_online.item_sync import _inv_start_date_for_sync

        with patch('apps.quickbooks_online.item_sync.timezone') as mock_tz:
            mock_tz.now.return_value = dj_timezone.datetime(2026, 6, 21, tzinfo=dt_timezone.utc)
            result = _inv_start_date_for_sync(
                MagicMock(inventory_start_date=date(2026, 1, 1), created_at=None),
                is_new_qbo_item=False,
                previous_qbo_type='NonInventory',
                qb_item=MagicMock(InvStartDate=None),
            )
        self.assertEqual(result, date(2026, 1, 1))


class EnsureInventoryStartDateTests(TestCase):
    @patch('apps.quickbooks_online.item_sync.sync_part')
    @patch('apps.quickbooks_online.item_sync.QBItem')
    @patch('apps.quickbooks_online.item_sync.QBOMapping')
    @patch('apps.quickbooks_online.item_sync.ContentType')
    def test_lowers_future_inv_start_date_before_txn(
        self, mock_ct, mock_mapping_cls, mock_qb_item_cls, mock_sync_part
    ):
        from apps.quickbooks_online.item_sync import ensure_inventory_start_on_or_before_txn_date

        part = MagicMock()
        part.pk = 5
        part.item_type = 'inventory'
        part.part_number = 'CD-PART-0001'
        part.inventory_start_date = None
        part.created_at = MagicMock(date=lambda: date(2026, 6, 1))

        service = MagicMock()
        service.get_client.return_value = MagicMock()

        mapping = MagicMock()
        mapping.qbo_id = '99'
        mapping.qbo_sync_token = '1'

        qb_item = MagicMock()
        qb_item.InvStartDate = '2026-06-22'
        qb_item.SyncToken = '2'
        mock_qb_item_cls.get.return_value = qb_item

        mock_mapping_cls.objects.filter.return_value.exclude.return_value.first.return_value = mapping
        ensure_inventory_start_on_or_before_txn_date(service, part, date(2026, 6, 21))

        self.assertEqual(qb_item.InvStartDate, '2026-06-01')
        service._save_qb.assert_called_once()


class EffectiveSalesTxnDateTests(TestCase):
    @patch('apps.quickbooks_online.item_sync._qbo_inv_start_date_for_part')
    @patch('apps.quickbooks_online.item_sync._prepare_inventory_parts_for_txn_date')
    def test_raises_txn_date_when_qbo_start_is_later(self, mock_prepare, mock_inv_start):
        from apps.quickbooks_online.item_sync import effective_sales_txn_date

        part = MagicMock()
        part.pk = 1
        part.item_type = 'inventory'
        line = MagicMock(part=part)

        mock_inv_start.return_value = date(2026, 6, 22)
        service = MagicMock()

        result = effective_sales_txn_date(service, [line], date(2026, 6, 21))
        self.assertEqual(result, date(2026, 6, 22))
        mock_prepare.assert_called_once()
