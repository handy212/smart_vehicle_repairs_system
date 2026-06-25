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

class ServiceTaskViewSet(WorkOrderChildQuerysetMixin, WorkOrderRelatedPermissionMixin, viewsets.ModelViewSet):
    """Service Task management"""
    queryset = (
        ServiceTask.objects.all()
        .select_related('work_order', 'assigned_to', 'revenue_product')
        .prefetch_related('time_logs')
    )
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['work_order', 'status', 'task_type', 'assigned_to']
    ordering_fields = ['sequence_order', 'created_at']
    ordering = ['work_order', 'sequence_order']

    TASK_WORKFLOW_ACTIONS = frozenset({'start', 'complete'})

    def get_permissions(self):
        if getattr(self, 'action', None) in self.TASK_WORKFLOW_ACTIONS:
            return workorder_task_workflow_permissions()
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return workorder_read_permissions()
        return workorder_edit_permissions()
    
    def get_serializer_class(self):
        if self.action == 'create':
            return ServiceTaskCreateSerializer
        return ServiceTaskSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task = serializer.save()
        output = ServiceTaskSerializer(task, context=self.get_serializer_context())
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=False, methods=['get'])
    def task_types(self, request):
        """Return available service task types."""
        task_types = ServiceTaskType.objects.filter(is_active=True).order_by('sort_order', 'name')
        if task_types.exists():
            serializer = ServiceTaskTypeSerializer(task_types, many=True)
            return Response(serializer.data)
        return Response([
            {'value': value, 'label': label, 'code': value, 'name': label, 'default_labor_rate': '0.00', 'is_active': True}
            for value, label in ServiceTask.TASK_TYPE_CHOICES
        ])

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """Start task and auto-clock in technician"""
        task = self.get_object()
        
        # Check if parts for this specific task are available
        unavailable_parts = list(
            task.parts.exclude(status__in=['ready', 'installed']).values_list('part_name', flat=True)
        )
                
        if unavailable_parts:
            return Response(
                {'error': f"Cannot start task. Parts must be allocated to the workshop first: {', '.join(unavailable_parts)}"},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Update task status if not already in progress
        update_task = False
        if task.status != 'in_progress':
            task.status = 'in_progress'
            task.started_at = timezone.now()
            # Assign to current user if not assigned
            if not task.assigned_to and request.user.role in ['technician', 'manager']:
                task.assigned_to = request.user
            update_task = True
        
        if update_task:
            task.save()
        
        # Auto-create time log (Clock In) for the user
        user = request.user
        if user.role in ['technician', 'manager']:
            # Check if already clocked in to this task
            existing_log = TechnicianTimeLog.objects.filter(
                task=task,
                technician=user,
                clock_out__isnull=True
            ).first()
            
            if not existing_log:
                TechnicianTimeLog.objects.create(
                    work_order=task.work_order,
                    task=task,
                    technician=user,
                    clock_in=timezone.now(),
                    is_billable=True, # Default to billable
                    description=f"Auto-started task: {task.description}"
                )
        
        serializer = self.get_serializer(task)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Complete task and auto-clock out technician"""
        task = self.get_object()
        actual_hours = request.data.get('actual_hours')
        notes = request.data.get('notes', '')
        completion_time = timezone.now()

        # Handle Time Logs (Clock Out)
        user = request.user
        if user.role in ['technician', 'manager']:
            # Find open time logs for this user/task
            open_logs = TechnicianTimeLog.objects.filter(
                task=task,
                technician=user,
                clock_out__isnull=True
            )
            
            for log in open_logs:
                log.clock_out = completion_time
                # Calculate hours if needed, mostly handled by save() or property?
                # Let's ensure notes are added if provided
                if notes:
                    if log.notes:
                        log.notes += f"\nCompletion Note: {notes}"
                    else:
                        log.notes = f"Completion Note: {notes}"
                log.save()

        if actual_hours:
            try:
                task.actual_hours = Decimal(str(actual_hours))
            except (InvalidOperation, TypeError, ValueError):
                return Response(
                    {'error': 'Actual hours must be a valid number.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        task.completed_at = completion_time

        if not actual_hours and task.calculated_actual_hours <= 0 and task.started_at:
            duration = completion_time - task.started_at
            if duration.total_seconds() > 0:
                task.actual_hours = max(
                    (Decimal(str(duration.total_seconds())) / Decimal('3600')).quantize(Decimal('0.01')),
                    Decimal('0.01')
                )

        if task.calculated_actual_hours <= 0:
            return Response(
                {
                    'error': 'Task must be started before completion so labor time can be calculated.',
                    'field': 'started_at',
                    'next_step': 'Start the task, then complete it again.',
                    'task': {
                        'id': task.id,
                        'description': task.description,
                        'status': task.get_status_display(),
                    },
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        task.status = 'completed'

        if notes:
            task.detailed_notes = notes
        
        task.save()
        
        # Recalculate totals on Work Order
        task.work_order.recalculate_totals()
        
        serializer = self.get_serializer(task)
        return Response(serializer.data)

class ServiceTaskTypeViewSet(WorkOrderRelatedPermissionMixin, viewsets.ModelViewSet):
    """CRUD for service task types."""
    queryset = ServiceTaskType.objects.all().select_related('revenue_product').order_by('sort_order', 'name')
    serializer_class = ServiceTaskTypeSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'is_billable']
    search_fields = ['code', 'name', 'description']
    ordering_fields = ['sort_order', 'name', 'created_at']

