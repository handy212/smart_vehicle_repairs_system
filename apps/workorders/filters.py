import django_filters
from .models import WorkOrder


class WorkOrderFilter(django_filters.FilterSet):
    """Custom filterset for Work Orders to handle foreign key filters properly"""
    
    # Define filters explicitly to avoid validation issues
    primary_technician = django_filters.NumberFilter(field_name='primary_technician__id')
    customer = django_filters.NumberFilter(field_name='customer__id')
    vehicle = django_filters.NumberFilter(field_name='vehicle__id')
    
    class Meta:
        model = WorkOrder
        fields = {
            'status': ['exact'],
            'priority': ['exact'],
            'is_customer_waiting': ['exact'],
            'requires_approval': ['exact'],
            'approved_by_customer': ['exact'],
            'quality_check_required': ['exact'],
            'quality_check_completed': ['exact'],
            'is_warranty': ['exact'],
            'is_recall': ['exact'],
        }
