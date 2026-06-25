"""Serializers for revenue product reference data."""

from rest_framework import serializers

from apps.accounting.models import RevenueProduct


class RevenueProductSerializer(serializers.ModelSerializer):
    catalog_part_number = serializers.CharField(
        source='catalog_part.part_number', read_only=True, default=None,
    )

    class Meta:
        model = RevenueProduct
        fields = [
            'id', 'code', 'name',
            'owner_account_code', 'owner_account_label',
            'revenue_class', 'default_billing_line_type',
            'catalog_part', 'catalog_part_number',
            'roadside_service_type',
            'is_active', 'sort_order',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'catalog_part_number']


class RevenueProductListSerializer(serializers.ModelSerializer):
    class Meta:
        model = RevenueProduct
        fields = [
            'id', 'code', 'name',
            'owner_account_code', 'owner_account_label',
            'revenue_class', 'default_billing_line_type',
            'is_active', 'sort_order',
        ]
