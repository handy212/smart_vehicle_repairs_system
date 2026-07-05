"""Read-only API for AI audit logs."""
from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from apps.accounts.permissions import HasAnyPermission

from .models import AIAuditLog
from .serializers import AIAuditLogSerializer

AI_AUDIT_PERMISSIONS = [
    IsAuthenticated,
    HasAnyPermission(['view_audit_logs', 'manage_settings']),
]


class AIAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AIAuditLog.objects.select_related('user').all()
    serializer_class = AIAuditLogSerializer
    permission_classes = AI_AUDIT_PERMISSIONS
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['feature', 'success', 'user']
    search_fields = ['prompt_summary', 'output_summary', 'error_message', 'user__email']
    ordering_fields = ['created_at', 'feature']
    ordering = ['-created_at']
