import django_filters
from .models import WorkOrder, TechnicianTimeLog


class CharInFilter(django_filters.BaseInFilter, django_filters.CharFilter):
    pass


class WorkOrderFilter(django_filters.FilterSet):
    """Custom filterset for Work Orders to handle foreign key filters properly"""
    
    # Define filters explicitly to avoid validation issues
    primary_technician = django_filters.NumberFilter(field_name='primary_technician__id')
    customer = django_filters.NumberFilter(field_name='customer__id')
    vehicle = django_filters.NumberFilter(field_name='vehicle__id')
    status = CharInFilter(field_name='status', lookup_expr='in')
    job_type = django_filters.CharFilter(field_name='job_type__code')
    workflow_profile = django_filters.CharFilter(field_name='job_type__workflow_profile__code')
    maintenance_type = django_filters.CharFilter(field_name='maintenance_type')
    
    class Meta:
        model = WorkOrder
        fields = {
            'priority': ['exact'],
            'is_customer_waiting': ['exact'],
            'requires_approval': ['exact'],
            'approved_by_customer': ['exact'],
            'quality_check_required': ['exact'],
            'quality_check_completed': ['exact'],
            'is_warranty': ['exact'],
            'is_recall': ['exact'],
        }


class TechnicianTimeLogFilter(django_filters.FilterSet):
    """Filter for Technician Time Logs"""
    technician = django_filters.NumberFilter(field_name='technician__id')
    work_order = django_filters.NumberFilter(field_name='work_order__id')
    
    class Meta:
        model = TechnicianTimeLog
        fields = {
            'is_billable': ['exact'],
            'is_approved': ['exact'],
            'clock_in': ['gte', 'lte', 'exact'],
        }
