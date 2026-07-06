from decimal import Decimal

from django.test import TestCase

from apps.accounts.models import User
from apps.branches.models import Branch
from apps.inventory.models import Part, PartCategory, StockItem
from apps.inventory.serializers import PartCreateSerializer, PartUpdateSerializer
from apps.inventory.services import InventoryService
from rest_framework.test import APIRequestFactory


class PartInventoryCreateTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='part-inv-admin',
            email='part-inv@test.com',
            password='password',
            role='admin',
        )
        self.branch = Branch.objects.create(
            name='Inv Branch',
            code='INV',
            phone='555-9200',
            address='9 Inv St',
            city='Inv',
            state='PA',
            zip_code='92009',
            created_by=self.user,
        )
        self.category = PartCategory.objects.create(name='Filters')

    def _create_part_via_serializer(self, **overrides):
        factory = APIRequestFactory()
        request = factory.post('/api/inventory/parts/')
        request.user = self.user
        request.active_branch = self.branch

        data = {
            'part_number': 'FLT-001',
            'name': 'Oil Filter',
            'category': self.category.id,
            'branch': self.branch.id,
            'unit': 'piece',
            'cost_price': '10.00',
            'selling_price': '20.00',
            'reorder_point': 5,
            'reorder_quantity': 10,
            'minimum_stock': 2,
            'item_type': 'inventory',
            'initial_quantity': 12,
            'is_active': True,
            'is_taxable': True,
            'is_core': False,
        }
        data.update(overrides)

        serializer = PartCreateSerializer(data=data, context={'request': request})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        return serializer.save()

    def test_inventory_part_create_creates_stock_item_with_opening_qty(self):
        part = self._create_part_via_serializer()

        self.assertEqual(part.item_type, 'inventory')
        stock = StockItem.objects.get(part=part, branch=self.branch)
        self.assertEqual(stock.quantity_in_stock, 12)

    def test_non_inventory_part_skips_stock_item(self):
        part = self._create_part_via_serializer(item_type='non_inventory', initial_quantity=5)

        self.assertFalse(StockItem.objects.filter(part=part).exists())

    def test_record_transaction_rejects_non_inventory_stock_moves(self):
        part = self._create_part_via_serializer(item_type='non_inventory', initial_quantity=0)
        with self.assertRaises(ValueError) as ctx:
            InventoryService.record_transaction(
                part,
                1,
                'adjustment',
                self.user,
                branch=self.branch,
                reason='Should fail',
            )
        self.assertIn('does not track stock', str(ctx.exception).lower())

    def test_cannot_demote_inventory_part_with_stock(self):
        part = self._create_part_via_serializer()
        factory = APIRequestFactory()
        request = factory.patch(f'/api/inventory/parts/{part.id}/')
        request.user = self.user
        serializer = PartUpdateSerializer(
            instance=part,
            data={'item_type': 'service'},
            context={'request': request},
            partial=True,
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('item_type', serializer.errors)
