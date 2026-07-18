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

class TechnicianTimeLogViewSet(WorkOrderChildQuerysetMixin, WorkOrderRelatedPermissionMixin, viewsets.ModelViewSet):
    """Technician Time Log management"""
    queryset = TechnicianTimeLog.objects.all().select_related('work_order', 'task', 'technician')

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return workorder_read_permissions()
        return workorder_module_permissions() + [
            HasAnyPermission([
                'clock_work_time',
                'edit_workorders',
                'update_workorder_status',
            ])(),
        ]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = TechnicianTimeLogFilter
    ordering_fields = ['clock_in', 'created_at']
    ordering = ['-clock_in']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return TechnicianTimeLogCreateSerializer
        return TechnicianTimeLogSerializer
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get current user's active time log (not clocked out)"""
        active_log = self.get_queryset().filter(
            technician=request.user,
            clock_out__isnull=True
        ).first()
        
        if not active_log:
            return Response(None, status=status.HTTP_200_OK)
            
        serializer = self.get_serializer(active_log)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='my-recent')
    def my_recent(self, request):
        """Recent time logs for the authenticated technician (mobile app)."""
        logs = (
            self.get_queryset()
            .filter(technician=request.user)
            .order_by('-clock_in')[:25]
        )
        serializer = self.get_serializer(logs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='clock-in')
    def clock_in(self, request):
        """Clock in using server time (mobile-friendly)."""
        serializer = TechnicianTimeLogCreateSerializer(
            data={
                'work_order': request.data.get('work_order'),
                'task': request.data.get('task'),
                'description': request.data.get('description') or '',
            },
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(
            TechnicianTimeLogSerializer(serializer.instance).data,
            status=status.HTTP_201_CREATED,
        )
    
    def perform_create(self, serializer):
        """Auto-populate technician and hourly_rate if not provided"""
        data = {}
        if not serializer.validated_data.get('technician'):
            data['technician'] = self.request.user
            
        if not serializer.validated_data.get('hourly_rate'):
            # Get hourly rate from user profile
            rate = getattr(self.request.user, 'hourly_rate', 0)
            data['hourly_rate'] = rate or 0
            
        serializer.save(**data)

    @action(detail=True, methods=['post'])
    def clock_out(self, request, pk=None):
        """Clock out of time log"""
        time_log = self.get_object()
        
        if time_log.clock_out:
            return Response(
                {'error': 'Already clocked out'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = TechnicianTimeLogClockOutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        time_log.clock_out = serializer.validated_data['clock_out']
        if serializer.validated_data.get('notes'):
            time_log.notes = serializer.validated_data['notes']
        
        time_log.save()
        
        return Response(TechnicianTimeLogSerializer(time_log).data)
