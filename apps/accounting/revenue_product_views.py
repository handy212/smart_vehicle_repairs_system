"""API views for owner-aligned revenue products."""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import HasPermission, IsModuleEnabled
from apps.inventory.models import Part

from .models import RevenueProduct
from .revenue_product_serializers import RevenueProductListSerializer, RevenueProductSerializer


class RevenueProductViewSet(viewsets.ModelViewSet):
    queryset = RevenueProduct.objects.select_related('catalog_part').order_by('sort_order', 'name')
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['revenue_class', 'is_active', 'owner_account_code']
    search_fields = ['code', 'name', 'owner_account_code', 'owner_account_label']
    ordering_fields = ['sort_order', 'name', 'owner_account_code', 'created_at']
    ordering = ['sort_order', 'name']

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
