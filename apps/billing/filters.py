import django_filters
from apps.billing.models import Invoice, Estimate, CreditNote, Payment

class InvoiceFilter_branch(django_filters.FilterSet):
    branch = django_filters.NumberFilter(field_name='branch__id')
    min_date = django_filters.DateFilter(field_name='invoice_date', lookup_expr='gte')
    max_date = django_filters.DateFilter(field_name='invoice_date', lookup_expr='lte')
    min_amount = django_filters.NumberFilter(field_name='total', lookup_expr='gte')
    max_amount = django_filters.NumberFilter(field_name='total', lookup_expr='lte')

    class Meta:
        model = Invoice
        fields = ['status', 'customer', 'branch']

class EstimateFilter_branch(django_filters.FilterSet):
    branch = django_filters.NumberFilter(field_name='branch__id')
    status = django_filters.CharFilter(lookup_expr='iexact')
    
    class Meta:
        model = Estimate
        fields = ['status', 'customer', 'branch']

class CreditNoteFilter_branch(django_filters.FilterSet):
    branch = django_filters.NumberFilter(field_name='branch__id')
    
    class Meta:
        model = CreditNote
        fields = ['status', 'customer', 'branch']

class PaymentFilter_branch(django_filters.FilterSet):
    branch = django_filters.NumberFilter(field_name='branch__id')
    
    class Meta:
        model = Payment
        fields = ['status', 'customer', 'branch', 'payment_method']
