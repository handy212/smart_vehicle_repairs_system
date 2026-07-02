from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.accounts.permissions import HasAnyPermission

from ..job_type_serializers import (
    JobTypeListSerializer,
    JobTypeSerializer,
    JobTypeWriteSerializer,
    WorkflowProfileSerializer,
)
from ..job_types import JobType, WorkflowProfile


class WorkflowProfileViewSet(viewsets.ReadOnlyModelViewSet):
    """List workflow profiles used by job types."""

    queryset = WorkflowProfile.objects.filter(is_active=True).order_by('sort_order', 'name')
    serializer_class = WorkflowProfileSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'code'


class JobTypeViewSet(viewsets.ModelViewSet):
    """CRUD for configurable work order job types."""

    queryset = JobType.objects.select_related(
        'workflow_profile',
        'default_service_type',
        'default_service_bundle',
        'default_revenue_product',
    ).order_by('sort_order', 'name')
    permission_classes = [IsAuthenticated]
    lookup_field = 'code'
    filterset_fields = ['category', 'is_active', 'allows_bundle', 'workflow_profile']
    search_fields = ['name', 'code', 'description']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == 'list' and self.request.query_params.get('active_only', 'true').lower() != 'false':
            qs = qs.filter(is_active=True)
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return JobTypeListSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return JobTypeWriteSerializer
        return JobTypeSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), HasAnyPermission(['manage_workorders'])]
        return super().get_permissions()

    def perform_destroy(self, instance):
        if instance.is_predefined:
            instance.is_active = False
            instance.save(update_fields=['is_active', 'updated_at'])
        else:
            instance.delete()
