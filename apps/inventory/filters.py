import django_filters
from django.db.models import F, Q

from .models import StockItem


class StockItemFilter(django_filters.FilterSet):
    """Filters for stock items; low/out-of-stock are computed, not DB columns."""

    is_low_stock = django_filters.BooleanFilter(method='filter_is_low_stock')
    is_out_of_stock = django_filters.BooleanFilter(method='filter_is_out_of_stock')

    class Meta:
        model = StockItem
        fields = ['branch']

    def filter_is_low_stock(self, queryset, name, value):
        if value is None:
            return queryset
        condition = Q(quantity_in_stock__lte=F('reorder_point'))
        return queryset.filter(condition) if value else queryset.exclude(condition)

    def filter_is_out_of_stock(self, queryset, name, value):
        if value is None:
            return queryset
        if value:
            return queryset.filter(quantity_in_stock=0)
        return queryset.filter(quantity_in_stock__gt=0)
