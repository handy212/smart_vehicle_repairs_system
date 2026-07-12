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

class WorkOrderViewSet(WorkOrderDocumentMixin, WorkOrderStateTransitionMixin, viewsets.ModelViewSet):
    """
    Work Order management with comprehensive workflow actions
    """
    queryset = WorkOrder.objects.all().select_related(
        'customer', 'customer__user', 'vehicle', 'appointment', 'primary_technician', 'created_by',
        'branch', 'service_coordinator', 'diagnosis_by', 'quality_check_by', 'related_work_order',
        'service_type', 'service_bundle', 'estimate', 'diagnosis',
        'job_type', 'job_type__workflow_profile',
    ).prefetch_related(
        'assigned_technicians',
        'gate_passes',
        'diagnosis__repair_recommendations',
        Prefetch('inspections', queryset=VehicleInspection.objects.order_by('-created_at')),
        Prefetch('tasks', queryset=ServiceTask.objects.select_related('assigned_to')),
        Prefetch('notes', queryset=WorkOrderNote.objects.select_related('created_by')),
        Prefetch('parts', queryset=WorkOrderPart.objects.select_related(
            'purchase_order_item__purchase_order__supplier', 'inventory_part__preferred_supplier'
        )),
        Prefetch('invoices', queryset=Invoice.objects.order_by('-created_at')),
    )
    list_queryset = WorkOrder.objects.all().select_related(
        'customer', 'customer__user', 'vehicle', 'primary_technician',
        'service_coordinator', 'branch', 'estimate', 'diagnosis',
        'job_type', 'job_type__workflow_profile',
    ).prefetch_related(
        'assigned_technicians',
        'gate_passes',
        Prefetch('inspections', queryset=VehicleInspection.objects.order_by('-created_at')),
        Prefetch('invoices', queryset=Invoice.objects.exclude(status='void').order_by('-created_at')),
    ).annotate(
        task_count_annotated=Count('tasks', distinct=True),
        parts_count_annotated=Count('parts', distinct=True),
        assigned_technician_count=Count('assigned_technicians', distinct=True),
    )
    permission_classes = [IsAuthenticated, IsModuleEnabled('workorders')]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    
    # Use custom filterset class instead of filterset_fields
    filterset_class = WorkOrderFilter

    search_fields = [
        'work_order_number',
        'customer__company_name',
        'customer__full_name',
        'customer__user__first_name',
        'customer__user__last_name',
        'vehicle__vin', 'vehicle__license_plate', 'customer_concerns', 'diagnosis_notes'
    ]
    ordering_fields = [
        'created_at', 'estimated_completion', 'priority', 'status',
        'estimated_total', 'actual_total', 'invoice_total', 'work_order_number',
        'customer__company_name', 'customer__full_name', 'customer__user__last_name', 'customer__user__first_name'
    ]
    ordering = ['-created_at']

    def _annotate_invoice_total(self, queryset):
        from django.db.models import DecimalField, OuterRef, Subquery
        from apps.billing.models import Invoice

        invoice_total_subquery = (
            Invoice.objects.filter(work_order_id=OuterRef('pk'))
            .exclude(status='void')
            .order_by('-created_at')
            .values('total')[:1]
        )
        return queryset.annotate(
            invoice_total=Subquery(
                invoice_total_subquery,
                output_field=DecimalField(max_digits=12, decimal_places=2),
            )
        )

    WORKORDER_READ_ACTIONS = frozenset({
        'list', 'retrieve', 'dashboard_stats', 'check_unapproved_recommendations',
        'get_recent_work_orders', 'active', 'overdue', 'awaiting_approval',
        'customer_waiting', 'by_technician', 'status_summary', 'technician_workload',
        'workflow_metrics', 'workflow_ai_analysis', 'predict_service', 'suggest_observations', 'suggest_qc_notes',
        'rate_service',
    })

    def get_permissions(self):
        """Return appropriate permissions based on action and HTTP method."""
        if self.action == 'export':
            return workorder_module_permissions() + [HasPermission('export_workorders')()]
        if self.action in self.WORKORDER_READ_ACTIONS:
            return workorder_read_permissions()
        if self.action == 'create':
            return workorder_module_permissions() + [HasPermission('create_workorders')()]
        if self.action in ('update', 'partial_update'):
            return workorder_edit_permissions()
        if self.action == 'discontinue_job':
            # Technicians need this for customer walk-aways during diagnosis/repairs
            return workorder_status_change_permissions()
        if self.action == 'destroy':
            return workorder_module_permissions() + [HasPermission('delete_workorders')()]
        if self.action == 'check_repeat_visit':
            return workorder_module_permissions() + [HasPermission('create_workorders')()]
        if self.action == 'check_overdue':
            return workorder_module_permissions() + [HasPermission('manage_workorders')()]
        if self.action == 'rate_service':
            if getattr(self.request.user, 'role', None) == 'customer':
                return [IsAuthenticated(), IsModuleEnabled('workorders')]
            return workorder_edit_permissions()
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return workorder_read_permissions()
        if self.request.method in ('PUT', 'PATCH'):
            return workorder_edit_permissions()
        if self.request.method == 'DELETE':
            return workorder_module_permissions() + [HasPermission('delete_workorders')()]
        if self.request.method == 'POST':
            return workorder_status_change_permissions()
        return workorder_read_permissions()
    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """
        Get statistics for work orders dashboard.
        """
        from apps.gatepass.models import GatePass

        queryset = self.get_queryset()

        total_workorders = queryset.count()
        in_progress = queryset.filter(status__in=['in_progress', 'paused']).count()
        awaiting_approval = queryset.filter(status='awaiting_approval').count()
        needs_action = queryset.filter(
            status__in=[
                'intake', 'assigned', 'diagnosis', 'awaiting_approval',
                'additional_work_found',
            ],
        ).count()
        completed = queryset.filter(status__in=['completed', 'invoiced', 'closed']).count()
        discontinued = queryset.filter(status='discontinued_pending_bill').count()

        picked_up_count = queryset.filter(
            status='closed',
            gate_passes__status='completed',
        ).distinct().count()

        return Response({
            'total_workorders': total_workorders,
            'in_progress': in_progress,
            'pending': needs_action,
            'awaiting_approval': awaiting_approval,
            'completed': completed,
            'picked_up': picked_up_count,
            'cancelled': discontinued,
            'discontinued': discontinued,
        })
    
    def get_queryset(self):
        """Filter work orders by active branch and customer profile"""
        base_queryset = self.list_queryset if self.action == 'list' else self.queryset
        queryset = self._annotate_invoice_total(base_queryset)
        user = self.request.user

        # For customers, filter by their customer profile
        if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
            queryset = queryset.filter(customer=user.customer_profile)
            return queryset

        # Check if user wants to see all branches (for admins) or just active branch
        show_all = self.request.query_params.get('all_branches', 'false').lower() == 'true'
        queryset = filter_queryset_for_user_branches(
            queryset, 
            self.request.user, 
            request=self.request, 
            use_active_branch=not show_all
        )
        queryset = filter_workorders_for_user(queryset, user)
        
        # Date range filtering for work orders
        if self.action == 'list':
            date_from = self.request.query_params.get('created_at__gte') or self.request.query_params.get('date_from')
            date_to = self.request.query_params.get('created_at__lte') or self.request.query_params.get('date_to')
            if date_from:
                queryset = queryset.filter(created_at__gte=date_from)
            if date_to:
                queryset = queryset.filter(created_at__lte=date_to)
        
        return queryset

    def get_object(self):
        """
        Return a clearer branch-context error for detail routes.

        Without an active branch, or with the wrong active branch selected,
        branch-scoped records used to look like a generic 404.
        """
        queryset = self.filter_queryset(self.get_queryset())
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup_value = self.kwargs.get(lookup_url_kwarg)
        filter_kwargs = {self.lookup_field: lookup_value}

        obj = queryset.filter(**filter_kwargs).first()
        if obj is not None:
            self.check_object_permissions(self.request, obj)
            return obj

        user = self.request.user
        if getattr(user, 'role', None) == 'customer':
            raise Http404

        unscoped_obj = super().get_queryset().filter(**filter_kwargs).first()
        if unscoped_obj is not None:
            has_workorder_access = filter_workorders_for_user(
                super().get_queryset().filter(pk=unscoped_obj.pk),
                user,
            ).exists()
            if not has_workorder_access:
                raise Http404

            active_branch = resolve_branch(self.request)
            record_branch = getattr(unscoped_obj, 'branch', None)

            if record_branch is None:
                return unscoped_obj

            if not active_branch:
                raise DRFValidationError({
                    'error': 'Active branch context is required to access this work order. Select the correct branch or send X-Branch-ID.'
                })

            if record_branch.id != active_branch.id:
                raise DRFValidationError({
                    'error': (
                        f"Active branch context does not match this record. "
                        f"Select branch '{record_branch.name}' or send the correct X-Branch-ID header."
                    )
                })

            return unscoped_obj

        raise Http404

    def get_serializer_class(self):
        if self.action == 'list':
            return WorkOrderListSerializer
        elif self.action == 'create':
            return WorkOrderCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return WorkOrderUpdateSerializer
        return WorkOrderDetailSerializer

    NON_DELETABLE_WORK_ORDER_STATUSES = frozenset({'closed', 'invoiced'})

    def destroy(self, request, *args, **kwargs):
        """Delete a work order and return user-facing errors instead of opaque 500s."""
        from django.db.models.deletion import ProtectedError

        work_order = self.get_object()

        if work_order.status in self.NON_DELETABLE_WORK_ORDER_STATUSES:
            message = self._work_order_delete_block_message(work_order)
            return Response({'detail': message, 'error': message}, status=status.HTTP_400_BAD_REQUEST)

        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError as exc:
            message = self._work_order_delete_block_message(work_order, exc.protected_objects)
            return Response({'detail': message, 'error': message}, status=status.HTTP_400_BAD_REQUEST)

    def _work_order_delete_block_message(self, work_order, protected_objects=None):
        """Build a clear message when a work order cannot be deleted."""
        blockers = []

        invoices = [
            obj for obj in (protected_objects or [])
            if hasattr(obj, 'invoice_number')
        ]
        if not invoices:
            invoices = list(work_order.invoices.exclude(status='void')[:5])

        if invoices:
            numbers = ', '.join(inv.invoice_number for inv in invoices[:4])
            extra = f' (+{len(invoices) - 4} more)' if len(invoices) > 4 else ''
            blockers.append(f'invoice(s): {numbers}{extra}')

        gate_passes = [
            obj for obj in (protected_objects or [])
            if hasattr(obj, 'gate_pass_number')
        ]
        if not gate_passes:
            gate_passes = list(work_order.gate_passes.exclude(status='cancelled')[:5])

        if gate_passes:
            numbers = ', '.join(gp.gate_pass_number for gp in gate_passes[:4])
            extra = f' (+{len(gate_passes) - 4} more)' if len(gate_passes) > 4 else ''
            blockers.append(f'gate pass(es): {numbers}{extra}')

        if protected_objects:
            other_types = {
                obj._meta.verbose_name
                for obj in protected_objects
                if not hasattr(obj, 'invoice_number') and not hasattr(obj, 'gate_pass_number')
            }
            if other_types:
                blockers.append(f'other linked record(s): {", ".join(sorted(other_types))}')

        status_label = work_order.get_status_display().lower()
        wo_ref = work_order.work_order_number

        if blockers:
            return (
                f'Cannot delete work order {wo_ref} because it is {status_label} and linked to '
                f'{", and ".join(blockers)}. Void or remove those records first.'
            )

        if work_order.status in self.NON_DELETABLE_WORK_ORDER_STATUSES:
            return (
                f'Cannot delete work order {wo_ref} because it is {status_label}. '
                'Completed and billed work orders cannot be deleted.'
            )

        return (
            f'Cannot delete work order {wo_ref} because it is referenced by other records. '
            'Remove or reassign linked records first.'
        )

    def perform_create(self, serializer):
        request = self.request
        branch_id = request.data.get('branch') or request.data.get('branch_id')
        branch = resolve_branch(request, branch_id=branch_id)

        if branch is None:
            raise ValidationError({'branch': 'A valid branch assignment is required.'})

        work_order = serializer.save(branch=branch)
        
        # Update vehicle mileage if provided
        odometer_in = serializer.validated_data.get('odometer_in')
        if odometer_in is not None and work_order.vehicle:
            # We already validated it's >= current_mileage in the serializer
            work_order.vehicle.update_mileage(
                mileage=odometer_in,
                user=request.user,
                notes=f"Recorded at Work Order {work_order.work_order_number} creation"
            )
        
        # Note: Subscription deductions are handled in the roadside assistance module
        # Work orders are for regular workshop services, not roadside breakdown assistance
    
    def perform_update(self, serializer):
        work_order = serializer.save()
        
        # Update vehicle mileage if provided
        odometer_out = serializer.validated_data.get('odometer_out')
        if odometer_out is not None and work_order.vehicle:
            work_order.vehicle.update_mileage(
                mileage=odometer_out,
                user=self.request.user,
                notes=f"Recorded at Work Order {work_order.work_order_number} update"
            )
            
    def update(self, request, *args, **kwargs):
        """Override update to add better error logging"""
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            instance = self.get_object()
            logger.info(f"Updating work order {instance.id} with data: {request.data}")
            return super().update(request, *args, **kwargs)
        except Exception as e:
            logger.error(f"Error updating work order: {e}")
            logger.error(f"Request data: {request.data}")
            import traceback
            logger.error(traceback.format_exc())
            raise

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        """Export filtered work orders using the clean supported column layout."""
        queryset = self.filter_queryset(self.get_queryset()).select_related(
            'diagnosis',
            'triage_form__performed_by',
        ).prefetch_related(
            'diagnosis__repair_recommendations',
        )

        date_from = request.query_params.get('created_at__gte') or request.query_params.get('date_from')
        date_to = request.query_params.get('created_at__lte') or request.query_params.get('date_to')
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        export_format = (
            request.query_params.get('export_format')
            or request.query_params.get('file_format')
            or request.query_params.get('format')
            or 'xlsx'
        ).lower()
        from apps.workorders.frontend_views import export_workorders_csv, export_workorders_excel

        if export_format == 'csv':
            return export_workorders_csv(queryset)
        if export_format == 'xlsx':
            return export_workorders_excel(queryset)

        return Response(
            {'error': 'Invalid format. Use xlsx or csv.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=['post'])
    def rate_service(self, request, pk=None):
        """Allow customer (or staff) to submit post-service rating/feedback."""
        work_order = self.get_object()

        if work_order.status not in ['completed', 'closed', 'invoiced']:
            return Response(
                {'error': 'Only completed work orders can be rated'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = request.user
        if getattr(user, 'role', None) == 'customer':
            customer_profile = getattr(user, 'customer_profile', None)
            if not customer_profile or work_order.customer_id != customer_profile.id:
                return Response(
                    {'error': 'You do not have permission to rate this work order'},
                    status=status.HTTP_403_FORBIDDEN
                )

        rating = request.data.get('rating')
        feedback = request.data.get('customer_feedback') or request.data.get('feedback') or ''

        if rating in (None, ''):
            return Response({'error': 'Rating is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            rating = int(rating)
        except (TypeError, ValueError):
            return Response({'error': 'Rating must be a number from 1 to 5'}, status=status.HTTP_400_BAD_REQUEST)

        if rating < 1 or rating > 5:
            return Response({'error': 'Rating must be between 1 and 5'}, status=status.HTTP_400_BAD_REQUEST)

        work_order.customer_rating = rating
        work_order.customer_feedback = str(feedback).strip()
        work_order.save(update_fields=['customer_rating', 'customer_feedback', 'updated_at'])

        serializer = self.get_serializer(work_order)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def check_unapproved_recommendations(self, request):
        """
        Check for pending or deferred recommendations for a vehicle from previous work orders.
        Query params: vehicle_id (required)
        Returns: List of open recommendations with work order context
        """
        vehicle_id = request.query_params.get('vehicle_id')
        if not vehicle_id:
            return Response(
                {'error': 'vehicle_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from apps.diagnosis.models import Diagnosis
            from apps.vehicles.models import Vehicle
            
            vehicle = Vehicle.objects.get(id=vehicle_id)
            
            # Look at completed diagnoses for this vehicle rather than relying on a
            # fully closed work order. Recommendations often remain open while the
            # work order sits in awaiting_approval.
            completed_diagnoses = Diagnosis.objects.filter(
                work_order__vehicle=vehicle,
                completed_at__isnull=False,
            ).exclude(
                work_order__status='cancelled'
            ).select_related(
                'work_order',
                'work_order__customer',
                'work_order__branch',
            ).order_by('-completed_at')

            open_recommendations = []
            
            for diagnosis in completed_diagnoses:
                wo = diagnosis.work_order
                recommendations = diagnosis.repair_recommendations.filter(
                    approval_status__in=['pending_approval', 'deferred'],
                    converted_to_task__isnull=True,
                )
                for rec in recommendations:
                    open_recommendations.append({
                        'id': rec.id,
                        'description': rec.description,
                        'priority': rec.priority,
                        'priority_display': rec.get_priority_display(),
                        'recommendation_type': rec.recommendation_type,
                        'recommendation_type_display': rec.get_recommendation_type_display(),
                        'approval_status': rec.approval_status,
                        'approval_status_display': rec.get_approval_status_display(),
                        'quotation_status': rec.quotation_status,
                        'quotation_status_display': rec.get_quotation_status_display(),
                        'parts_needed': rec.parts_needed,
                        'work_order_id': wo.id,
                        'work_order_number': wo.work_order_number,
                        'work_order_completed_at': (
                            wo.completed_at.isoformat()
                            if wo.completed_at
                            else diagnosis.completed_at.isoformat()
                        ),
                        'diagnosis_id': diagnosis.id,
                    })
            
            return Response({
                'vehicle_id': vehicle_id,
                'vehicle_display': vehicle.display_name,
                'count': len(open_recommendations),
                'recommendations': open_recommendations
            })
        except Vehicle.DoesNotExist:
            return Response(
                {'error': 'Vehicle not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error checking unapproved recommendations: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Failed to check recommendations: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def check_repeat_visit(self, request):
        """
        Check if a vehicle has recent similar work orders (repeat visit detection).
        
        Request body:
        {
            "vehicle": <vehicle_id>,
            "customer_concerns": "<concern text>"
        }
        
        Returns:
        {
            "has_repeat": bool,
            "matches": [
                {
                    "work_order_id": int,
                    "work_order_number": str,
                    "completed_at": datetime,
                    "days_ago": int,
                    "customer_concerns": str,
                    "similarity": float,
                    "technician": str,
                    "branch_name": str
                }
            ]
        }
        """
        from django.conf import settings
        from ..utils import detect_repeat_visit
        
        vehicle_id = request.data.get('vehicle')
        concerns = request.data.get('customer_concerns', '')
        
        if not vehicle_id:
            return Response(
                {'error': 'vehicle is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not concerns or not concerns.strip():
            return Response({
                'has_repeat': False,
                'matches': []
            })
        
        if not settings.REPEAT_VISIT_ENABLED:
            return Response({
                'has_repeat': False,
                'matches': []
            })
        
        matches = detect_repeat_visit(
            vehicle=vehicle_id,
            customer_concerns=concerns,
            days=settings.REPEAT_VISIT_DAYS,
            similarity_threshold=settings.REPEAT_VISIT_SIMILARITY_THRESHOLD
        )
        
        # Convert datetime to ISO format for JSON serialization
        for match in matches:
            if match.get('completed_at'):
                match['completed_at'] = match['completed_at'].isoformat()
            # Remove work_order instance (not JSON serializable)
            match.pop('work_order', None)
        
        return Response({
            'has_repeat': len(matches) > 0,
            'matches': matches
        })
    
    @action(detail=False, methods=['get'])
    def get_recent_work_orders(self, request):
        """
        Get recent completed/closed work orders for a vehicle.
        Useful for linking rework/return jobs to previous work orders.
        
        Query parameters:
        - vehicle: Vehicle ID (required)
        - days: Number of days to look back (default: 90)
        - status: Comma-separated list of statuses to filter (default: completed,invoiced,closed)
        - limit: Maximum number of results (default: 10)
        
        Returns:
        {
            "results": [
                {
                    "id": int,
                    "work_order_number": str,
                    "status": str,
                    "completed_at": str (ISO format),
                    "customer_concerns": str,
                    "technician_name": str,
                    "branch_name": str,
                    "days_ago": int
                }
            ]
        }
        """
        from ..utils import get_recent_completed_work_orders
        
        vehicle_id = request.query_params.get('vehicle')
        if not vehicle_id:
            return Response(
                {'error': 'vehicle parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            vehicle_id = int(vehicle_id)
        except (ValueError, TypeError):
            return Response(
                {'error': 'vehicle must be a valid integer'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get parameters with defaults
        days = int(request.query_params.get('days', 90))
        status_filter = request.query_params.get('status', 'completed,invoiced,closed')
        limit = int(request.query_params.get('limit', 10))
        
        # Parse status filter
        status_list = [s.strip() for s in status_filter.split(',')]
        
        # Get recent work orders
        work_orders = get_recent_completed_work_orders(vehicle_id, days=days)
        
        # Filter by status if provided
        if status_list:
            work_orders = work_orders.filter(status__in=status_list)
        
        # Prefetch assigned technicians to avoid N+1 queries
        work_orders = work_orders.prefetch_related('assigned_technicians')
        
        # Apply limit
        work_orders = work_orders[:limit]
        
        # Serialize results
        results = []
        check_date = timezone.now()
        
        for wo in work_orders:
            technician_name = None
            if wo.primary_technician:
                technician_name = f"{wo.primary_technician.first_name} {wo.primary_technician.last_name}".strip()
            elif wo.assigned_technicians.exists():
                tech = wo.assigned_technicians.first()
                technician_name = f"{tech.first_name} {tech.last_name}".strip()
            
            branch_name = wo.branch.name if wo.branch else 'Unknown Branch'
            days_ago = (check_date - wo.completed_at).days if wo.completed_at else None
            
            results.append({
                'id': wo.id,
                'work_order_number': wo.work_order_number,
                'status': wo.status,
                'completed_at': wo.completed_at.isoformat() if wo.completed_at else None,
                'customer_concerns': wo.customer_concerns or '',
                'technician_name': technician_name or 'Not assigned',
                'branch_name': branch_name,
                'days_ago': days_ago,
            })
        
        return Response({'results': results})
    
    # ========== STATUS WORKFLOW ACTIONS ==========

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get all active work orders (not completed/closed)"""
        import traceback
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            active_statuses = [
                'draft', 'inspection', 'intake', 'assigned', 'diagnosis',
                'awaiting_approval', 'approved', 'in_progress', 'paused',
                'additional_work_found', 'quality_check',
            ]
            work_orders = self.get_queryset().filter(status__in=active_statuses)
            
            page = self.paginate_queryset(work_orders)
            if page is not None:
                serializer = self.get_serializer(page, many=True)
                return self.get_paginated_response(serializer.data)
            
            serializer = self.get_serializer(work_orders, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Error in active work orders: {e}")
            logger.error(traceback.format_exc())
            # Return empty list instead of error to prevent frontend crashes
            return Response([], status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """Get overdue work orders"""
        now = timezone.now()
        work_orders = self.get_queryset().filter(
            estimated_completion__lt=now,
            status__in=['in_progress', 'paused', 'quality_check']
        )
        
        serializer = self.get_serializer(work_orders, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def awaiting_approval(self, request):
        """Get work orders awaiting customer approval"""
        work_orders = self.get_queryset().filter(status='awaiting_approval')
        
        serializer = self.get_serializer(work_orders, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def customer_waiting(self, request):
        """Get work orders where customer is waiting"""
        work_orders = self.get_queryset().filter(is_customer_waiting=True)
        
        serializer = self.get_serializer(work_orders, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def by_technician(self, request):
        """Get work orders by technician"""
        technician_id = request.query_params.get('technician_id')
        
        if not technician_id:
            return Response(
                {'error': 'technician_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        work_orders = self.get_queryset().filter(
            Q(primary_technician_id=technician_id) |
            Q(assigned_technicians__id=technician_id)
        ).distinct()
        
        serializer = self.get_serializer(work_orders, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def status_summary(self, request):
        """Get work order counts by status"""
        summary = self.get_queryset().values('status').annotate(
            count=Count('id'),
            total_estimated=Sum('estimated_total'),
            total_actual=Sum('actual_total'),
            total_invoiced=Sum(
                'invoices__total',
                filter=Q(
                    invoices__status__in=['sent', 'viewed', 'partial', 'paid', 'overdue'],
                ),
            ),
        ).order_by('status')
        
        serializer = WorkOrderStatusSummarySerializer(summary, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def technician_workload(self, request):
        """Get technician workload summary"""
        from apps.accounts.models import User
        from datetime import datetime, timedelta
        
        week_ago = timezone.now() - timedelta(days=7)
        
        technicians = User.objects.filter(role='technician')
        workload = []
        wo_base = filter_workorders_for_user(
            filter_queryset_for_user_branches(
                WorkOrder.objects.all(),
                request.user,
                request=request,
            ),
            request.user,
        )

        for tech in technicians:
            active_wos = wo_base.filter(
                Q(primary_technician=tech) | Q(assigned_technicians=tech),
                status__in=['in_progress', 'paused', 'quality_check']
            ).distinct()
            
            time_logs = TechnicianTimeLog.objects.filter(
                technician=tech,
                clock_in__gte=week_ago
            )
            
            total_hours = sum(log.duration_hours for log in time_logs)
            
            workload.append({
                'technician_id': tech.id,
                'technician_name': f"{tech.first_name} {tech.last_name}",
                'active_work_orders': active_wos.count(),
                'total_hours_this_week': total_hours,
                'work_orders': WorkOrderListSerializer(active_wos, many=True).data
            })
        
        serializer = TechnicianWorkloadSerializer(workload, many=True)
        return Response(serializer.data)
    
    
    
    @action(detail=False, methods=['get'])
    def workflow_metrics(self, request):
        """Get workflow performance metrics"""
        from django.db.models import Avg, F, ExpressionWrapper, DurationField, Count, Q
        from datetime import timedelta
        
        queryset = self.get_queryset()
        
        # Average time in each status
        status_times = []
        for status_code, status_label in WorkOrder.STATUS_CHOICES:
            status_wos = queryset.filter(status=status_code)
            if status_wos.exists():
                # Calculate average time in this status
                # This is simplified - in reality you'd track time per status
                avg_days = status_wos.aggregate(
                    avg_days=Avg(
                        ExpressionWrapper(
                            F('updated_at') - F('created_at'),
                            output_field=DurationField()
                        )
                    )
                )['avg_days']
                
                status_times.append({
                    'status': status_code,
                    'status_label': status_label,
                    'count': status_wos.count(),
                    'avg_days': avg_days.total_seconds() / 86400 if avg_days else 0
                })
        
        # Bottlenecks (statuses with longest average time)
        bottlenecks = sorted(
            [s for s in status_times if s['count'] > 0],
            key=lambda x: x['avg_days'],
            reverse=True
        )[:5]
        
        # Work orders stuck in status > 7 days
        stuck_threshold = timezone.now() - timedelta(days=7)
        stuck = queryset.filter(
            status__in=['in_progress', 'paused', 'quality_check', 'awaiting_approval'],
            updated_at__lt=stuck_threshold
        ).count()
        
        # Overdue work orders
        overdue = queryset.filter(
            estimated_completion__lt=timezone.now(),
            status__in=['in_progress', 'paused', 'quality_check', 'awaiting_approval']
        ).count()
        
        # Status distribution
        status_distribution = queryset.values('status').annotate(
            count=Count('id')
        ).order_by('-count')
        
        # Average completion time
        completed_wos = queryset.filter(status='completed', completed_at__isnull=False)
        avg_completion_time = None
        if completed_wos.exists():
            completion_times = []
            for wo in completed_wos:
                if wo.started_at and wo.completed_at:
                    duration = wo.completed_at - wo.started_at
                    completion_times.append(duration.total_seconds() / 3600)  # hours
            
            if completion_times:
                avg_completion_time = sum(completion_times) / len(completion_times)
        
        # Cost variance analysis
        from django.db import models as db_models
        cost_variance_data = queryset.filter(
            status='completed',
            estimated_total__gt=0
        ).aggregate(
            avg_variance=Avg(
                ExpressionWrapper(
                    F('actual_total') - F('estimated_total'),
                    output_field=db_models.DecimalField()
                )
            ),
            avg_variance_percent=Avg(
                ExpressionWrapper(
                    ((F('actual_total') - F('estimated_total')) / F('estimated_total')) * 100,
                    output_field=db_models.DecimalField()
                )
            )
        )
        
        return Response({
            'status_times': status_times,
            'bottlenecks': bottlenecks,
            'stuck_work_orders': stuck,
            'overdue_work_orders': overdue,
            'status_distribution': list(status_distribution),
            'avg_completion_time_hours': avg_completion_time,
            'cost_variance': {
                'avg_variance': float(cost_variance_data['avg_variance'] or 0),
                'avg_variance_percent': float(cost_variance_data['avg_variance_percent'] or 0)
            }
        })

    @action(detail=False, methods=['get'], url_path='workflow_ai_analysis')
    def workflow_ai_analysis(self, request):
        """AI narrative analysis of workflow bottlenecks."""
        from apps.core.services.ai_audit import is_ai_enabled
        from apps.core.services.ai_service import AIService

        if not is_ai_enabled('ops_bottleneck'):
            return Response(
                {'error': 'AI bottleneck analysis is not configured or disabled.'},
                status=503,
            )

        metrics_response = self.workflow_metrics(request)
        if metrics_response.status_code != 200:
            return metrics_response
        analysis = AIService.analyze_workflow_bottlenecks(metrics_response.data, user=request.user)
        return Response({'analysis': analysis, 'metrics': metrics_response.data})

    @action(detail=True, methods=['get'])
    def predict_service(self, request, pk=None):
        """Predict next service date and odometer using AI based on vehicle history"""
        work_order = self.get_object()
        vehicle = work_order.vehicle
        
        # Get history of completed/closed work orders for this vehicle
        # We need this to calculate usage patterns (km per day)
        from ..models import WorkOrder
        history = WorkOrder.objects.filter(
            vehicle=vehicle,
            status__in=['completed', 'closed']
        ).order_by('created_at')
        
        from apps.core.services.ai_service import AIService
        prediction = AIService.predict_next_service(history)
        
        if not prediction:
            return Response(
                {'message': 'Insufficient historical data for prediction (at least one completed work order with odometer required)'},
                status=status.HTTP_200_OK
            )
            
        return Response(prediction)

    @action(detail=True, methods=['get'])
    def suggest_observations(self, request, pk=None):
        """Generate AI-powered initial observations for a work order"""
        work_order = self.get_object()
        from apps.core.services.ai_service import AIService
        observations = AIService.suggest_initial_observations(work_order)
        return Response({'observations': observations})

    @action(detail=True, methods=['get'])
    def suggest_qc_notes(self, request, pk=None):
        """Generate AI-powered quality check observations for a work order"""
        work_order = self.get_object()
        from apps.core.services.ai_service import AIService
        notes = AIService.suggest_qc_notes(work_order)
        return Response({'notes': notes})
    
    @action(detail=False, methods=['post'])
    def check_overdue(self, request):
        """Check for overdue work orders and send notifications"""
        from apps.notifications_app.triggers import notification_triggers
        
        now = timezone.now()
        overdue_wos = self.get_queryset().filter(
            estimated_completion__lt=now,
            status__in=['in_progress', 'paused', 'quality_check', 'awaiting_approval']
        )
        
        notified = []
        for wo in overdue_wos:
            try:
                notification_triggers.work_order_overdue(wo)
                notified.append(wo.id)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send overdue notification for WO {wo.id}: {e}")
        
        return Response({
            'overdue_count': overdue_wos.count(),
            'notified_count': len(notified),
            'notified_ids': notified
        })
    
    @action(detail=False, methods=['get'])
    def job_profitability(self, request):
        """
        Job Profitability Report - Analyze revenue, costs, and margins for completed work orders
        
        Query params:
        - date_from: Start date (YYYY-MM-DD), defaults to 30 days ago
        - date_to: End date (YYYY-MM-DD), defaults to today
        - technician: Filter by technician ID
        - customer: Filter by customer ID
        - min_margin: Filter for jobs with margin % greater than this
        - sort: Sort by 'revenue', 'cost', 'margin', 'margin_percent' (default: '-revenue')
        """
        from decimal import Decimal
        
        queryset = self.get_queryset().filter(status='completed')
        
        # Date filtering
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        
        if not date_from:
            date_from = (timezone.now() - timedelta(days=30)).date()
        else:
            date_from = timezone.datetime.strptime(date_from, '%Y-%m-%d').date()
        
        if not date_to:
            date_to = timezone.now().date()
        else:
            date_to = timezone.datetime.strptime(date_to, '%Y-%m-%d').date()
        
        queryset = queryset.filter(completed_at__date__gte=date_from, completed_at__date__lte=date_to)
        
        # Additional filters
        technician_id = request.query_params.get('technician')
        if technician_id:
            queryset = queryset.filter(primary_technician_id=technician_id)
        
        customer_id = request.query_params.get('customer')
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        
        # Build profitability data
        jobs = []
        total_revenue = Decimal('0')
        total_labor_cost = Decimal('0')
        total_parts_cost = Decimal('0')
        total_cost = Decimal('0')
        total_profit = Decimal('0')
        
        from apps.billing.work_order_invoices import get_primary_invoice

        for wo in queryset.select_related('customer', 'customer__user', 'primary_technician', 'branch').prefetch_related(
            'invoices',
        ):
            primary_inv = get_primary_invoice(wo)
            if primary_inv and primary_inv.status in ('sent', 'viewed', 'partial', 'paid', 'overdue'):
                revenue = primary_inv.total or Decimal('0')
            else:
                revenue = Decimal('0')
            labor_cost = wo.actual_labor_cost or Decimal('0')
            parts_cost = wo.actual_parts_cost or Decimal('0')
            cost = labor_cost + parts_cost
            profit = revenue - cost
            margin_percent = (profit / revenue * 100) if revenue > 0 else Decimal('0')
           
            job_data = {
                'work_order_id': wo.id,
                'work_order_number': wo.work_order_number,
                'customer_name': f"{wo.customer.user.first_name} {wo.customer.user.last_name}" if wo.customer.user else wo.customer.company_name or "N/A",
                'vehicle': f"{wo.vehicle.year} {wo.vehicle.make} {wo.vehicle.model}" if wo.vehicle else "N/A",
                'technician': wo.primary_technician.get_full_name() if wo.primary_technician else "Unassigned",
                'branch': wo.branch.name if wo.branch else "N/A",
                'completed_at': wo.completed_at.isoformat() if wo.completed_at else None,
                'revenue': float(revenue),
                'labor_cost': float(labor_cost),
                'parts_cost': float(parts_cost),
                'total_cost': float(cost),
                'profit': float(profit),
                'margin_percent': float(margin_percent),
            }
            
            # Apply margin filter if specified
            min_margin = request.query_params.get('min_margin')
            if min_margin:
                if margin_percent < Decimal(min_margin):
                    continue
            
            jobs.append(job_data)
            total_revenue += revenue
            total_labor_cost += labor_cost
            total_parts_cost += parts_cost
            total_cost += cost
            total_profit += profit
        
        # Sort jobs
        sort_by = request.query_params.get('sort', '-revenue')
        reverse = sort_by.startswith('-')
        sort_field = sort_by.lstrip('-')
        
        if sort_field in ['revenue', 'cost', 'profit', 'margin_percent']:
            jobs.sort(key=lambda x: x.get(sort_field, 0), reverse=reverse)
        
        # Calculate totals
        total_margin_percent = (total_profit / total_revenue * 100) if total_revenue > 0 else Decimal('0')
        
        return Response({
            'date_from': str(date_from),
            'date_to': str(date_to),
            'summary': {
                'total_jobs': len(jobs),
                'total_revenue': float(total_revenue),
                'total_labor_cost': float(total_labor_cost),
                'total_parts_cost': float(total_parts_cost),
                'total_cost': float(total_cost),
                'total_profit': float(total_profit),
                'avg_margin_percent': float(total_margin_percent),
                'avg_revenue_per_job': float(total_revenue / len(jobs)) if len(jobs) > 0 else 0,
            },
            'jobs': jobs
        })


