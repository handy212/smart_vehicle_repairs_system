from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from apps.accounts.permissions import HasPermission, user_has_permission
from rest_framework.exceptions import ValidationError as DRFValidationError
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db.models import Q, Sum, Count, F
from django_filters.rest_framework import DjangoFilterBackend
from datetime import timedelta

# Notification triggers
from apps.notifications_app.triggers import notification_triggers

from apps.branches.utils import resolve_branch, filter_queryset_for_user_branches

from .models import (
    WorkOrder, ServiceTask, WorkOrderPart,
    TechnicianTimeLog, WorkOrderNote, WorkOrderPhoto
)
from .serializers import (
    WorkOrderListSerializer, WorkOrderDetailSerializer,
    WorkOrderCreateSerializer, WorkOrderUpdateSerializer,
    ServiceTaskSerializer, ServiceTaskCreateSerializer,
    WorkOrderPartSerializer, WorkOrderPartCreateSerializer,
    TechnicianTimeLogSerializer, TechnicianTimeLogCreateSerializer,
    TechnicianTimeLogClockOutSerializer,
    WorkOrderNoteSerializer, WorkOrderNoteCreateSerializer,
    WorkOrderPhotoSerializer, WorkOrderPhotoCreateSerializer,
    TechnicianWorkloadSerializer, WorkOrderStatusSummarySerializer,
    PublicWorkOrderSerializer
)


from .filters import WorkOrderFilter, TechnicianTimeLogFilter


class WorkOrderViewSet(viewsets.ModelViewSet):
    """
    Work Order management with comprehensive workflow actions
    """
    queryset = WorkOrder.objects.all().select_related(
        'customer', 'customer__user', 'vehicle', 'appointment', 'primary_technician', 'created_by'
    ).prefetch_related('assigned_technicians', 'tasks', 'parts')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    
    # Use custom filterset class instead of filterset_fields
    filterset_class = WorkOrderFilter

    search_fields = [
        'work_order_number', 'customer__user__first_name', 'customer__user__last_name',
        'vehicle__vin', 'vehicle__license_plate', 'customer_concerns', 'diagnosis_notes'
    ]
    ordering_fields = [
        'created_at', 'estimated_completion', 'priority', 'status',
        'estimated_total', 'actual_total', 'work_order_number',
        'customer__user__last_name', 'customer__user__first_name'
    ]
    ordering = ['-created_at']

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated()]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('create_workorders')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('edit_workorders')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('delete_workorders')]
        elif self.action == 'dashboard_stats':
            return [IsAuthenticated()]
        return [IsAuthenticated()]
    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """
        Get statistics for work orders dashboard.
        """
        # Filter by branch if applicable
        queryset = self.get_queryset()
        
        # Calculate stats
        total_workorders = queryset.count()
        in_progress = queryset.filter(status='in_progress').count()
        pending = queryset.filter(status='pending').count()
        completed = queryset.filter(status='completed').count()
        cancelled = queryset.filter(status='cancelled').count()
        
        return Response({
            'total_workorders': total_workorders,
            'in_progress': in_progress,
            'pending': pending,
            'completed': completed,
            'cancelled': cancelled
        })
    
    def get_queryset(self):
        """Filter work orders by active branch and customer profile"""
        queryset = super().get_queryset()
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
        
        # Date range filtering for work orders
        if self.action == 'list':
            date_from = self.request.query_params.get('created_at__gte') or self.request.query_params.get('date_from')
            date_to = self.request.query_params.get('created_at__lte') or self.request.query_params.get('date_to')
            if date_from:
                queryset = queryset.filter(created_at__gte=date_from)
            if date_to:
                queryset = queryset.filter(created_at__lte=date_to)
        
        return queryset

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
        
        # Note: Subscription deductions are handled in the roadside assistance module
        # Work orders are for regular workshop services, not roadside breakdown assistance
    
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
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def check_unapproved_recommendations(self, request):
        """
        Check for unapproved recommendations for a vehicle from previous work orders.
        Query params: vehicle_id (required)
        Returns: List of unapproved recommendations with work order context
        """
        vehicle_id = request.query_params.get('vehicle_id')
        if not vehicle_id:
            return Response(
                {'error': 'vehicle_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from apps.diagnosis.models import Diagnosis, RepairRecommendation
            from apps.vehicles.models import Vehicle
            
            vehicle = Vehicle.objects.get(id=vehicle_id)
            
            # Get completed/invoiced/closed work orders for this vehicle
            completed_work_orders = WorkOrder.objects.filter(
                vehicle=vehicle,
                status__in=['completed', 'invoiced', 'closed']
            ).select_related('customer', 'branch')
            
            unapproved_recommendations = []
            
            for wo in completed_work_orders:
                diagnosis = Diagnosis.objects.filter(work_order=wo).first()
                if diagnosis:
                    recommendations = diagnosis.repair_recommendations.filter(
                        customer_approved=False
                    )
                    for rec in recommendations:
                        unapproved_recommendations.append({
                            'id': rec.id,
                            'description': rec.description,
                            'priority': rec.priority,
                            'priority_display': rec.get_priority_display(),
                            'recommendation_type': rec.recommendation_type,
                            'recommendation_type_display': rec.get_recommendation_type_display(),
                            'estimated_total_cost': str(rec.estimated_total_cost),
                            'work_order_id': wo.id,
                            'work_order_number': wo.work_order_number,
                            'work_order_completed_at': wo.completed_at.isoformat() if wo.completed_at else None,
                            'diagnosis_id': diagnosis.id,
                        })
            
            return Response({
                'vehicle_id': vehicle_id,
                'vehicle_display': vehicle.display_name,
                'count': len(unapproved_recommendations),
                'recommendations': unapproved_recommendations
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

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Generate PDF for work order"""
        from apps.core.services.print_service import generate_work_order_pdf
        
        work_order = self.get_object()
        return generate_work_order_pdf(work_order)
    
    @action(detail=True, methods=['post'])
    def start_intake(self, request, pk=None):
        """Move work order to intake status, then to assigned status after Service Coordinator is assigned"""
        work_order = self.get_object()
        service_coordinator_id = request.data.get('service_coordinator')
        
        try:
            # First transition to intake
            if work_order.status != 'intake':
                work_order.transition_to('intake', user=request.user)
            
            # If Service Coordinator is provided, assign them and transition to assigned
            if service_coordinator_id:
                work_order.service_coordinator_id = service_coordinator_id
                work_order.save(update_fields=['service_coordinator'])
                # Transition to assigned status
                work_order.transition_to('assigned', user=request.user)
            else:
                # Just move to intake if no SC provided yet
                pass
            
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def start_diagnosis(self, request, pk=None):
        """Start diagnosis phase - can only be triggered by Service Coordinator from assigned status"""
        work_order = self.get_object()
        
        # Validate that user is the assigned Service Coordinator or has manager/admin role
        user = request.user
        if work_order.service_coordinator and work_order.service_coordinator != user:
            if user.role not in ['manager', 'admin']:
                return Response(
                    {'error': 'Only the assigned Service Coordinator can trigger diagnosis, or managers/admins.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        try:
            work_order.transition_to('diagnosis', user=request.user)
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def complete_diagnosis(self, request, pk=None):
        """Complete diagnosis and optionally request approval"""
        work_order = self.get_object()
        diagnosis_notes = request.data.get('diagnosis_notes', '')
        # Handle boolean conversion - could be string "true"/"false" or boolean
        requires_approval_raw = request.data.get('requires_approval', False)
        if isinstance(requires_approval_raw, str):
            requires_approval = requires_approval_raw.lower() in ('true', '1', 'yes')
        else:
            requires_approval = bool(requires_approval_raw)
        estimated_labor_hours = request.data.get('estimated_labor_hours')
        estimated_labor_cost = request.data.get('estimated_labor_cost')
        estimated_parts_cost = request.data.get('estimated_parts_cost')
        
        if work_order.status != 'diagnosis':
            return Response(
                {'error': 'Work order must be in diagnosis status.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate diagnosis_notes is provided
        if not diagnosis_notes or not diagnosis_notes.strip():
            return Response(
                {'error': 'Diagnosis notes are required to complete diagnosis.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        work_order.diagnosis_notes = diagnosis_notes
        work_order.diagnosis_completed_at = timezone.now()
        work_order.diagnosis_by = request.user
        work_order.requires_approval = requires_approval
        
        # Update estimates - convert to Decimal and handle None/empty values
        from decimal import Decimal
        if estimated_labor_hours is not None:
            work_order.estimated_labor_hours = Decimal(str(estimated_labor_hours))
        if estimated_labor_cost:
            work_order.estimated_labor_cost = Decimal(str(estimated_labor_cost))
        else:
            work_order.estimated_labor_cost = Decimal('0')
        if estimated_parts_cost:
            work_order.estimated_parts_cost = Decimal(str(estimated_parts_cost))
        else:
            work_order.estimated_parts_cost = Decimal('0')
        
        work_order.save()
        
        # Determine next status using transition_to
        try:
            if requires_approval:
                # Validate that estimated total is greater than 0 when approval is required
                if work_order.estimated_total <= 0:
                    return Response(
                        {'error': 'Estimated total must be greater than 0 when customer approval is required. Please provide estimated labor cost and/or parts cost.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                work_order.approval_requested_at = timezone.now()
                work_order.transition_to('awaiting_approval', user=request.user)
            else:
                # Auto-approve if approval not required
                work_order.approved_by_customer = True
                work_order.approved_at = timezone.now()
                work_order.save()
                # Try to transition to in_progress if technician is assigned
                # If no technician, keep in diagnosis status (approved but waiting for technician)
                if work_order.primary_technician or work_order.assigned_technicians.exists():
                    work_order.transition_to('in_progress', user=request.user)
                # If no technician assigned, work order stays in 'diagnosis' status
                # but is marked as approved, so it can be transitioned to in_progress
                # once a technician is assigned
        except (ValidationError, DRFValidationError) as e:
            # Handle both Django and DRF ValidationErrors
            error_message = str(e)
            if hasattr(e, 'message_dict'):
                # Django ValidationError with message_dict
                error_message = '; '.join([f"{k}: {', '.join(v)}" for k, v in e.message_dict.items()])
            elif hasattr(e, 'messages'):
                # Django ValidationError with messages list
                error_message = '; '.join(e.messages)
            return Response(
                {'error': error_message},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            # Catch any other unexpected errors and return 500 with error details
            import traceback
            return Response(
                {'error': f'An error occurred: {str(e)}', 'detail': traceback.format_exc()},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        try:
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except Exception as e:
            # If serializer fails, return basic work order data with error info
            import traceback
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Serializer error for work order {work_order.id}: {e}")
            logger.error(traceback.format_exc())
            return Response(
                {
                    'error': f'Error serializing work order: {str(e)}',
                    'work_order_id': work_order.id,
                    'work_order_number': work_order.work_order_number,
                    'status': work_order.status
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def request_approval(self, request, pk=None):
        """Request customer approval"""
        from apps.billing.models import Estimate, EstimateLineItem
        from decimal import Decimal
        
        work_order = self.get_object()
        
        work_order.requires_approval = True
        work_order.approval_requested_at = timezone.now()
        
        try:
            # Validate prerequisites
            errors = work_order.validate_before_status_change('awaiting_approval')
            if errors:
                return Response(
                    {'error': '; '.join(errors)},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if estimate already exists (from diagnosis stage)
            estimate = None
            if hasattr(work_order, 'estimate') and work_order.estimate:
                estimate = work_order.estimate
                # Recalculate totals to ensure they're up to date
                estimate.calculate_totals()
                # Update existing estimate status to 'sent'
                estimate.status = 'sent'
                estimate.sent_by = request.user
                estimate.sent_at = timezone.now()
                estimate.save()
            else:
                # Create new estimate from work order data
                estimate = Estimate.objects.create(
                    customer=work_order.customer,
                    vehicle=work_order.vehicle,
                    work_order=work_order,
                    status='sent',
                    estimate_date=timezone.now().date(),
                    valid_until=(timezone.now() + timedelta(days=30)).date(),
                    title=f"Estimate for {work_order.vehicle.year} {work_order.vehicle.make} {work_order.vehicle.model}",
                    description=work_order.diagnosis_notes or work_order.customer_concerns or "Repair estimate",
                    labor_subtotal=work_order.estimated_labor_cost or Decimal('0'),
                    parts_subtotal=work_order.estimated_parts_cost or Decimal('0'),
                    subtotal=work_order.estimated_total or Decimal('0'),
                    total=work_order.estimated_total or Decimal('0'),
                    created_by=request.user,
                    sent_by=request.user,
                )
                
                # Create line items from work order parts
                for part in work_order.parts.all():
                    EstimateLineItem.objects.create(
                        estimate=estimate,
                        item_type='part',
                        description=f"{part.part_name} ({part.part_number})",
                        quantity=part.quantity,
                        unit_price=part.unit_cost,
                        total=part.selling_price,
                        part_number=part.part_number,
                        is_taxable=True,
                    )
                
                # Create line items from work order tasks (labor)
                for task in work_order.tasks.filter(status__in=['pending', 'in_progress', 'completed']):
                    if task.estimated_hours and task.labor_rate:
                        EstimateLineItem.objects.create(
                            estimate=estimate,
                            item_type='labor',
                            description=f"{task.get_task_type_display()} - {task.description}",
                            quantity=task.estimated_hours,
                            unit_price=task.labor_rate,
                            total=task.estimated_hours * task.labor_rate,
                            labor_hours=task.estimated_hours,
                            labor_rate=task.labor_rate,
                            is_taxable=True,
                        )
                
                # Recalculate estimate totals from line items
                estimate.calculate_totals()
                estimate.save()
            
            # Transition work order status
            work_order.transition_to('awaiting_approval', user=request.user)
            
            # Send approval request notification
            try:
                notification_triggers.work_order_requires_approval(work_order)
            except Exception as e:
                print(f"Failed to send approval request notification: {e}")
            
            serializer = self.get_serializer(work_order)
            return Response({
                **serializer.data,
                'estimate_number': estimate.estimate_number if estimate else None,
                'message': f'Estimate #{estimate.estimate_number if estimate else "N/A"} submitted for customer approval'
            })
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Mark work order as approved by customer"""
        work_order = self.get_object()
        approval_method = request.data.get('approval_method', 'phone')
        approval_notes = request.data.get('approval_notes', '')
        
        work_order.approved_by_customer = True
        work_order.approved_at = timezone.now()
        work_order.approval_method = approval_method
        work_order.approval_notes = approval_notes
        
        try:
            work_order.transition_to('approved', user=request.user)
            
            # Send approval notification to technician
            try:
                notification_triggers.work_order_approved(work_order)
            except Exception as e:
                print(f"Failed to send work order approved notification: {e}")
            
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def start_work(self, request, pk=None):
        """Start work on approved work order"""
        import logging
        logger = logging.getLogger(__name__)
        
        work_order = self.get_object()
        logger.info(f"Starting work for WO {work_order.work_order_number}, current status: {work_order.status}")
        
        # Auto-assign current user as technician if none assigned and user is eligible
        # This improves the workflow by removing the friction of manual assignment
        if not work_order.primary_technician and not work_order.assigned_technicians.exists():
            if request.user.role in ['technician', 'manager', 'admin']:
                work_order.primary_technician = request.user
                work_order.save(update_fields=['primary_technician'])
                logger.info(f"Auto-assigned {request.user.username} as primary technician for WO {work_order.work_order_number}")
                
                # Assign to existing tasks if they are unassigned
                work_order.tasks.filter(assigned_to__isnull=True).update(assigned_to=request.user)
        
        # Check if work can be started
        can_start, errors = work_order.can_start_work()
        if not can_start:
            error_msg = '; '.join(errors) if errors else "Cannot start work - validation failed"
            logger.warning(f"Start work failed for WO {work_order.work_order_number}: {errors}")
            return Response(
                {'error': error_msg, 'errors': errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Convert approved repair recommendations to tasks before starting
            tasks_created, parts_linked = work_order.convert_recommendations_to_tasks(user=request.user)
            
            # Transition to in_progress
            work_order.transition_to('in_progress', user=request.user)
            
            # Refresh work order to get updated data
            work_order.refresh_from_db()
            
            serializer = self.get_serializer(work_order)
            response_data = serializer.data
            response_data['tasks_created'] = tasks_created
            response_data['parts_linked'] = parts_linked
            
            return Response(response_data)
        except ValidationError as e:
            # Django ValidationError - convert to string message
            error_msg = str(e)
            # Handle ValidationError messages - they might be a list or string
            if hasattr(e, 'messages') and e.messages:
                error_msg = '; '.join(str(msg) for msg in e.messages)
            elif hasattr(e, 'message_dict'):
                # Handle field-specific errors
                error_msg = '; '.join(f"{k}: {', '.join(v) if isinstance(v, list) else v}" 
                                    for k, v in e.message_dict.items())
            logger.error(f"Django ValidationError starting work for WO {work_order.work_order_number}: {error_msg}")
            # Convert to DRF ValidationError for proper response formatting
            raise DRFValidationError({'error': error_msg, 'detail': error_msg})
        except DRFValidationError as e:
            # DRF ValidationError - already properly formatted
            logger.error(f"DRF ValidationError starting work for WO {work_order.work_order_number}: {e.detail}")
            raise
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Unexpected error starting work for WO {work_order.work_order_number}: {error_msg}", exc_info=True)
            return Response(
                {'error': f'Failed to start work: {error_msg}', 'detail': error_msg},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def print_recommendations(self, request, pk=None):
        """
        Get recommendations data for printing.
        Returns recommendations that are unapproved (not yet approved by customer).
        """
        work_order = self.get_object()
        
        try:
            from apps.diagnosis.models import Diagnosis, RepairRecommendation
            
            # Get diagnosis for this work order
            diagnosis = Diagnosis.objects.filter(work_order=work_order).first()
            
            if not diagnosis:
                return Response(
                    {'error': 'No diagnosis found for this work order'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Filter for unapproved recommendations (as per user selection)
            recommendations = diagnosis.repair_recommendations.filter(
                customer_approved=False
            ).order_by('priority', 'order', 'created_at')
            
            # Serialize recommendations
            from apps.diagnosis.serializers import RepairRecommendationSerializer
            recommendations_data = RepairRecommendationSerializer(recommendations, many=True).data
            
            # Get work order and vehicle details
            work_order_data = {
                'id': work_order.id,
                'work_order_number': work_order.work_order_number,
                'created_at': work_order.created_at,
                'completed_at': work_order.completed_at,
                'status': work_order.status,
            }
            
            vehicle_data = {
                'id': work_order.vehicle.id,
                'year': work_order.vehicle.year,
                'make': work_order.vehicle.make,
                'model': work_order.vehicle.model,
                'vin': work_order.vehicle.vin,
                'license_plate': work_order.vehicle.license_plate,
                'display_name': work_order.vehicle.display_name,
            }
            
            customer_data = {
                'id': work_order.customer.id,
                'customer_number': work_order.customer.customer_number,
                'full_name': work_order.customer.user.get_full_name() if work_order.customer.user else f"Customer #{work_order.customer.id}",
                'company_name': work_order.customer.company_name,
            }
            
            return Response({
                'work_order': work_order_data,
                'vehicle': vehicle_data,
                'customer': customer_data,
                'recommendations': recommendations_data,
                'count': recommendations.count(),
            })
            
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error getting recommendations for print: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Failed to get recommendations: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def recommendations_pdf(self, request, pk=None):
        """
        Generate PDF of recommendations for vehicle dashboard.
        Returns PDF file that can be downloaded.
        """
        from django.http import HttpResponse
        from django.template.loader import render_to_string
        
        work_order = self.get_object()
        
        try:
            from apps.diagnosis.models import Diagnosis, RepairRecommendation
            
            # Get diagnosis for this work order
            diagnosis = Diagnosis.objects.filter(work_order=work_order).first()
            
            if not diagnosis:
                return Response(
                    {'error': 'No diagnosis found for this work order'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Filter for unapproved recommendations
            recommendations = diagnosis.repair_recommendations.filter(
                customer_approved=False
            ).order_by('priority', 'order', 'created_at')
            
            if not recommendations.exists():
                return Response(
                    {'error': 'No unapproved recommendations found for this work order'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Get branch info
            branch = work_order.branch
            
            context = {
                'work_order': work_order,
                'vehicle': work_order.vehicle,
                'customer': work_order.customer,
                'recommendations': recommendations,
                'diagnosis': diagnosis,
                'print_generated_at': timezone.now(),
                'print_branch': branch,
            }
            
            try:
                from weasyprint import HTML
                
                # Render HTML template
                html_string = render_to_string('workorders/recommendations_print.html', context, request=request)
                
                # Generate PDF
                pdf = HTML(string=html_string).write_pdf()
                
                # Return PDF response
                response = HttpResponse(pdf, content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="recommendations_{work_order.work_order_number}.pdf"'
                return response
                
            except ImportError:
                return Response(
                    {'error': 'PDF generation requires WeasyPrint. Please install it: pip install weasyprint'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error generating PDF: {str(e)}", exc_info=True)
                return Response(
                    {'error': f'Error generating PDF: {str(e)}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error getting recommendations for PDF: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Failed to generate PDF: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def check_readiness(self, request, pk=None):
        """Check if work order is ready to start work"""
        work_order = self.get_object()
        
        can_start, errors = work_order.can_start_work()
        unavailable_parts = work_order.check_parts_availability()
        
        return Response({
            'can_start': can_start,
            'errors': errors,
            'unavailable_parts': [
                {
                    'part_name': p['part'].part_name,
                    'reason': p['reason']
                }
                for p in unavailable_parts
            ]
        })
    
    @action(detail=True, methods=['post'])
    def pause(self, request, pk=None):
        """Pause work order"""
        work_order = self.get_object()
        reason = request.data.get('reason', '')
        
        try:
            work_order.transition_to('paused', user=request.user)
            
            # Create note about pause
            WorkOrderNote.objects.create(
                work_order=work_order,
                note_type='internal',
                note=f"Work order paused. Reason: {reason}",
                created_by=request.user
            )
            
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def resume(self, request, pk=None):
        """Resume paused work order"""
        work_order = self.get_object()
        
        try:
            work_order.transition_to('in_progress', user=request.user)
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def request_quality_check(self, request, pk=None):
        """Request quality check"""
        work_order = self.get_object()
        
        try:
            work_order.transition_to('quality_check', user=request.user)
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def quality_check(self, request, pk=None):
        """Perform quality check"""
        import logging
        logger = logging.getLogger(__name__)
        
        work_order = self.get_object()
        passed = request.data.get('passed', False)
        notes = request.data.get('notes', '')
        checklist = request.data.get('checklist', {})
        if not isinstance(checklist, dict):
            checklist = {}
        
        if work_order.status != 'quality_check':
            return Response(
                {'error': 'Work order must be in quality check status.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Build comprehensive notes including checklist results
        checklist_notes = []
        if checklist:
            checklist_items = {
                'allTasksCompleted': 'All tasks completed',
                'allPartsInstalled': 'All parts installed or returned',
                'vehicleClean': 'Vehicle cleaned and presentable',
                'noDamage': 'No new damage or scratches',
                'testDrivePassed': 'Test drive passed',
                'customerSatisfied': 'Customer satisfaction confirmed',
            }
            
            for key, label in checklist_items.items():
                check_mark = '✓' if checklist.get(key, False) else '✗'
                checklist_notes.append(f"{check_mark} {label}")
        
        # Combine checklist and notes
        full_notes = notes
        if checklist_notes:
            checklist_summary = "\n".join(checklist_notes)
            full_notes = f"Quality Check Checklist:\n{checklist_summary}\n\nNotes: {notes}" if notes else f"Quality Check Checklist:\n{checklist_summary}"
        
        work_order.quality_check_completed = True
        work_order.quality_check_by = request.user
        work_order.quality_check_at = timezone.now()
        work_order.quality_check_notes = full_notes
        work_order.quality_check_passed = passed
        
        logger.info(f"Quality check performed for WO {work_order.work_order_number} by {request.user.username}: {'PASSED' if passed else 'FAILED'}")
        
        # Determine next status
        if passed:
            try:
                work_order.transition_to('completed', user=request.user)
                
                # Update vehicle's last service date and schedule
                from .services import update_vehicle_service_schedule
                work_order.vehicle.last_service_date = timezone.now().date()
                work_order.vehicle.save()
                update_vehicle_service_schedule(work_order)
            except ValidationError as e:
                logger.warning(f"Validation error during QC completion for WO {work_order.work_order_number}: {e}")
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )
            except Exception as e:
                logger.error(f"Unexpected error during QC completion for WO {work_order.work_order_number}: {e}", exc_info=True)
                return Response(
                    {'error': f"An unexpected error occurred: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        else:
            # Failed QC, back to in_progress
            try:
                work_order.transition_to('in_progress', user=request.user)
                
                # Send notification about failed QC
                try:
                    notification_triggers.work_order_quality_check_failed(work_order)
                except Exception as e:
                    logger.error(f"Failed to send quality check failed notification: {e}", exc_info=True)
            except ValidationError as e:
                logger.warning(f"Validation error during QC failure transition for WO {work_order.work_order_number}: {e}")
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )
            except Exception as e:
                logger.error(f"Unexpected error during QC failure transition for WO {work_order.work_order_number}: {e}", exc_info=True)
                return Response(
                    {'error': f"An unexpected error occurred: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        
        serializer = self.get_serializer(work_order)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark work order as completed"""
        work_order = self.get_object()
        odometer_out = request.data.get('odometer_out')
        completion_notes = request.data.get('completion_notes', '')
        
        # Skip quality check if not required
        if not work_order.quality_check_required:
            work_order.quality_check_completed = True
            work_order.quality_check_passed = True
            work_order.quality_check_by = request.user
            work_order.quality_check_at = timezone.now()
        
        if odometer_out:
            work_order.odometer_out = odometer_out
        
        try:
            work_order.transition_to('completed', user=request.user)
            
            # Update vehicle's last service date and schedule
            from .services import update_vehicle_service_schedule
            work_order.vehicle.last_service_date = timezone.now().date()
            work_order.vehicle.save()
            update_vehicle_service_schedule(work_order)
            
            # Create completion note
            if completion_notes:
                WorkOrderNote.objects.create(
                    work_order=work_order,
                    note_type='internal',
                    note=f"Work completed. {completion_notes}",
                    created_by=request.user
                )
            
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def mark_invoiced(self, request, pk=None):
        """Mark work order as invoiced"""
        import logging
        logger = logging.getLogger(__name__)
        
        work_order = self.get_object()
        odometer_out = request.data.get('odometer_out')
        
        # Set odometer_out if provided in request
        if odometer_out and not work_order.odometer_out:
            try:
                work_order.odometer_out = int(odometer_out)
                work_order.save(update_fields=['odometer_out'])
                logger.info(f"Set odometer_out={odometer_out} for WO {work_order.work_order_number}")
            except (ValueError, TypeError):
                return Response(
                    {'error': 'Invalid odometer_out value. Must be a positive integer.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        try:
            work_order.transition_to('invoiced', user=request.user)
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            error_msg = str(e)
            # Provide helpful error message
            if 'odometer out' in error_msg.lower():
                error_msg = "Odometer out reading is required. Please provide the odometer reading before marking as invoiced."
            logger.warning(f"Failed to mark WO {work_order.work_order_number} as invoiced: {error_msg}")
            return Response(
                {'error': error_msg},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """Close work order after customer pickup"""
        import logging
        logger = logging.getLogger(__name__)
        
        work_order = self.get_object()
        payment_received = request.data.get('payment_received', True)
        closing_notes = request.data.get('closing_notes', '')
        
        # Store closing information in notes if provided
        if closing_notes:
            from apps.workorders.models import WorkOrderNote
            WorkOrderNote.objects.create(
                work_order=work_order,
                created_by=request.user,
                note_type='internal',
                content=f"Closing Notes: {closing_notes}\nPayment Received: {'Yes' if payment_received else 'No'}",
            )
        
        try:
            work_order.transition_to('closed', user=request.user)
            logger.info(f"Work order {work_order.work_order_number} closed by {request.user.username}. Payment: {payment_received}")
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            error_msg = str(e)
            logger.warning(f"Failed to close WO {work_order.work_order_number}: {error_msg}")
            return Response(
                {'error': error_msg},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    # ========== DATA RETRIEVAL ACTIONS ==========
    
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
            total_actual=Sum('actual_total')
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
        
        for tech in technicians:
            active_wos = WorkOrder.objects.filter(
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
    
    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        """Reopen a closed work order"""
        work_order = self.get_object()
        
        if work_order.status != 'closed':
            return Response(
                {'error': 'Only closed work orders can be reopened'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Determine appropriate status based on context
        # Check if there's an invoice
        from apps.billing.models import Invoice
        has_invoice = Invoice.objects.filter(work_order=work_order).exists()
        
        if has_invoice:
            new_status = 'invoiced'
        elif work_order.completed_at:
            new_status = 'completed'
        else:
            new_status = 'in_progress'
        
        try:
            # Use notify=False to avoid sending notifications on reopen
            work_order.transition_to(new_status, user=request.user, notify=False)
            
            # Create note
            WorkOrderNote.objects.create(
                work_order=work_order,
                note_type='internal',
                note='Work order reopened',
                created_by=request.user
            )
            
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'])
    def bulk_update_status(self, request):
        """Bulk update status for multiple work orders"""
        work_order_ids = request.data.get('work_order_ids', [])
        new_status = request.data.get('status')
        
        if not work_order_ids or not new_status:
            return Response(
                {'error': 'work_order_ids and status are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if new_status not in dict(WorkOrder.STATUS_CHOICES):
            return Response(
                {'error': 'Invalid status'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get work orders
        work_orders = self.get_queryset().filter(id__in=work_order_ids)
        updated = []
        errors = []
        
        for wo in work_orders:
            can_transition, error = wo.can_transition_to(new_status)
            if can_transition:
                field_errors = wo.validate_before_status_change(new_status)
                if not field_errors:
                    try:
                        wo.transition_to(new_status, request.user)
                        updated.append(wo.id)
                    except ValidationError as e:
                        errors.append({
                            'work_order_id': wo.id,
                            'work_order_number': wo.work_order_number,
                            'error': str(e)
                        })
                else:
                    errors.append({
                        'work_order_id': wo.id,
                        'work_order_number': wo.work_order_number,
                        'error': '; '.join(field_errors)
                    })
            else:
                errors.append({
                    'work_order_id': wo.id,
                    'work_order_number': wo.work_order_number,
                    'error': error
                })
        
        return Response({
            'updated': updated,
            'updated_count': len(updated),
            'errors': errors,
            'error_count': len(errors)
        })
    
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
                status=status.HTTP_404_NOT_FOUND
            )
            
        return Response(prediction)
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
        
        for wo in queryset.select_related('customer', 'customer__user', 'primary_technician', 'branch'):
            revenue = wo.actual_total or Decimal('0')
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



class ServiceTaskViewSet(viewsets.ModelViewSet):
    """Service Task management"""
    queryset = ServiceTask.objects.all().select_related('work_order', 'assigned_to').prefetch_related('time_logs')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['work_order', 'status', 'task_type', 'assigned_to']
    ordering_fields = ['sequence_order', 'created_at']
    ordering = ['work_order', 'sequence_order']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return ServiceTaskCreateSerializer
        return ServiceTaskSerializer
    
    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """Start task and auto-clock in technician"""
        task = self.get_object()
        
        # Don't restart if already in progress (unless multiple techs can work on it - typically one main status)
        # But we can allow multiple technicians to clock in.
        
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
        
        task.status = 'completed'
        task.completed_at = timezone.now()
        
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
                log.clock_out = timezone.now()
                # Calculate hours if needed, mostly handled by save() or property?
                # Let's ensure notes are added if provided
                if notes:
                    if log.notes:
                        log.notes += f"\nCompletion Note: {notes}"
                    else:
                        log.notes = f"Completion Note: {notes}"
                log.save()
        
        if actual_hours:
            task.actual_hours = actual_hours
        
        if notes:
            task.detailed_notes = notes
        
        task.save()
        
        # Recalculate totals on Work Order
        task.work_order.recalculate_totals()
        
        serializer = self.get_serializer(task)
        return Response(serializer.data)


class WorkOrderPartViewSet(viewsets.ModelViewSet):
    """Work Order Part management"""
    queryset = WorkOrderPart.objects.all().select_related('work_order', 'task', 'installed_by')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['work_order', 'status']
    search_fields = ['part_number', 'part_name', 'description']
    
    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """
        Get statistics for parts requests dashboard.
        """
        queryset = self.get_queryset()
        total_requests = queryset.count()
        pending_requests = queryset.filter(status='pending').count()
        ordered_requests = queryset.filter(status='ordered').count()
        received_requests = queryset.filter(status='received').count()
        
        return Response({
            'total_requests': total_requests,
            'pending_requests': pending_requests,
            'ordered_requests': ordered_requests,
            'received_requests': received_requests
        })

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
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
    
    @action(detail=True, methods=['post'])
    def allocate(self, request, pk=None):
        """Allocate part from inventory"""
        from apps.inventory.models import Part
        
        wo_part = self.get_object()
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

        # Find part
        part = Part.objects.filter(part_number=wo_part.part_number).first()
        if not part:
            return Response(
                {'error': 'Part not found in inventory'}, 
                status=status.HTTP_404_NOT_FOUND
            )
            
        # Check Branch
        if part.branch and wo_part.work_order.branch and part.branch != wo_part.work_order.branch:
             return Response(
                 {'error': f'Inventory part is at {part.branch.name}, cannot allocate to {wo_part.work_order.branch.name}'},
                 status=status.HTTP_400_BAD_REQUEST
             )
             
        # Check Stock
        if part.quantity_in_stock < wo_part.quantity:
             return Response(
                 {'error': f'Insufficient stock. Required: {wo_part.quantity}, Available: {part.quantity_in_stock}'},
                 status=status.HTTP_400_BAD_REQUEST
             )
             
        # Execute Allocation
        from django.db import transaction
        try:
            with transaction.atomic():
                # Re-fetch part with lock to prevent race conditions
                part = Part.objects.select_for_update().get(id=part.id)
                
                # Check Stock again under lock
                if part.quantity_in_stock < wo_part.quantity:
                     return Response(
                         {'error': f'Insufficient stock. Required: {wo_part.quantity}, Available: {part.quantity_in_stock}'},
                         status=status.HTTP_400_BAD_REQUEST
                     )

                from apps.inventory.models import InventoryTransaction
                
                # Create transaction (negative quantity for usage)
                # Note: The model's save() method will automatically:
                # 1. Update part.quantity_in_stock (old_stock + quantity)
                # 2. Set balance_after to the new stock level
                InventoryTransaction.objects.create(
                    part=part,
                    transaction_type='sale',
                    quantity=-wo_part.quantity,
                    balance_after=part.quantity_in_stock - wo_part.quantity, # Model recalculates this, but providing expected value
                    work_order=wo_part.work_order,
                    reason=f"Allocated to WO #{wo_part.work_order.id}",
                    created_by=request.user
                )
                
                wo_part.status = 'ready'
                wo_part.inventory_part = part
                wo_part.save()
            
            serializer = self.get_serializer(wo_part)
            return Response(serializer.data)
        except Exception as e:
            import traceback
            # Log the full error for debugging
            print(f"Error in allocate: {e}")
            print(traceback.format_exc())
            return Response(
                {'error': f"Allocation failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def order(self, request, pk=None):
        """Create/Add to Purchase Order"""
        from apps.inventory.models import Part, PurchaseOrder, PurchaseOrderItem
        
        wo_part = self.get_object()
        
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
        part = Part.objects.filter(part_number=wo_part.part_number).first()
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
            po_item = PurchaseOrderItem.objects.create(
                purchase_order=po,
                part=part,
                quantity=wo_part.quantity,
                unit_cost=part.cost_price or part.last_cost or 0
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
        po_item = PurchaseOrderItem.objects.create(
            purchase_order=po,
            part=part,
            quantity=wo_part.quantity,
            unit_cost=part.cost_price
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
        from apps.inventory.models import Part, PurchaseOrder, PurchaseOrderItem
        
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
            if wo_part.quantity <= 0:
                results['errors'].append(f"Part {wo_part.id}: Quantity must be positive")
                continue

            if not wo_part.part_number:
                results['errors'].append(f"Part {wo_part.id}: Missing part number")
                continue
                
            # Identify Part & Supplier
            part = Part.objects.filter(part_number=wo_part.part_number).first()
            if not part:
                 results['errors'].append(f"Part {wo_part.part_number}: Not found in inventory")
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
                po_item = PurchaseOrderItem.objects.create(
                    purchase_order=po,
                    part=part,
                    quantity=wo_part.quantity,
                    unit_cost=part.cost_price or part.last_cost or 0
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
    @action(detail=True, methods=['post'])
    def mark_installed(self, request, pk=None):
        """Mark part as installed"""
        part = self.get_object()
        part.status = 'installed'
        part.installed_at = timezone.now()
        part.installed_by = request.user
        part.save()
        
        serializer = self.get_serializer(part)
        return Response(serializer.data)


class TechnicianTimeLogViewSet(viewsets.ModelViewSet):
    """Technician Time Log management"""
    queryset = TechnicianTimeLog.objects.all().select_related('work_order', 'task', 'technician')
    permission_classes = [IsAuthenticated]
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


class WorkOrderNoteViewSet(viewsets.ModelViewSet):
    """Work Order Note management"""
    queryset = WorkOrderNote.objects.all().select_related('work_order', 'created_by')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['work_order', 'note_type', 'is_important', 'is_customer_visible']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return WorkOrderNoteCreateSerializer
        return WorkOrderNoteSerializer


class WorkOrderPhotoViewSet(viewsets.ModelViewSet):
    """Work Order Photo management"""
    queryset = WorkOrderPhoto.objects.all().select_related('work_order', 'taken_by')
    permission_classes = [IsAuthenticated]
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

class PublicWorkOrderViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Public access for customers via unique access_token.
    Allows viewing status/details and approving/declining work.
    """
    queryset = WorkOrder.objects.all()
    serializer_class = PublicWorkOrderSerializer
    permission_classes = [AllowAny]
    lookup_field = 'access_token'

    def get_queryset(self):
        """Allow access to any work order with a defined access token"""
        return WorkOrder.objects.filter(access_token__isnull=False)

    @action(detail=True, methods=['post'])
    def approve(self, request, access_token=None):
        """Customer approves the estimate"""
        work_order = self.get_object()
        
        # Log the approval
        approval_notes = request.data.get('notes', 'Approved via Digital Portal')
        
        try:
            work_order.approved_by_customer = True
            work_order.approved_at = timezone.now()
            work_order.approval_method = 'digital'
            work_order.approval_notes = approval_notes
            
            # Transition status
            if work_order.status == 'awaiting_approval':
                work_order.transition_to('approved', user=None) # No user for public action
                
                # Notify
                try:
                    notification_triggers.work_order_approved(work_order)
                except Exception as e:
                     pass # Log error
            
            work_order.save()
            return Response({'status': 'approved'})
            
        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def decline(self, request, access_token=None):
        """Customer declines the work"""
        work_order = self.get_object()
        reason = request.data.get('reason', 'Declined via Digital Portal')
        
        try:
            # We don't have a specific 'declined' status in the main workflow map often,
            # usually it stays in awaiting_approval or goes to a specialized status.
            # For now, we'll just log it and maybe keep status or set to specific if exists.
            
            # Create a note
            WorkOrderNote.objects.create(
                work_order=work_order,
                note_type='customer',
                note=f"Customer DECLINED work via portal. Reason: {reason}",
                is_important=True
            )
            
            return Response({'status': 'declined'})
            
        except Exception as e:
             return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
