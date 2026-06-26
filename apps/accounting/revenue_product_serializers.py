"""Serializers for revenue product reference data."""

import re

from rest_framework import serializers

from apps.accounting.models import RevenueProduct

_OWNER_ACCOUNT_CODE_RE = re.compile(r'^[0-9]+(?:[.\-][0-9a-z]+)?$', re.IGNORECASE)


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

    def validate_owner_account_code(self, value):
        code = (value or '').strip()
        if not code:
            return ''
        if not _OWNER_ACCOUNT_CODE_RE.match(code):
            raise serializers.ValidationError(
                'Use a numeric income account code (e.g. 658 or 118.4).',
            )
        return code

    def validate_roadside_service_type(self, value):
        service_type = (value or '').strip() or None
        if not service_type:
            return None
        qs = RevenueProduct.objects.filter(roadside_service_type=service_type)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                'Another income category already uses this roadside service type.',
            )
        return service_type


class RevenueProductListSerializer(serializers.ModelSerializer):
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
        ]
