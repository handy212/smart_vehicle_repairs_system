from rest_framework import viewsets, mixins, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from apps.accounts.permissions import (
    HasAnyPermission,
    HasPermission,
    IsModuleEnabled,
    filter_workorders_for_user,
    user_has_permission,
)
from apps.workorders.permission_utils import (
    WorkOrderRelatedPermissionMixin,
    workorder_edit_permissions,
    workorder_module_permissions,
    workorder_read_permissions,
    workorder_status_change_permissions,
    workorder_task_workflow_permissions,
)
from rest_framework.exceptions import ValidationError as DRFValidationError
from django.core.exceptions import ValidationError
from django.http import Http404
from django.utils import timezone
from django.db.models import Q, Sum, Count, F, Prefetch
from django_filters.rest_framework import DjangoFilterBackend
from datetime import timedelta
from decimal import Decimal, InvalidOperation

# Notification triggers
from apps.notifications_app.triggers import notification_triggers

from apps.branches.utils import resolve_branch, filter_queryset_for_user_branches
from apps.billing.models import Invoice
from apps.inspections.models import VehicleInspection

from ..models import (
    WorkOrder, ServiceTask, ServiceTaskType, WorkOrderPart,
    TechnicianTimeLog, WorkOrderNote, WorkOrderPhoto
)
from ..serializers import (
    WorkOrderListSerializer, WorkOrderDetailSerializer,
    WorkOrderCreateSerializer, WorkOrderUpdateSerializer,
    ServiceTaskSerializer, ServiceTaskCreateSerializer, ServiceTaskTypeSerializer,
    WorkOrderPartSerializer, WorkOrderPartCreateSerializer,
    TechnicianTimeLogSerializer, TechnicianTimeLogCreateSerializer,
    TechnicianTimeLogClockOutSerializer,
    WorkOrderNoteSerializer, WorkOrderNoteCreateSerializer,
    WorkOrderPhotoSerializer, WorkOrderPhotoCreateSerializer,
    TechnicianWorkloadSerializer, WorkOrderStatusSummarySerializer,
    PublicWorkOrderSerializer
)


from ..filters import WorkOrderFilter, TechnicianTimeLogFilter


from ..mixins.document_mixins import WorkOrderDocumentMixin
from ..mixins.transition_mixins import WorkOrderStateTransitionMixin
from ..queryset_mixins import WorkOrderChildQuerysetMixin

class WorkOrderNoteViewSet(WorkOrderChildQuerysetMixin, WorkOrderRelatedPermissionMixin, viewsets.ModelViewSet):
    """Work Order Note management"""
    queryset = WorkOrderNote.objects.all().select_related('work_order', 'created_by')

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return workorder_read_permissions()
        return workorder_module_permissions() + [
            HasAnyPermission(['add_workorder_notes', 'edit_workorder_notes', 'edit_workorders'])(),
        ]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['work_order', 'note_type', 'is_important', 'is_customer_visible']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return WorkOrderNoteCreateSerializer
        return WorkOrderNoteSerializer


class WorkOrderPhotoViewSet(WorkOrderChildQuerysetMixin, WorkOrderRelatedPermissionMixin, viewsets.ModelViewSet):
    """Work Order Photo management"""
    queryset = WorkOrderPhoto.objects.all().select_related('work_order', 'taken_by')
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['work_order', 'photo_type']

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return workorder_read_permissions()
        # Technicians document repairs with photos without full WO edit access.
        if self.action == 'create':
            return workorder_module_permissions() + [
                HasAnyPermission([
                    'edit_workorders',
                    'add_workorder_notes',
                    'clock_work_time',
                ])(),
            ]
        return workorder_edit_permissions()
    
    def get_serializer_class(self):
        if self.action == 'create':
            return WorkOrderPhotoCreateSerializer
        return WorkOrderPhotoSerializer

    @action(detail=True, methods=['post'])
    def analyze_damage(self, request, pk=None):
        """Analyze photo for damage using AI"""
        photo = self.get_object()
        from apps.core.services.ai_service import AIService
        
        try:
            analysis = AIService.analyze_photo_damage(photo.photo.url)
            return Response(analysis)
        except Exception as e:
            return Response({'error': f"AI Analysis failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
