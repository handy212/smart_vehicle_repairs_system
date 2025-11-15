from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
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
    TechnicianWorkloadSerializer, WorkOrderStatusSummarySerializer
)


class WorkOrderViewSet(viewsets.ModelViewSet):
    """
    Work Order management with comprehensive workflow actions
    """
    queryset = WorkOrder.objects.all().select_related(
        'customer', 'vehicle', 'appointment', 'primary_technician', 'created_by'
    ).prefetch_related('assigned_technicians', 'tasks', 'parts')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    
    filterset_fields = [
        'status', 'priority', 'customer', 'vehicle', 'primary_technician',
        'is_customer_waiting', 'requires_approval', 'approved_by_customer',
        'quality_check_required', 'quality_check_completed', 'is_warranty', 'is_recall'
    ]
    search_fields = [
        'work_order_number', 'customer__user__first_name', 'customer__user__last_name',
        'vehicle__vin', 'vehicle__license_plate', 'customer_concerns', 'diagnosis_notes'
    ]
    ordering_fields = [
        'created_at', 'estimated_completion', 'priority', 'status',
        'estimated_total', 'actual_total'
    ]
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Filter work orders by active branch from session"""
        queryset = super().get_queryset()
        # Check if user wants to see all branches (for admins) or just active branch
        show_all = self.request.query_params.get('all_branches', 'false').lower() == 'true'
        return filter_queryset_for_user_branches(
            queryset, 
            self.request.user, 
            request=self.request, 
            use_active_branch=not show_all
        )

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

        serializer.save(branch=branch)
    
    # ========== STATUS WORKFLOW ACTIONS ==========
    
    @action(detail=True, methods=['post'])
    def start_intake(self, request, pk=None):
        """Move work order to intake status"""
        work_order = self.get_object()
        
        try:
            work_order.transition_to('intake', user=request.user)
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def start_diagnosis(self, request, pk=None):
        """Start diagnosis phase"""
        work_order = self.get_object()
        
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
        requires_approval = request.data.get('requires_approval', False)
        estimated_labor_hours = request.data.get('estimated_labor_hours')
        estimated_labor_cost = request.data.get('estimated_labor_cost')
        estimated_parts_cost = request.data.get('estimated_parts_cost')
        
        if work_order.status != 'diagnosis':
            return Response(
                {'error': 'Work order must be in diagnosis status.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        work_order.diagnosis_notes = diagnosis_notes
        work_order.diagnosis_completed_at = timezone.now()
        work_order.diagnosis_by = request.user
        work_order.requires_approval = requires_approval
        
        # Update estimates
        if estimated_labor_hours:
            work_order.estimated_labor_hours = estimated_labor_hours
        if estimated_labor_cost:
            work_order.estimated_labor_cost = estimated_labor_cost
        if estimated_parts_cost:
            work_order.estimated_parts_cost = estimated_parts_cost
        
        work_order.save()
        
        # Determine next status using transition_to
        try:
            if requires_approval:
                work_order.approval_requested_at = timezone.now()
                work_order.transition_to('awaiting_approval', user=request.user)
            else:
                work_order.transition_to('approved', user=request.user)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = self.get_serializer(work_order)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def request_approval(self, request, pk=None):
        """Request customer approval"""
        work_order = self.get_object()
        
        work_order.requires_approval = True
        work_order.approval_requested_at = timezone.now()
        
        try:
            work_order.transition_to('awaiting_approval', user=request.user)
            
            # Send approval request notification
            try:
                notification_triggers.work_order_requires_approval(work_order)
            except Exception as e:
                print(f"Failed to send approval request notification: {e}")
            
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
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
        work_order = self.get_object()
        
        # Check if work can be started
        can_start, errors = work_order.can_start_work()
        if not can_start:
            return Response(
                {'error': '; '.join(errors)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            work_order.transition_to('in_progress', user=request.user)
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
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
        work_order = self.get_object()
        passed = request.data.get('passed', False)
        notes = request.data.get('notes', '')
        
        if work_order.status != 'quality_check':
            return Response(
                {'error': 'Work order must be in quality check status.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        work_order.quality_check_completed = True
        work_order.quality_check_by = request.user
        work_order.quality_check_at = timezone.now()
        work_order.quality_check_notes = notes
        work_order.quality_check_passed = passed
        
        # Determine next status
        if passed:
            try:
                work_order.transition_to('completed', user=request.user)
                
                # Update vehicle's last service date
                work_order.vehicle.last_service_date = timezone.now().date()
                work_order.vehicle.save()
            except ValidationError as e:
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            # Failed QC, back to in_progress
            try:
                work_order.transition_to('in_progress', user=request.user)
                
                # Send notification about failed QC
                try:
                    notification_triggers.work_order_quality_check_failed(work_order)
                except Exception as e:
                    print(f"Failed to send quality check failed notification: {e}")
            except ValidationError as e:
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
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
            
            # Update vehicle's last service date
            work_order.vehicle.last_service_date = timezone.now().date()
            work_order.vehicle.save()
            
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
        work_order = self.get_object()
        
        try:
            work_order.transition_to('invoiced', user=request.user)
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """Close work order"""
        work_order = self.get_object()
        
        try:
            work_order.transition_to('closed', user=request.user)
            serializer = self.get_serializer(work_order)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    # ========== DATA RETRIEVAL ACTIONS ==========
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get all active work orders (not completed/closed)"""
        active_statuses = ['draft', 'intake', 'diagnosis', 'awaiting_approval', 
                          'approved', 'in_progress', 'paused', 'quality_check']
        work_orders = self.get_queryset().filter(status__in=active_statuses)
        
        page = self.paginate_queryset(work_orders)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(work_orders, many=True)
        return Response(serializer.data)
    
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


class ServiceTaskViewSet(viewsets.ModelViewSet):
    """Service Task management"""
    queryset = ServiceTask.objects.all().select_related('work_order', 'assigned_to')
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
        """Start task"""
        task = self.get_object()
        task.status = 'in_progress'
        task.started_at = timezone.now()
        task.save()
        
        serializer = self.get_serializer(task)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Complete task"""
        task = self.get_object()
        actual_hours = request.data.get('actual_hours')
        notes = request.data.get('notes', '')
        
        task.status = 'completed'
        task.completed_at = timezone.now()
        
        if actual_hours:
            task.actual_hours = actual_hours
        
        if notes:
            task.detailed_notes = notes
        
        task.save()
        
        serializer = self.get_serializer(task)
        return Response(serializer.data)


class WorkOrderPartViewSet(viewsets.ModelViewSet):
    """Work Order Part management"""
    queryset = WorkOrderPart.objects.all().select_related('work_order', 'task', 'installed_by')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['work_order', 'status']
    search_fields = ['part_number', 'part_name', 'description']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return WorkOrderPartCreateSerializer
        return WorkOrderPartSerializer
    
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
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['work_order', 'technician', 'is_billable', 'is_approved']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return TechnicianTimeLogCreateSerializer
        return TechnicianTimeLogSerializer
    
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
