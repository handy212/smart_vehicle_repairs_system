"""Tests for QBO inventory adjustment sync policy."""

from decimal import Decimal
from unittest.mock import MagicMock

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.branches.models import Branch
from apps.inventory.models import InventoryTransaction, Part, PartCategory
from apps.quickbooks_online.inventory_adjustment_sync import QBO_INVENTORY_ADJUSTMENT_TYPES
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
