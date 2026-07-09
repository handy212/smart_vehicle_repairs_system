"""API views for owner-aligned revenue products."""

from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import HasPermission, IsModuleEnabled
from apps.billing.revenue_resolution import scope_revenue_products_for_branch
from apps.inventory.models import Part

from .models import RevenueProduct
from .revenue_product_serializers import RevenueProductListSerializer, RevenueProductSerializer
from apps.accounting.views import get_accounting_branch_id


def scope_revenue_products_queryset(queryset, request):
    """Branch overrides + company-wide defaults for dropdowns; admin may request all."""
    branch_param = request.query_params.get('branch')
    if branch_param == 'all':
        return queryset
    if branch_param:
        try:
            branch_id = int(branch_param)
        except (TypeError, ValueError):
            branch_id = get_accounting_branch_id(request)
        return scope_revenue_products_for_branch(queryset, branch_id)
    branch_id = get_accounting_branch_id(request)
    if branch_id is None:
        return queryset.filter(branch__isnull=True)
    return scope_revenue_products_for_branch(queryset, branch_id)


class RevenueProductViewSet(viewsets.ModelViewSet):
    queryset = RevenueProduct.objects.select_related('catalog_part', 'branch').order_by('sort_order', 'name')
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['revenue_class', 'is_active', 'owner_account_code']
    search_fields = ['code', 'name', 'owner_account_code', 'owner_account_label']
    ordering_fields = ['sort_order', 'name', 'owner_account_code', 'created_at']
    ordering = ['sort_order', 'name']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action in ('list', 'retrieve', 'catalog_parts'):
            return scope_revenue_products_queryset(qs, self.request)
        return qs

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'catalog_parts'):
            return [
                IsAuthenticated(),
                IsModuleEnabled('accounting'),
                HasPermission('view_accounting'),
            ]
        return [
            IsAuthenticated(),
            IsModuleEnabled('accounting'),
            HasPermission('manage_accounting_periods'),
        ]

    def get_serializer_class(self):
        if self.action == 'list':
            return RevenueProductListSerializer
        return RevenueProductSerializer

    @action(detail=False, methods=['get'], url_path='catalog-parts')
    def catalog_parts(self, request):
        """Service catalog parts usable as QBO item templates (accounting-scoped)."""
        parts = (
            Part.objects.filter(
                is_active=True,
                item_type='service',
                part_number__startswith='REV-',
            )
            .order_by('part_number')[:100]
        )
        return Response(
            [
                {
                    'id': part.id,
                    'part_number': part.part_number,
                    'name': part.name,
                }
                for part in parts
            ]
        )
