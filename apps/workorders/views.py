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

from .models import (
    WorkOrder, ServiceTask, ServiceTaskType, WorkOrderPart,
    TechnicianTimeLog, WorkOrderNote, WorkOrderPhoto
)
from .serializers import (
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


from .filters import WorkOrderFilter, TechnicianTimeLogFilter


from .mixins.document_mixins import WorkOrderDocumentMixin
from .mixins.transition_mixins import WorkOrderStateTransitionMixin

class WorkOrderViewSet(WorkOrderDocumentMixin, WorkOrderStateTransitionMixin, viewsets.ModelViewSet):
    """
    Work Order management with comprehensive workflow actions
    """
    queryset = WorkOrder.objects.all().select_related(
        'customer', 'customer__user', 'vehicle', 'appointment', 'primary_technician', 'created_by',
        'branch', 'service_coordinator', 'diagnosis_by', 'quality_check_by', 'related_work_order',
        'service_type', 'service_bundle', 'estimate',
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
        'workflow_metrics', 'predict_service', 'suggest_observations', 'suggest_qc_notes',
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
        if self.action in ('update', 'partial_update', 'discontinue_job'):
            return workorder_edit_permissions()
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

        # Filter by branch if applicable
        queryset = self.get_queryset()
        
        # Calculate stats
        total_workorders = queryset.count()
        in_progress = queryset.filter(status='in_progress').count()
        pending = queryset.filter(status='pending').count()
        completed = queryset.filter(status='completed').count()
        cancelled = queryset.filter(status='cancelled').count()

        # Closed WOs where a gate pass has been fully completed (vehicle picked up)
        picked_up_count = queryset.filter(
            status='closed',
            gate_passes__status='completed'
        ).distinct().count()

        return Response({
            'total_workorders': total_workorders,
            'in_progress': in_progress,
            'pending': pending,
            'completed': completed + picked_up_count,
            'picked_up': picked_up_count,
            'cancelled': cancelled
        })
    
    def get_queryset(self):
        """Filter work orders by active branch and customer profile"""
        queryset = self._annotate_invoice_total(super().get_queryset())
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
            active_branch = resolve_branch(self.request)
            record_branch = getattr(unscoped_obj, 'branch', None)

            if record_branch and active_branch and record_branch.id != active_branch.id:
                raise DRFValidationError({
                    'error': (
                        f"Active branch context does not match this record. "
                        f"Select branch '{record_branch.name}' or send the correct X-Branch-ID header."
                    )
                })

            raise DRFValidationError({
                'error': 'Active branch context is required to access this work order. Select the correct branch or send X-Branch-ID.'
            })

        raise Http404

    def get_serializer_class(self):
        if self.action == 'list':
            return WorkOrderListSerializer
        elif self.action == 'create':
            return WorkOrderCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return WorkOrderUpdateSerializer
        return WorkOrderDetailSerializer

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
        from .utils import detect_repeat_visit
        
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
        from .utils import get_recent_completed_work_orders
        
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
            active_statuses = ['draft', 'intake', 'diagnosis', 'awaiting_approval', 
                              'approved', 'in_progress', 'paused', 'quality_check']
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

    @action(detail=True, methods=['get'])
    def predict_service(self, request, pk=None):
        """Predict next service date and odometer using AI based on vehicle history"""
        work_order = self.get_object()
        vehicle = work_order.vehicle
        
        # Get history of completed/closed work orders for this vehicle
        # We need this to calculate usage patterns (km per day)
        from .models import WorkOrder
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



class ServiceTaskViewSet(WorkOrderRelatedPermissionMixin, viewsets.ModelViewSet):
    """Service Task management"""
    queryset = ServiceTask.objects.all().select_related('work_order', 'assigned_to').prefetch_related('time_logs')
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
    queryset = ServiceTaskType.objects.all().order_by('sort_order', 'name')
    serializer_class = ServiceTaskTypeSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'is_billable']
    search_fields = ['code', 'name', 'description']
    ordering_fields = ['sort_order', 'name', 'created_at']


class WorkOrderPartViewSet(WorkOrderRelatedPermissionMixin, viewsets.ModelViewSet):
    """Work Order Part management"""
    queryset = WorkOrderPart.objects.all().select_related('work_order', 'task', 'installed_by')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['work_order', 'status']
    search_fields = ['part_number', 'part_name', 'description']

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return workorder_read_permissions()
        if self.action == 'create':
            return workorder_module_permissions() + [
                HasAnyPermission(['request_parts', 'edit_workorders'])(),
            ]
        if self.action in ('order', 'allocate'):
            return workorder_module_permissions() + [
                HasAnyPermission([
                    'request_parts',
                    'edit_workorders',
                    'manage_inventory',
                    'approve_part_requests',
                ])(),
            ]
        return workorder_edit_permissions()
    
    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """
        Get statistics for parts requests dashboard.
        """
        queryset = self.get_queryset()
        total_requests = queryset.count()
        draft_requests = queryset.filter(status='draft').count()
        pending_requests = queryset.filter(status='pending').count()
        po_created_requests = queryset.filter(status='po_created').count()
        awaiting_stock_requests = queryset.filter(status='awaiting_stock').count()
        received_requests = queryset.filter(status='received').count()
        ready_requests = queryset.filter(status='ready').count()
        
        return Response({
            'total_requests': total_requests,
            'draft_requests': draft_requests,
            'pending_requests': pending_requests,
            'po_created_requests': po_created_requests,
            'awaiting_stock_requests': awaiting_stock_requests,
            'received_requests': received_requests,
            'ready_requests': ready_requests,
        })

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a part requisition"""
        part = self.get_object()
        
        # Check permissions
        if (
            request.user.role not in ['manager', 'admin', 'service_coordinator', 'workshop_manager']
            and not user_has_permission(request.user, 'approve_part_requests')
            and not user_has_permission(request.user, 'manage_inventory')
        ):
             return Response(
                 {'error': 'You do not have permission to approve requisitions.'},
                 status=status.HTTP_403_FORBIDDEN
             )
        
        if part.approved_by:
             return Response(
                 {'error': 'This requisition is already approved.'},
                 status=status.HTTP_400_BAD_REQUEST
             )
             
        part.approved_by = request.user
        part.approved_at = timezone.now()
        part.save()
        
        # Trigger notification
        try:
            from apps.notifications_app.triggers import notification_triggers
            notification_triggers.part_requisition_approved(part)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to send part approval notification: {e}")
        
        serializer = self.get_serializer(part)
        return Response(serializer.data)

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
            return queryset.filter(work_order__customer=user.customer_profile)
        
        # Admin can view all if requested
        if getattr(user, 'role', None) == 'admin' and \
           self.request.query_params.get('all_branches', 'false').lower() == 'true':
            return queryset

        # Filter by active branch
        active_branch = resolve_branch(self.request)
        if active_branch:
            queryset = queryset.filter(work_order__branch=active_branch)
        elif getattr(user, 'role', None) != 'admin':
             # If no active branch and not admin, return empty or default restrictions
             # Usually resolve_branch returns *something* if logged in, but safe to handle.
             pass
             
        # Explicit status filtering if provided (though filterset_fields handles this usually)
        # But we ensure we DON'T filter by status unless asked
        
        return queryset

    @property
    def paginator(self):
        """
        Disable pagination if 'work_order' is in query params
        This ensures the frontend gets ALL parts for a diagnosis list.
        """
        self._paginator = super().paginator
        if 'work_order' in self.request.query_params:
            return None
        return self._paginator
    
    def get_serializer_class(self):
        if self.action == 'create':
            return WorkOrderPartCreateSerializer
        return WorkOrderPartSerializer

    def _validate_stores_fulfillment_allowed(self, wo_part):
        user = self.request.user
        if (
            user.role not in ['manager', 'admin', 'service_coordinator', 'workshop_manager']
            and not user_has_permission(user, 'manage_inventory')
            and not user_has_permission(user, 'approve_part_requests')
        ):
            return (
                False,
                "You do not have permission to fulfill part requests in Stores."
            )
        if not wo_part.approved_by_id:
            return (
                False,
                "Part requisition approval is required before Stores can order or allocate this part."
            )
        work_order = wo_part.work_order
        if not work_order.is_approved:
            return (
                False,
                "Customer approval is required before Stores can order or allocate this part."
            )
        if work_order.status not in {'approved', 'in_progress', 'paused'}:
            return (
                False,
                f"Stores fulfillment is not allowed while the work order is {work_order.status.replace('_', ' ')}."
            )
        return True, None
    
    @action(detail=True, methods=['post'])
    def allocate(self, request, pk=None):
        """Allocate part from inventory"""
        from apps.inventory.models import StockItem
        from apps.inventory.services import InventoryService
        
        wo_part = self.get_object()
        allowed, error = self._validate_stores_fulfillment_allowed(wo_part)
        if not allowed:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)

        if wo_part.status not in ['pending', 'draft', 'po_created', 'awaiting_stock', 'received', 'ordered']: # 'ordered' kept for backward compatibility
             return Response(
                 {'error': f'Cannot allocate part in {wo_part.status} status'},
                 status=status.HTTP_400_BAD_REQUEST
             )

        if not wo_part.part_number:
            return Response(
                {'error': 'Part number is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if wo_part.quantity != wo_part.quantity.to_integral_value():
            return Response(
                {'error': 'Inventory allocation quantity must be a whole number'},
                status=status.HTTP_400_BAD_REQUEST
            )

        part = wo_part.resolve_inventory_part()
        if not part:
            return Response(
                {'error': 'Part not found in inventory'}, 
                status=status.HTTP_404_NOT_FOUND
            )

        branch = wo_part.work_order.branch
        if not branch:
            return Response(
                {'error': 'Work Order has no branch assigned'},
                status=status.HTTP_400_BAD_REQUEST
            )

        inventory_status = wo_part.get_inventory_status_payload()
        if not inventory_status or not inventory_status.get('available'):
            available = inventory_status.get('quantity', 0) if inventory_status else 0
            return Response(
                {'error': f'Insufficient stock. Required: {wo_part.quantity}, Available: {available}'},
                status=status.HTTP_400_BAD_REQUEST
            )
             
        # Execute Allocation
        from django.db import transaction
        try:
            with transaction.atomic():
                part = wo_part.resolve_inventory_part()
                stock_item, _ = StockItem.objects.select_for_update().get_or_create(
                    part=part,
                    branch=branch,
                    defaults={
                        'quantity_in_stock': int(getattr(part, 'quantity_in_stock', 0) or 0),
                        'quantity_reserved': int(getattr(part, 'quantity_reserved', 0) or 0),
                        'reorder_point': part.reorder_point,
                        'reorder_quantity': part.reorder_quantity,
                        'minimum_stock': part.minimum_stock,
                    }
                )

                if Decimal(str(stock_item.available_quantity)) < wo_part.quantity:
                    return Response(
                        {'error': f'Insufficient stock. Required: {wo_part.quantity}, Available: {stock_item.available_quantity}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                allocation_quantity = int(wo_part.quantity)
                InventoryService.record_transaction(
                    part=part,
                    quantity=allocation_quantity,
                    transaction_type='sale',
                    user=request.user,
                    branch=branch,
                    work_order=wo_part.work_order,
                    reason=f"Allocated to WO #{wo_part.work_order.id}",
                )
                
                wo_part.status = 'ready'
                wo_part.inventory_part = part
                wo_part.save()
            
            serializer = self.get_serializer(wo_part)
            return Response(serializer.data)
        except Exception as e:
            import logging
            import traceback
            logging.getLogger(__name__).error(
                "Error in allocate: %s\n%s", e, traceback.format_exc(), exc_info=True
            )
            from django.conf import settings
            msg = f"Allocation failed: {str(e)}" if settings.DEBUG else "Part allocation failed."
            return Response(
                {'error': msg},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def order(self, request, pk=None):
        """Create/Add to Purchase Order"""
        from apps.inventory.models import PurchaseOrder, PurchaseOrderItem
        
        wo_part = self.get_object()
        allowed, error = self._validate_stores_fulfillment_allowed(wo_part)
        if not allowed:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validation
        if wo_part.status not in ['pending', 'draft', 'po_created']: # 'po_created' allows re-triggering/updating PO
             return Response(
                 {'error': f'Cannot order part in {wo_part.status} status'},
                 status=status.HTTP_400_BAD_REQUEST
             )
        
        if wo_part.quantity <= 0:
             return Response(
                 {'error': 'Quantity must be greater than 0 to order'},
                 status=status.HTTP_400_BAD_REQUEST
             )
             
        if not wo_part.part_number:
             return Response(
                 {'error': 'Part number is required to order'},
                 status=status.HTTP_400_BAD_REQUEST
             )

        # Identify Part & Supplier
        part = wo_part.resolve_inventory_part()
        if not part:
             # Instead of error, return flag for frontend to handle
             return Response(
                 {
                     'error': f"Part '{wo_part.part_number}' not found in Inventory.",
                     'needs_inventory_item': True,
                     'part_data': {
                         'part_name': wo_part.part_name,
                         'part_number': wo_part.part_number,
                         'description': wo_part.description
                     }
                 },
                 status=status.HTTP_404_NOT_FOUND
             )

        inventory_status = wo_part.get_inventory_status_payload()
        if inventory_status and inventory_status.get('available'):
            return Response(
                {'error': f"Part '{wo_part.part_number}' is in stock. Allocate it instead of creating a PO."},
                status=status.HTTP_400_BAD_REQUEST
            )
             
        supplier = part.preferred_supplier
        if not supplier:
            # Fallback: Check if part has any suppliers
            supplier = part.suppliers.first()
            
        if not supplier:
             return Response(
                 {'error': 'Part has no supplier defined. Please assign a supplier in Inventory.'},
                 status=status.HTTP_400_BAD_REQUEST
             )

        # Identify Branch (Order for the branch where WO exists)
        branch = wo_part.work_order.branch
        if not branch:
             return Response({'error': 'Work Order has no branch assigned'}, status=status.HTTP_400_BAD_REQUEST)

        # Find Open PO (Draft) or Create New
        po = PurchaseOrder.objects.filter(
            supplier=supplier,
            branch=branch,
            status='draft'
        ).first()
        
        created_new_po = False
        if not po:
            po = PurchaseOrder.objects.create(
                supplier=supplier,
                branch=branch,
                status='draft',
                created_by=request.user,
                notes=f"Auto-generated for Work Orders"
            )
            created_new_po = True
            
        # Create/Update PO Item
        # Check if item already exists in this PO
        po_item = PurchaseOrderItem.objects.filter(
            purchase_order=po,
            part=part
        ).first()
        
        if po_item:
            po_item.quantity += wo_part.quantity
            po_item.save()
        else:
            unit_cost = Decimal(str(part.cost_price or getattr(part, 'last_cost', None) or '0.01'))
            if unit_cost <= 0:
                unit_cost = Decimal('0.01')
            po_item = PurchaseOrderItem.objects.create(
                purchase_order=po,
                part=part,
                quantity=int(wo_part.quantity),
                unit_cost=unit_cost,
            )

        # Link WO Part to PO Item and set status to 'po_created'
        wo_part.purchase_order_item = po_item
        wo_part.status = 'po_created'
        wo_part.save()
        
        return Response({
            'status': 'po_created',
            'po_number': po.po_number,
            'po_id': po.id,
            'message': f"{'Created new' if created_new_po else 'Added to'} PO {po.po_number}"
        })
    
    @action(detail=True, methods=['post'])
    def create_and_order(self, request, pk=None):
        """Create inventory part and add to Purchase Order"""
        from apps.inventory.models import Part, PurchaseOrder, PurchaseOrderItem, Supplier, PartCategory
        from decimal import Decimal
        
        wo_part = self.get_object()
        allowed, error = self._validate_stores_fulfillment_allowed(wo_part)
        if not allowed:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validation
        # Validation
        if wo_part.status not in ['pending', 'draft', 'po_created']:
            return Response(
                {'error': f'Cannot order part in {wo_part.status} status'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if wo_part.quantity <= 0:
             return Response(
                 {'error': 'Quantity must be greater than 0 to order'},
                 status=status.HTTP_400_BAD_REQUEST
             )
        
        # Required data from request
        part_data = request.data
        required_fields = ['part_name', 'part_number', 'cost_price', 'supplier_id']
        missing = [f for f in required_fields if not part_data.get(f)]
        if missing:
            return Response(
                {'error': f'Missing required fields: {", ".join(missing)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if part already exists
        existing_part = Part.objects.filter(part_number=part_data['part_number']).first()
        if existing_part:
            return Response(
                {'error': f'Part with number {part_data["part_number"]} already exists'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get supplier
        try:
            supplier = Supplier.objects.get(id=part_data['supplier_id'])
        except Supplier.DoesNotExist:
            return Response(
                {'error': 'Supplier not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Identify Branch
        branch = wo_part.work_order.branch
        if not branch:
            return Response({'error': 'Work Order has no branch assigned'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get or create default category
        category_name = part_data.get('category', 'Uncategorized')
        category, _ = PartCategory.objects.get_or_create(name=category_name)

        # Create Part in Inventory
        part = Part.objects.create(
            name=part_data['part_name'],
            part_number=part_data['part_number'],
            description=part_data.get('description', wo_part.description or ''),
            category=category,
            cost_price=Decimal(str(part_data.get('cost_price') or 0)),
            selling_price=Decimal(str(part_data.get('selling_price') or part_data.get('cost_price') or 0)),
            quantity_in_stock=0,  # Initially 0, will be updated when PO is received
            minimum_stock=int(part_data.get('minimum_stock_level', 1)),
            branch=branch,
            preferred_supplier=supplier,
            created_by=request.user
        )
        
        # Add supplier to part's suppliers
        part.suppliers.add(supplier)
        
        # Find Open PO (Draft) or Create New
        po = PurchaseOrder.objects.filter(
            supplier=supplier,
            branch=branch,
            status='draft'
        ).first()
        
        created_new_po = False
        if not po:
            po = PurchaseOrder.objects.create(
                supplier=supplier,
                branch=branch,
                status='draft',
                created_by=request.user,
                notes=f"Auto-generated for Work Orders"
            )
            created_new_po = True
        
        # Create PO Item
        unit_cost = Decimal(str(part.cost_price or '0.01'))
        if unit_cost <= 0:
            unit_cost = Decimal('0.01')
        po_item = PurchaseOrderItem.objects.create(
            purchase_order=po,
            part=part,
            quantity=int(wo_part.quantity),
            unit_cost=unit_cost,
        )
        
        # Link WO Part to PO Item and update inventory reference
        wo_part.inventory_part = part
        wo_part.part_name = part.name
        wo_part.part_number = part.part_number
        if wo_part.unit_cost == 0 and part.cost_price:
            wo_part.unit_cost = part.cost_price
        wo_part.purchase_order_item = po_item
        wo_part.status = 'po_created'
        wo_part.save()
        
        return Response({
            'status': 'po_created',
            'po_number': po.po_number,
            'po_id': po.id,
            'part_id': part.id,
            'message': f"Created part '{part.name}' and {'new' if created_new_po else 'added to'} PO {po.po_number}"
        })

    @action(detail=False, methods=['post'])
    def bulk_order(self, request):
        """Bulk create/add to Purchase Orders for multiple parts"""
        from apps.inventory.models import PurchaseOrder, PurchaseOrderItem
        
        ids = request.data.get('ids', [])
        if not ids:
             return Response({'error': 'No IDs provided'}, status=status.HTTP_400_BAD_REQUEST)
             
        parts_to_order = WorkOrderPart.objects.filter(id__in=ids, status__in=['pending', 'draft', 'po_created'])
        
        results = {
            'processed': 0,
            'po_numbers': set(),
            'errors': []
        }
        
        for wo_part in parts_to_order:
            allowed, error = self._validate_stores_fulfillment_allowed(wo_part)
            if not allowed:
                results['errors'].append(f"Part {wo_part.id}: {error}")
                continue

            if wo_part.quantity <= 0:
                results['errors'].append(f"Part {wo_part.id}: Quantity must be positive")
                continue

            if not wo_part.part_number:
                results['errors'].append(f"Part {wo_part.id}: Missing part number")
                continue
                
            if wo_part.purchase_order_item_id:
                results['errors'].append(f"Part {wo_part.part_number}: Already linked to a purchase order")
                continue

            # Identify Part & Supplier
            part = wo_part.resolve_inventory_part()
            if not part:
                 results['errors'].append(f"Part {wo_part.part_number}: Not found in inventory")
                 continue

            inventory_status = wo_part.get_inventory_status_payload()
            if inventory_status and inventory_status.get('available'):
                 results['errors'].append(f"Part {wo_part.part_number}: In stock; allocate instead")
                 continue
                 
            supplier = part.preferred_supplier or part.suppliers.first()
            if not supplier:
                 results['errors'].append(f"Part {wo_part.part_number}: No supplier")
                 continue
                 
            branch = wo_part.work_order.branch
            if not branch:
                 results['errors'].append(f"WO {wo_part.work_order.id}: No branch")
                 continue
                 
            # Find/Create PO
            po = PurchaseOrder.objects.filter(
                supplier=supplier,
                branch=branch,
                status='draft'
            ).first()
            
            if not po:
                po = PurchaseOrder.objects.create(
                    supplier=supplier,
                    branch=branch,
                    status='draft',
                    created_by=request.user,
                    notes=f"Auto-generated for Work Orders"
                )
                
            results['po_numbers'].add(po.po_number)
            
            # Create/Update PO Item
            po_item = PurchaseOrderItem.objects.filter(purchase_order=po, part=part).first()
            if po_item:
                po_item.quantity += wo_part.quantity
                po_item.save()

            else:
                unit_cost = Decimal(str(part.cost_price or getattr(part, 'last_cost', None) or '0.01'))
                if unit_cost <= 0:
                    unit_cost = Decimal('0.01')
                po_item = PurchaseOrderItem.objects.create(
                    purchase_order=po,
                    part=part,
                    quantity=int(wo_part.quantity),
                    unit_cost=unit_cost,
                )
                
            wo_part.purchase_order_item = po_item
            wo_part.status = 'po_created'
            wo_part.save()
            results['processed'] += 1
            
        return Response({
            'status': 'success',
            'processed': results['processed'],
            'po_numbers': list(results['po_numbers']),
            'errors': results['errors']
        })

    def perform_create(self, serializer):
        part = serializer.save()
        work_order = part.work_order

        if work_order.status in {'approved', 'in_progress', 'paused'}:
            try:
                work_order.transition_to('additional_work_found', user=self.request.user)
                part.additional_work_triggered = True
                WorkOrderNote.objects.create(
                    work_order=work_order,
                    note_type='parts',
                    note=(
                        f"Additional part requested after customer approval: "
                        f"{part.part_name} x{part.quantity}. Customer approval is required before repairs continue."
                    ),
                    created_by=self.request.user,
                    is_important=True,
                    is_customer_visible=False,
                )
            except ValidationError as exc:
                raise DRFValidationError({'error': '; '.join(exc.messages) if hasattr(exc, 'messages') else str(exc)})
        
        # Trigger notification
        try:
            from apps.notifications_app.triggers import notification_triggers
            notification_triggers.part_requisition_created(part)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to send part requisition notification: {e}")
    @action(detail=True, methods=['post'])
    def mark_installed(self, request, pk=None):
        """Mark part as installed"""
        part = self.get_object()
        if part.status not in ['ready', 'received']:
            return Response(
                {'error': f'Only allocated or received parts can be marked as installed. Current status: {part.status}.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        part.status = 'installed'
        part.installed_at = timezone.now()
        part.installed_by = request.user
        part.save()
        
        serializer = self.get_serializer(part)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def mark_returned(self, request, pk=None):
        """Mark part as returned to stores with a reason."""
        from apps.inventory.models import InventoryTransaction, Part

        part = self.get_object()
        if part.status in ['installed', 'returned']:
            return Response(
                {'error': f'Cannot return a part in {part.status} status.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response(
                {'error': 'A return reason is required when a part is not used.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        previous_status = part.status
        part.status = 'returned'
        part.resolution_notes = reason
        part.save()

        if previous_status == 'ready' and part.inventory_part_id:
            inventory_part = Part.objects.filter(id=part.inventory_part_id).first()
            if inventory_part:
                InventoryTransaction.objects.create(
                    part=inventory_part,
                    transaction_type='adjustment',
                    quantity=part.quantity,
                    balance_after=inventory_part.quantity_in_stock + part.quantity,
                    work_order=part.work_order,
                    reason=f"Returned from WO #{part.work_order.id}: {reason}",
                    created_by=request.user,
                )

        serializer = self.get_serializer(part)
        return Response(serializer.data)


class TechnicianTimeLogViewSet(WorkOrderRelatedPermissionMixin, viewsets.ModelViewSet):
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
                'description': request.data.get('description', 'Field work'),
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


class WorkOrderNoteViewSet(WorkOrderRelatedPermissionMixin, viewsets.ModelViewSet):
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


class WorkOrderPhotoViewSet(WorkOrderRelatedPermissionMixin, viewsets.ModelViewSet):
    """Work Order Photo management"""
    queryset = WorkOrderPhoto.objects.all().select_related('work_order', 'taken_by')
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['work_order', 'photo_type']
    
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

# ============= Public Portal Views =============

class PublicWorkOrderViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    Public access for customers via unique access_token.
    Retrieve-only: no list endpoint (prevents unauthenticated PII enumeration).
    """
    queryset = WorkOrder.objects.all()
    serializer_class = PublicWorkOrderSerializer
    permission_classes = [AllowAny]
    lookup_field = 'access_token'

    def get_queryset(self):
        """Allow access to any work order with a defined access token"""
        return WorkOrder.objects.filter(access_token__isnull=False).select_related(
            'customer', 'customer__user', 'vehicle', 'estimate'
        ).prefetch_related(
            'tasks',
            Prefetch('invoices', queryset=Invoice.objects.order_by('-created_at')),
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, access_token=None):
        """Customer approves the estimate"""
        work_order = self.get_object()

        if work_order.status != 'awaiting_approval':
            return Response(
                {
                    'error': (
                        f"Work order {work_order.work_order_number} is {work_order.get_status_display()} "
                        "and is no longer waiting for customer approval."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        # Log the approval
        approval_notes = request.data.get('notes', 'Approved via Digital Portal')
        
        try:
            recommendation_counts = work_order.pending_recommendation_approval_counts()
            if recommendation_counts['waiting_for_estimate']:
                return Response(
                    {
                        'error': (
                            f"{recommendation_counts['waiting_for_estimate']} recommendation(s) are still waiting for stores estimate."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if recommendation_counts['pending_decision']:
                return Response(
                    {
                        'error': (
                            'Please approve, defer, or decline all priced recommendations before approving the work order.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            work_order.approve_customer_work(
                user=None,
                method='digital',
                notes=approval_notes,
            )

            # Notify
            try:
                notification_triggers.work_order_approved(work_order)
            except Exception:
                 pass # Log error

            return Response({'status': 'approved'})
            
        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def decline(self, request, access_token=None):
        """Customer declines the work"""
        work_order = self.get_object()
        reason = request.data.get('reason', 'Declined via Digital Portal')

        if work_order.status != 'awaiting_approval':
            return Response(
                {
                    'error': (
                        f"Work order {work_order.work_order_number} is {work_order.get_status_display()} "
                        "and is no longer waiting for customer approval."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        try:
            work_order.approved_by_customer = False
            work_order.approved_at = None
            work_order.approval_notes = reason
            work_order.save(update_fields=[
                'approved_by_customer',
                'approved_at',
                'approval_notes',
            ])

            if hasattr(work_order, 'diagnosis') and (
                work_order.diagnosis.is_completed
                or work_order.diagnosis.status == 'awaiting_approval'
            ):
                work_order.diagnosis.reopen_for_revision(
                    user=None,
                    reason=f"Customer declined work via portal. Reason: {reason}",
                )
            elif work_order.status == 'awaiting_approval':
                work_order.diagnosis_completed_at = None
                work_order.save(update_fields=['diagnosis_completed_at'])
                work_order.transition_to('diagnosis', user=None)

            WorkOrderNote.objects.create(
                work_order=work_order,
                note_type='customer',
                note=f"Customer DECLINED work via portal. Reason: {reason}",
                is_important=True
            )
            
            return Response({'status': 'declined', 'work_order_status': work_order.status})
            
        except Exception as e:
             return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
