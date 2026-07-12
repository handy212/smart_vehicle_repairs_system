"""Serializers for revenue product reference data."""

import re

from django.db.models import Q
from rest_framework import serializers

from apps.accounting.models import RevenueProduct

_OWNER_ACCOUNT_CODE_RE = re.compile(
    r'^[0-9]+(?:[.\-][0-9a-z]+|[a-z]{1,4})?$',
    re.IGNORECASE,
)


class RevenueProductSerializer(serializers.ModelSerializer):
    catalog_part_number = serializers.CharField(
        source='catalog_part.part_number', read_only=True, default=None,
    )
    catalog_part_selling_price = serializers.DecimalField(
        source='catalog_part.selling_price',
        max_digits=10,
        decimal_places=2,
        read_only=True,
        default=None,
    )
    branch_name = serializers.CharField(source='branch.name', read_only=True, default=None)

    class Meta:
        model = RevenueProduct
        fields = [
            'id', 'code', 'name', 'branch', 'branch_name',
            'owner_account_code', 'owner_account_label',
            'revenue_class', 'default_billing_line_type',
            'default_unit_price',
            'catalog_part', 'catalog_part_number', 'catalog_part_selling_price',
            'roadside_service_type',
            'is_active', 'sort_order',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at',
            'catalog_part_number', 'catalog_part_selling_price', 'branch_name',
        ]

    def validate_owner_account_code(self, value):
        code = (value or '').strip()
        if not code:
            return ''
        if not _OWNER_ACCOUNT_CODE_RE.match(code):
            raise serializers.ValidationError(
                'Use a numeric income account code (e.g. 658, 658K, or 118.4).',
            )
        return code

    def _branch_scope_q(self, branch):
        if branch is None:
            return Q(branch__isnull=True)
        branch_id = branch.id if hasattr(branch, 'id') else branch
        return Q(branch_id=branch_id)

    def validate(self, data):
        branch = data.get('branch')
        if self.instance is not None and branch is None and 'branch' not in data:
            branch = self.instance.branch

        code = data.get('code') or (self.instance.code if self.instance else None)
        if code:
            qs = RevenueProduct.objects.filter(code=code).filter(self._branch_scope_q(branch))
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                scope = 'this branch' if branch else 'company-wide'
                raise serializers.ValidationError(
                    {'code': f'An income category with code "{code}" already exists ({scope}).'},
                )
        return data

    def validate_roadside_service_type(self, value):
        service_type = (value or '').strip() or None
        if not service_type:
            return None
        branch = None
        if self.instance:
            branch = self.instance.branch
        if hasattr(self, 'initial_data') and 'branch' in self.initial_data:
            from apps.branches.models import Branch
            raw = self.initial_data.get('branch')
            if raw:
                branch = Branch.objects.filter(pk=raw).first()

        qs = RevenueProduct.objects.filter(roadside_service_type=service_type)
        qs = qs.filter(self._branch_scope_q(branch))
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                'Another income category already uses this roadside service type for the same scope.',
            )
        return service_type

    def create(self, validated_data):
        product = super().create(validated_data)
        self._sync_catalog_price(product, validated_data.get('default_unit_price'))
        return product

    def update(self, instance, validated_data):
        product = super().update(instance, validated_data)
        if 'default_unit_price' in validated_data:
            self._sync_catalog_price(product, validated_data.get('default_unit_price'))
        return product

    def _sync_catalog_price(self, product, unit_price):
        if unit_price and unit_price > 0 and product.catalog_part_id:
            part = product.catalog_part
            if part.selling_price != unit_price:
                part.selling_price = unit_price
                part.save(update_fields=['selling_price', 'updated_at'])


class RevenueProductListSerializer(serializers.ModelSerializer):
    catalog_part_number = serializers.CharField(
        source='catalog_part.part_number', read_only=True, default=None,
    )
    catalog_part_selling_price = serializers.DecimalField(
        source='catalog_part.selling_price',
        max_digits=10,
        decimal_places=2,
        read_only=True,
        default=None,
    )
    branch_name = serializers.CharField(source='branch.name', read_only=True, default=None)

    class Meta:
        model = RevenueProduct
        fields = [
            'id', 'code', 'name', 'branch', 'branch_name',
            'owner_account_code', 'owner_account_label',
            'revenue_class', 'default_billing_line_type',
            'default_unit_price',
            'catalog_part', 'catalog_part_number', 'catalog_part_selling_price',
            'roadside_service_type',
            'is_active', 'sort_order',
        ]
