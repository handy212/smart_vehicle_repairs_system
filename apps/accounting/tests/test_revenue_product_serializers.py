"""Tests for income category (RevenueProduct) API serializers."""

from django.test import TestCase

from apps.accounting.models import RevenueProduct
from apps.accounting.revenue_product_serializers import RevenueProductSerializer


class RevenueProductSerializerTests(TestCase):
    def test_rejects_invalid_owner_account_code(self):
        serializer = RevenueProductSerializer(
            data={
                'code': 'test_invalid_code',
                'name': 'Test',
                'owner_account_code': '658x',
                'revenue_class': 'service',
                'default_billing_line_type': 'other',
            },
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('owner_account_code', serializer.errors)

    def test_roadside_service_type_must_be_unique(self):
        RevenueProduct.objects.create(
            code='aa_towing',
            name='AA Towing',
            revenue_class='aa_roadside',
            roadside_service_type='towing',
        )
        serializer = RevenueProductSerializer(
            data={
                'code': 'aa_towing_dup',
                'name': 'Duplicate Towing',
                'revenue_class': 'aa_roadside',
                'default_billing_line_type': 'other',
                'roadside_service_type': 'towing',
            },
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('roadside_service_type', serializer.errors)

    def test_list_serializer_includes_catalog_part_number(self):
        from apps.accounting.revenue_product_serializers import RevenueProductListSerializer
        from apps.inventory.models import Part, PartCategory

        category = PartCategory.objects.create(name='Service Catalog')
        part = Part.objects.create(
            part_number='REV-TEST',
            name='Test Service Item',
            category=category,
            item_type='service',
            unit='ea',
            quantity_in_stock=0,
            reorder_point=0,
            minimum_stock=0,
        )
        product = RevenueProduct.objects.create(
            code='service_test',
            name='Test Service',
            catalog_part=part,
            revenue_class='service',
        )
        data = RevenueProductListSerializer(product).data
        self.assertEqual(data['catalog_part'], part.id)
        self.assertEqual(data['catalog_part_number'], 'REV-TEST')
