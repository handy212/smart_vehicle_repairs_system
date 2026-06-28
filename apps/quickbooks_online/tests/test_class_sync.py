"""Tests for QuickBooks Class sync helpers."""
from types import SimpleNamespace
from unittest.mock import MagicMock

from django.test import SimpleTestCase

from apps.quickbooks_online.class_sync_helpers import (
    resolve_ap_line_class_id,
    resolve_sales_line_class_id,
)


class ResolveSalesLineClassTests(SimpleTestCase):
    def test_revenue_product_mapping_takes_precedence(self):
        mapping_service = MagicMock()
        mapping_service.resolve_qbo_class_id.side_effect = lambda kind, key: {
            ('revenue_product_class', 'labor_mechanical'): '101',
            ('income_class', 'labor'): '999',
        }.get((kind, key))

        line = SimpleNamespace(
            revenue_product=SimpleNamespace(code='labor_mechanical'),
            item_type='labor',
        )
        self.assertEqual(resolve_sales_line_class_id(mapping_service, line), '101')

    def test_falls_back_to_line_type(self):
        mapping_service = MagicMock()
        mapping_service.resolve_qbo_class_id.return_value = '202'

        line = SimpleNamespace(revenue_product=None, item_type='part')
        self.assertEqual(resolve_sales_line_class_id(mapping_service, line), '202')
        mapping_service.resolve_qbo_class_id.assert_called_with('income_class', 'part')


class ResolveApLineClassTests(SimpleTestCase):
    def test_inventory_vs_expense_keys(self):
        mapping_service = MagicMock()
        mapping_service.resolve_qbo_class_id.side_effect = lambda kind, key: key

        self.assertEqual(
            resolve_ap_line_class_id(mapping_service, is_inventory_line=True),
            'inventory',
        )
        self.assertEqual(
            resolve_ap_line_class_id(mapping_service, is_inventory_line=False),
            'expense',
        )
