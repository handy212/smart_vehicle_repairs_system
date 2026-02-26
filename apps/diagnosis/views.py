from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import HasPermission
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from decimal import Decimal

from apps.diagnosis.models import (
    Diagnosis, RepairRecommendation,
    DiagnosticCode, DiagnosticTest,
    DiagnosisFinding, DiagnosisPhoto,
    TestProcedureLibrary, DiagnosticCodeLibrary,
    DiagnosisHistory
)
from apps.core.services.ai_service import AIService
from apps.branches.utils import resolve_branch, get_user_accessible_branches
from django.db.models import Q
from apps.diagnosis.serializers import (
    DiagnosisListSerializer, DiagnosisDetailSerializer,
    DiagnosisCreateSerializer, DiagnosisUpdateSerializer,
    RepairRecommendationSerializer, RepairRecommendationCreateSerializer,
    DiagnosticCodeSerializer, DiagnosticCodeCreateSerializer,
    DiagnosticTestSerializer, DiagnosticTestCreateSerializer,
    DiagnosisFindingSerializer, DiagnosisFindingCreateSerializer,
    DiagnosisPhotoSerializer, DiagnosisPhotoCreateSerializer,
    TestProcedureLibrarySerializer, DiagnosticCodeLibrarySerializer,
    DiagnosisHistorySerializer
)


def filter_diagnosis_queryset_for_branches(queryset, user, request, branch_lookup='work_order__branch'):
    """
    Helper function to filter diagnosis-related querysets by branch access AND customer ownership.
    Handles nested lookups like 'work_order__branch' or 'diagnosis__work_order__branch'.
    Includes unassigned items (where branch is null) to handle migration period.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return queryset.none()
    
    # Customer ownership check - HIGHEST PRIORITY for security
    if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
        customer = user.customer_profile
        # Determine the customer lookup path based on the branch_lookup
        # If branch_lookup is 'work_order__branch', customer lookup is 'work_order__customer'
        # If branch_lookup is 'diagnosis__work_order__branch', customer lookup is 'diagnosis__work_order__customer'
        if 'work_order__branch' in branch_lookup:
            customer_lookup = branch_lookup.replace('__branch', '__customer')
            return queryset.filter(**{customer_lookup: customer})
        
        # Fallback for models that might have a direct customer link or work_order link
        if hasattr(queryset.model, 'customer'):
            return queryset.filter(customer=customer)
        if hasattr(queryset.model, 'work_order'):
            return queryset.filter(work_order__customer=customer)
        
        # If we can't find a customer path, return none for safety if it's a customer
        return queryset.none()

    # Staff branch filtering follows
    # Check if user wants to see all branches (for admins) or just active branch
    show_all = request.query_params.get('all_branches', 'false').lower() == 'true' if request else False
    use_active_branch = not show_all
    
    # Admins can see all branches unless use_active_branch is True and active branch is set
    if getattr(user, "role", None) == "admin":
        if use_active_branch and request:
            active_branch = resolve_branch(request)
            if active_branch:
                # Admin filtering by active branch: show that branch + unassigned (for migration)
                branch_q = Q(**{branch_lookup: active_branch}) | Q(**{f"{branch_lookup}__isnull": True})
                return queryset.filter(branch_q)
        # Admin not filtering or no active branch: show all
        return queryset
    
    # For non-admins, check if we should use active branch
    if use_active_branch and request:
        active_branch = resolve_branch(request)
        if active_branch and user.has_branch_access(active_branch):
            # Show items from active branch + unassigned (for migration)
            branch_q = Q(**{branch_lookup: active_branch}) | Q(**{f"{branch_lookup}__isnull": True})
            return queryset.filter(branch_q)
        # No active branch or no access
        return queryset.none()
    
    # Fall back to all accessible branches
    branches = get_user_accessible_branches(user)
    if branches.exists():
        # Include unassigned items (for migration period)
        # Convert to list of IDs for nested lookup compatibility
        branch_ids = list(branches.values_list('id', flat=True))
        # For nested lookups like 'work_order__branch', use 'work_order__branch__id__in'
        if branch_ids:
            # Build the correct lookup: 'work_order__branch__id__in' not 'work_order__branch_id__in'
            branch_id_lookup = f"{branch_lookup}__id__in"
            branch_q = Q(**{branch_id_lookup: branch_ids}) | Q(**{f"{branch_lookup}__isnull": True})
            return queryset.filter(branch_q)
        else:
            # No accessible branches, only show unassigned
            return queryset.filter(**{f"{branch_lookup}__isnull": True})
    
    return queryset.none()


class DiagnosisViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Diagnosis records.
    
    list: Get all diagnoses
    retrieve: Get single diagnosis with full details
    create: Create new diagnosis (one per work order)
    update: Update diagnosis
    partial_update: Partially update diagnosis
    destroy: Delete diagnosis
    
    Custom actions:
    - complete: Mark diagnosis as completed
    - recommendations: Get all recommendations for this diagnosis
    """
    queryset = Diagnosis.objects.all().select_related(
        'work_order', 'work_order__customer', 'work_order__vehicle',
        'technician'
    ).prefetch_related(
        'repair_recommendations',
        'diagnostic_codes',
        'diagnostic_tests',
        'findings',
        'photos',
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'is_completed', 'technician', 'work_order']
    search_fields = [
        'work_order__work_order_number', 'customer_complaint',
        'root_cause', 'diagnostic_notes'
    ]
    ordering_fields = ['started_at', 'completed_at', 'created_at', 'diagnostic_fee']
    ordering = ['-started_at']
    
    def get_queryset(self):
        """Filter diagnoses by active branch from session"""
        queryset = super().get_queryset()
        return filter_diagnosis_queryset_for_branches(
            queryset, 
            self.request.user, 
            self.request, 
            branch_lookup='work_order__branch'
        )
    
    def get_serializer_class(self):
        if self.action == 'list':
            return DiagnosisListSerializer
        elif self.action == 'create':
            return DiagnosisCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return DiagnosisUpdateSerializer
        return DiagnosisDetailSerializer
    
    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """Start the diagnosis"""
        diagnosis = self.get_object()
        
        if diagnosis.start(user=request.user):
            diagnosis.refresh_from_db()
            serializer = self.get_serializer(diagnosis)
            return Response({
                'message': 'Diagnosis started',
                'diagnosis': serializer.data
            })
        else:
            return Response(
                {'error': f'Cannot start diagnosis. Current status: {diagnosis.get_status_display()}'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def pause(self, request, pk=None):
        """
        Pause the diagnosis
        
        Request body (optional):
        {
            "reason": "string"  # Optional reason for pausing
        }
        """
        diagnosis = self.get_object()
        reason = request.data.get('reason', '')
        
        if diagnosis.pause(user=request.user, reason=reason):
            diagnosis.refresh_from_db()
            serializer = self.get_serializer(diagnosis)
            return Response({
                'message': 'Diagnosis paused',
                'diagnosis': serializer.data
            })
        else:
            return Response(
                {'error': f'Cannot pause diagnosis. Current status: {diagnosis.get_status_display()}'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def resume(self, request, pk=None):
        """Resume the diagnosis"""
        diagnosis = self.get_object()
        
        if diagnosis.resume(user=request.user):
            diagnosis.refresh_from_db()
            serializer = self.get_serializer(diagnosis)
            return Response({
                'message': 'Diagnosis resumed',
                'diagnosis': serializer.data
            })
        else:
            return Response(
                {'error': f'Cannot resume diagnosis. Current status: {diagnosis.get_status_display()}'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """
        Mark diagnosis as completed and sync with WorkOrder status
        
        Request body (optional):
        {
            "requires_approval": true/false  # Override diagnosis requires_approval setting
        }
        """
        diagnosis = self.get_object()
        
        # Check if diagnosis can be completed
        if diagnosis.status not in ['in_progress', 'paused']:
            return Response(
                {'error': f'Cannot complete diagnosis. Current status: {diagnosis.get_status_display()}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get requires_approval from request if provided
        requires_approval = None
        if 'requires_approval' in request.data:
            requires_approval_raw = request.data.get('requires_approval', None)
            if requires_approval_raw is not None:
                if isinstance(requires_approval_raw, str):
                    requires_approval = requires_approval_raw.lower() in ('true', '1', 'yes')
                else:
                    requires_approval = bool(requires_approval_raw)
        
        # Complete diagnosis (this will auto-sync with WorkOrder)
        diagnosis.complete(requires_approval=requires_approval)
        
        # Refresh diagnosis and work_order from DB to get updated status
        diagnosis.refresh_from_db()
        work_order = diagnosis.work_order
        work_order.refresh_from_db()
        
        # Phase 3: Update diagnosis history
        try:
            DiagnosisHistory.update_from_diagnosis(diagnosis)
        except Exception as e:
            # Log error but don't fail the completion
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to update diagnosis history: {e}")
            
        # Predictive Pre-Booking: Predict next service
        prediction = None
        try:
            if work_order and work_order.vehicle:
                history = work_order.vehicle.work_orders.filter(status__in=['completed', 'invoiced', 'closed']).order_by('-created_at')[:5]
                if history.exists():
                    prediction = AIService.predict_next_service(list(history))
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to predict next service: {e}")
        
        serializer = self.get_serializer(diagnosis)
        return Response({
            'message': 'Diagnosis marked as completed',
            'diagnosis': serializer.data,
            'prediction': prediction,
            'work_order': {
                'id': work_order.id,
                'status': work_order.status,
                'requires_approval': work_order.requires_approval,
                'diagnosis_completed_at': work_order.diagnosis_completed_at.isoformat() if work_order.diagnosis_completed_at else None,
            }
        })
    
    @action(detail=True, methods=['post'])
    def sync_obd_codes(self, request, pk=None):
        """
        Sync DTC codes directly from an OBD-II scanner
        
        Request body:
        {
            "codes": [
                {"code": "P0301", "description": "Cylinder 1 Misfire Detected", "status": "active"},
                {"code": "P0171", "description": "System Too Lean (Bank 1)", "status": "pending"}
            ]
        }
        """
        diagnosis = self.get_object()
        codes_data = request.data.get('codes', [])
        
        if not isinstance(codes_data, list):
            return Response(
                {"error": "codes must be a list of code objects"},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        synced_codes = []
        for code_item in codes_data:
            code_str = code_item.get('code')
            if not code_str:
                continue
                
            code_obj, created = DiagnosticCode.objects.get_or_create(
                diagnosis=diagnosis,
                code_number=code_str.upper(),
                defaults={
                    'code_type': 'OBD-II',
                    'description': code_item.get('description', 'Auto-synced from scanner'),
                    'status': code_item.get('status', 'active'),
                    'severity': 'warning'  # Default for auto-sync
                }
            )
            
            if not created:
                # Update existing if needed
                code_obj.status = code_item.get('status', code_obj.status)
                if 'description' in code_item:
                    code_obj.description = code_item['description']
                code_obj.save(update_fields=['status', 'description'])
                
            synced_codes.append(code_obj.code_number)
            
        # Refresh the diagnosis codes
        codes = diagnosis.diagnostic_codes.all()
        serializer = DiagnosticCodeSerializer(codes, many=True)
        
        return Response({
            'message': f'Successfully synced {len(synced_codes)} codes',
            'synced_codes': synced_codes,
            'codes': serializer.data
        })
    
    @action(detail=True, methods=['get'])
    def recommendations(self, request, pk=None):
        """Get all recommendations for this diagnosis"""
        diagnosis = self.get_object()
        recommendations = diagnosis.repair_recommendations.all()
        serializer = RepairRecommendationSerializer(recommendations, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def suggest_recommendations(self, request, pk=None):
        """Get AI-powered repair recommendations based on diagnostic data"""
        diagnosis = self.get_object()
        suggestions = AIService.suggest_recommendations(diagnosis)
        return Response(suggestions)
    
    @action(detail=True, methods=['post'])
    def add_recommendation(self, request, pk=None):
        """Add a repair recommendation to this diagnosis"""
        diagnosis = self.get_object()
        serializer = RepairRecommendationCreateSerializer(
            data=request.data,
            context={'request': request}
        )
        
        if serializer.is_valid():
            serializer.save(diagnosis=diagnosis)
            return Response(
                RepairRecommendationSerializer(serializer.instance).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def approve_recommendations(self, request, pk=None):
        """
        Approve or decline recommendations
        
        Request body:
        {
            "recommendation_ids": [1, 2, 3],  # IDs of recommendations to approve/decline
            "approved": true  # true to approve, false to decline
        }
        """
        diagnosis = self.get_object()
        recommendation_ids = request.data.get('recommendation_ids', [])
        approved = request.data.get('approved', True)
        
        if not recommendation_ids:
            return Response(
                {"error": "recommendation_ids is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        recommendations = diagnosis.repair_recommendations.filter(id__in=recommendation_ids)
        
        if not recommendations.exists():
            return Response(
                {"error": "No recommendations found with the provided IDs"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        updated_count = recommendations.update(customer_approved=approved)
        
        # Return updated recommendations
        updated_recommendations = diagnosis.repair_recommendations.filter(id__in=recommendation_ids)
        serializer = RepairRecommendationSerializer(updated_recommendations, many=True)
        
        return Response({
            'message': f'Successfully {"approved" if approved else "declined"} {updated_count} recommendation(s)',
            'recommendations': serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def convert_recommendations_to_tasks(self, request, pk=None):
        """
        Convert approved repair recommendations to ServiceTasks
        
        Request body (optional):
        {
            "recommendation_ids": [1, 2, 3],  # Specific recommendations to convert (if not provided, converts all approved)
            "assign_to_technician": true  # Auto-assign to diagnosis technician
        }
        """
        from apps.workorders.models import ServiceTask
        from django.db import transaction
        from django.db.models import Max
        
        diagnosis = self.get_object()
        work_order = diagnosis.work_order
        
        if not work_order:
            return Response(
                {"error": "Diagnosis is not linked to a work order."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get recommendations to convert
        recommendation_ids = request.data.get('recommendation_ids', [])
        assign_to_technician = request.data.get('assign_to_technician', True)
        
        if recommendation_ids:
            recommendations = diagnosis.repair_recommendations.filter(
                id__in=recommendation_ids
            )
        else:
            # Convert all approved recommendations
            recommendations = diagnosis.repair_recommendations.filter(
                customer_approved=True,
                converted_to_task__isnull=True  # Not already converted
            )
        
        if not recommendations.exists():
            return Response(
                {
                    "error": "No approved recommendations found to convert.",
                    "message": "Please approve recommendations first before converting to tasks."
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Mapping from recommendation_type to task_type
        TYPE_MAPPING = {
            'repair': 'repair',
            'replace': 'replacement',
            'service': 'maintenance',
            'adjust': 'adjustment',
            'clean': 'cleaning',
            'inspect': 'inspection',
        }
        
        # Priority to sequence order mapping
        PRIORITY_ORDER = {
            'critical': 1,
            'necessary': 2,
            'recommended': 3,
            'advisory': 4,
        }
        
        created_tasks = []
        errors = []
        
        try:
            with transaction.atomic():
                # Get max sequence order for this work order
                max_sequence = work_order.tasks.aggregate(
                    max_seq=Max('sequence_order')
                )['max_seq'] or 0
                
                # Sort recommendations by priority and order
                recommendations_list = list(recommendations.order_by('priority', 'order', 'id'))
                
                # Group by priority to ensure proper ordering
                current_sequence = max_sequence
                
                for rec in recommendations_list:
                    try:
                        # Skip if already converted
                        if rec.converted_to_task_id:
                            continue
                        
                        # Map recommendation type to task type
                        task_type = TYPE_MAPPING.get(rec.recommendation_type, 'other')
                        
                        # Incremented sequence order for each task
                        current_sequence += 1
                        sequence_order = current_sequence
                        
                        # Defend against None or invalid values sent from UI with complete fallback
                        est_labor_hours = rec.estimated_labor_hours or Decimal('0.00')
                        est_labor_cost = rec.estimated_labor_cost or Decimal('0.00')
                        
                        # Calculate labor cost and rate with safe defaults (especially when hours = 0)
                        labor_cost = Decimal('0.00')
                        labor_rate = Decimal('75.00')  # Default rate

                        if est_labor_hours > Decimal('0.00'):
                            if est_labor_cost > Decimal('0.00'):
                                labor_cost = est_labor_cost
                                labor_rate = est_labor_cost / est_labor_hours
                            else:
                                labor_cost = est_labor_hours * labor_rate
                        elif est_labor_cost > Decimal('0.00'):
                            # Edge case: Cost provided but no hours
                            labor_cost = est_labor_cost
                            # We can't determine a valid rate, leave as default but cost is fixed.
                        
                        # Create ServiceTask
                        task = ServiceTask.objects.create(
                            work_order=work_order,
                            task_type=task_type,
                            description=rec.description[:255],  # Ensure fits max_length
                            detailed_notes=f"Converted from diagnosis recommendation. Priority: {rec.get_priority_display()}. Recommendation Type: {rec.get_recommendation_type_display()}.",
                            status='pending',
                            sequence_order=sequence_order,
                            estimated_hours=est_labor_hours,
                            labor_rate=labor_rate,
                            labor_cost=labor_cost,
                            assigned_to=diagnosis.technician if (assign_to_technician and diagnosis.technician) else None,
                            is_workflow_task=True,
                        )
                        
                        # Link back to recommendation
                        rec.converted_to_task = task
                        rec.save(update_fields=['converted_to_task'])
                        
                        created_tasks.append({
                            'id': task.id,
                            'description': task.description,
                            'task_type': task.task_type,
                            'recommendation_id': rec.id,
                            'sequence_order': sequence_order,
                        })
                        
                    except Exception as e:
                        import logging
                        logger = logging.getLogger(__name__)
                        logger.error(f"Error converting recommendation {rec.id} to task: {e}", exc_info=True)
                        errors.append({
                            'recommendation_id': rec.id,
                            'error': str(e)
                        })
                
                if not created_tasks and errors:
                    return Response(
                        {
                            "error": "Failed to convert recommendations",
                            "errors": errors
                        },
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                return Response({
                    'message': f'Successfully converted {len(created_tasks)} recommendation(s) to tasks.',
                    'tasks_created': created_tasks,
                    'errors': errors if errors else None,
                }, status=status.HTTP_201_CREATED)
                
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error converting recommendations to tasks: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to convert recommendations: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def request_parts_estimate(self, request, pk=None):
        """Notify Parts Manager that parts are required for this diagnosis"""
        from apps.notifications_app.models import Notification
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        diagnosis = self.get_object()
        work_order = diagnosis.work_order
        
        # Check if any parts are requested (WorkOrderPart)
        parts = work_order.parts.all()
        parts_count = parts.count()
        if parts_count == 0:
             return Response(
                {"error": "No parts requested. Please add parts before requesting an estimate."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Update draft parts to pending
        updated_count = parts.filter(status='draft').update(status='pending')

        # Use notification triggers to send notifications (Email/In-App only, as requested)
        try:
            from apps.notifications_app.triggers import NotificationTriggers
            triggers = NotificationTriggers()
            notification_count = triggers.parts_estimate_requested(work_order, diagnosis, request.user)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                "Error sending parts estimate notification: %s", e, exc_info=True
            )
            notification_count = 0
            
        return Response({
            "message": f"Parts estimate requested. Notified {notification_count} parts manager(s).",
            "parts_count": parts_count,
            "notified_count": notification_count
        })
    
    @action(detail=True, methods=['get'])
    def generate_report(self, request, pk=None):
        """Generate customer-friendly diagnosis report (Phase 3: Customer Report Generator)"""
        from django.http import HttpResponse
        from django.template.loader import render_to_string
        from django.utils import timezone
        
        diagnosis = self.get_object()
        format_type = request.query_params.get('format', 'html')  # html, pdf, text
        
        from apps.core.services.ai_service import AIService
        ai_summary = AIService.generate_report_summary(diagnosis)

        # Prepare context
        context = {
            'diagnosis': diagnosis,
            'work_order': diagnosis.work_order,
            'vehicle': diagnosis.work_order.vehicle,
            'customer': diagnosis.work_order.customer,
            'recommendations': diagnosis.repair_recommendations.all(),
            'codes': diagnosis.diagnostic_codes.all(),
            'tests': diagnosis.diagnostic_tests.all(),
            'findings': diagnosis.findings.all(),
            'photos': diagnosis.photos.all(),
            'ai_summary': ai_summary,
            'generated_at': timezone.now(),
            'total_cost': sum(
                rec.estimated_total_cost or 0 for rec in diagnosis.repair_recommendations.all()
            ),
        }
        
        if format_type == 'pdf':
            from apps.core.services.print_service import generate_diagnosis_report_pdf
            return generate_diagnosis_report_pdf(diagnosis, base_context=context)
        elif format_type == 'text':
            text_content = render_to_string('diagnosis/customer_report.txt', context)
            response = HttpResponse(text_content, content_type='text/plain')
            response['Content-Disposition'] = f'attachment; filename="diagnosis_report_{diagnosis.work_order.work_order_number if diagnosis.work_order else diagnosis.id}.txt"'
            return response
        else:
            # HTML format (default)
            from apps.core.services.print_service import render_diagnosis_report_print_html
            html_content = render_diagnosis_report_print_html(diagnosis, base_context=context, request=request)
            return HttpResponse(html_content, content_type='text/html')


class RepairRecommendationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Repair Recommendations.
    
    list: Get all recommendations
    retrieve: Get single recommendation
    create: Create new recommendation (must specify diagnosis)
    update: Update recommendation
    partial_update: Partially update recommendation
    destroy: Delete recommendation
    
    Custom actions:
    - approve: Mark recommendation as approved by customer
    """
    queryset = RepairRecommendation.objects.all().select_related(
        'diagnosis', 'diagnosis__work_order'
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        'diagnosis', 'recommendation_type', 'priority',
        'customer_approved', 'converted_to_task'
    ]
    search_fields = ['description']
    ordering_fields = ['priority', 'order', 'created_at', 'estimated_total_cost']
    ordering = ['priority', 'order', 'created_at']
    
    def get_queryset(self):
        """Filter recommendations by active branch from session"""
        queryset = super().get_queryset()
        return filter_diagnosis_queryset_for_branches(
            queryset,
            self.request.user,
            self.request,
            branch_lookup='diagnosis__work_order__branch'
        )
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return RepairRecommendationCreateSerializer
        return RepairRecommendationSerializer
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Mark recommendation as approved by customer"""
        recommendation = self.get_object()
        recommendation.approve()
        serializer = self.get_serializer(recommendation)
        return Response({
            'message': 'Recommendation approved',
            'recommendation': serializer.data
        })


# ============================================================================
# Phase 2: Structured Data ViewSets
# ============================================================================

class DiagnosticCodeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Diagnostic Codes (DTCs).
    """
    queryset = DiagnosticCode.objects.all().select_related('diagnosis', 'diagnosis__work_order')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['diagnosis', 'code_type', 'severity', 'status']
    search_fields = ['code_number', 'description']
    ordering_fields = ['recorded_at', 'code_number', 'created_at']
    ordering = ['-recorded_at', 'code_number']
    
    def get_queryset(self):
        """Filter codes by active branch from session"""
        queryset = super().get_queryset()
        return filter_diagnosis_queryset_for_branches(
            queryset,
            self.request.user,
            self.request,
            branch_lookup='diagnosis__work_order__branch'
        )
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return DiagnosticCodeCreateSerializer
        return DiagnosticCodeSerializer
        
    def perform_create(self, serializer):
        """Auto-populate description from library if not provided"""
        code_number = serializer.validated_data.get('code_number', '').upper()
        description = serializer.validated_data.get('description', '')
        severity = serializer.validated_data.get('severity', 'info')
        
        if not description or description == 'Unknown Code':
            from apps.diagnosis.models import DiagnosticCodeLibrary
            library_entry = DiagnosticCodeLibrary.objects.filter(code_number=code_number).first()
            if library_entry:
                serializer.validated_data['description'] = library_entry.description
                if 'severity' not in self.request.data:
                    serializer.validated_data['severity'] = library_entry.severity
            else:
                from apps.core.services.ai_service import AIService
                ai_decoded = AIService.decode_obd_code(code_number)
                serializer.validated_data['description'] = ai_decoded.get('description', f'Unknown Diagnostic Code {code_number}')
                if 'severity' not in self.request.data:
                    serializer.validated_data['severity'] = ai_decoded.get('severity', 'info')
                        
        serializer.save()
        
    @action(detail=False, methods=['get'])
    def decode(self, request):
        """Decode an OBD-II code via GET /api/diagnosis/codes/decode/?code=P0301"""
        code_number = request.query_params.get('code', '').strip().upper()
        if not code_number:
            return Response({'error': 'Code parameter is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        from apps.diagnosis.models import DiagnosticCodeLibrary
        library_entry = DiagnosticCodeLibrary.objects.filter(code_number=code_number).first()
        
        if library_entry:
            return Response({
                'code': code_number,
                'description': library_entry.description,
                'severity': library_entry.severity,
                'common_fixes': library_entry.common_fixes,
                'source': 'library'
            })
            
        # AI/External API fallback for unknown codes
        from apps.core.services.ai_service import AIService
        ai_decoded = AIService.decode_obd_code(code_number)
        
        return Response({
            'code': code_number,
            'description': ai_decoded.get('description', f'Unknown Diagnostic Code {code_number}'),
            'severity': ai_decoded.get('severity', 'info'),
            'common_fixes': ai_decoded.get('common_fixes', ''),
            'source': 'ai_fallback'
        })
    
    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """Mark code as resolved"""
        code = self.get_object()
        code.status = 'resolved'
        code.save(update_fields=['status'])
        serializer = self.get_serializer(code)
        return Response({
            'message': 'Code marked as resolved',
            'code': serializer.data
        })


class DiagnosticTestViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Diagnostic Tests.
    """
    queryset = DiagnosticTest.objects.all().select_related(
        'diagnosis', 'diagnosis__work_order', 'performed_by'
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['diagnosis', 'category', 'status', 'performed_by']
    search_fields = ['test_name', 'test_procedure']
    ordering_fields = ['performed_at', 'created_at', 'test_name']
    ordering = ['-performed_at']
    
    def get_queryset(self):
        """Filter tests by active branch from session"""
        queryset = super().get_queryset()
        return filter_diagnosis_queryset_for_branches(
            queryset,
            self.request.user,
            self.request,
            branch_lookup='diagnosis__work_order__branch'
        )
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return DiagnosticTestCreateSerializer
        return DiagnosticTestSerializer
    
    def perform_create(self, serializer):
        """Set performed_by to current user if not specified"""
        if not serializer.validated_data.get('performed_by'):
            serializer.save(performed_by=self.request.user)
        else:
            serializer.save()


class DiagnosisFindingViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Diagnosis Findings.
    """
    queryset = DiagnosisFinding.objects.all().select_related(
        'diagnosis', 'diagnosis__work_order'
    ).prefetch_related('diagnostic_codes', 'diagnostic_tests', 'photos')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['diagnosis', 'category', 'severity', 'status']
    search_fields = ['finding_title', 'description', 'root_cause']
    ordering_fields = ['severity', 'created_at', 'status']
    ordering = ['severity', 'created_at']
    
    def get_queryset(self):
        """Filter findings by active branch from session"""
        queryset = super().get_queryset()
        return filter_diagnosis_queryset_for_branches(
            queryset,
            self.request.user,
            self.request,
            branch_lookup='diagnosis__work_order__branch'
        )
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return DiagnosisFindingCreateSerializer
        return DiagnosisFindingSerializer


class DiagnosisPhotoViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Diagnosis Photos.
    """
    queryset = DiagnosisPhoto.objects.all().select_related(
        'diagnosis', 'diagnosis__work_order', 'finding', 'taken_by'
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['diagnosis', 'finding', 'photo_type', 'taken_by']
    search_fields = ['caption']
    ordering_fields = ['taken_at', 'created_at']
    ordering = ['-taken_at']
    
    def get_queryset(self):
        """Filter photos by active branch from session"""
        queryset = super().get_queryset()
        return filter_diagnosis_queryset_for_branches(
            queryset,
            self.request.user,
            self.request,
            branch_lookup='diagnosis__work_order__branch'
        )
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return DiagnosisPhotoCreateSerializer
        return DiagnosisPhotoSerializer
    
    def get_serializer_context(self):
        """Add request to context for photo URL generation"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    def perform_create(self, serializer):
        """Set taken_by to current user if not specified"""
        if not serializer.validated_data.get('taken_by'):
            serializer.save(taken_by=self.request.user)
        else:
            serializer.save()

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


# ============================================================================
# Phase 3: Advanced Features ViewSets
# ============================================================================

class TestProcedureLibraryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Test Procedure Library.
    """
    queryset = TestProcedureLibrary.objects.all().select_related('created_by')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['name', 'description', 'test_procedure']
    ordering_fields = ['name', 'category', 'use_count', 'created_at']
    ordering = ['category', 'name']
    
    def get_serializer_class(self):
        return TestProcedureLibrarySerializer
    
    @action(detail=True, methods=['post'])
    def use(self, request, pk=None):
        """Mark procedure as used (increment use count)"""
        procedure = self.get_object()
        procedure.increment_use_count()
        serializer = self.get_serializer(procedure)
        return Response({
            'message': 'Procedure use count incremented',
            'procedure': serializer.data
        })


class DiagnosticCodeLibraryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Diagnostic Code Library (Code Lookup).
    """
    queryset = DiagnosticCodeLibrary.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['code_type', 'severity', 'is_active']
    search_fields = ['code_number', 'title', 'description']
    ordering_fields = ['code_number', 'code_type', 'use_count']
    ordering = ['code_type', 'code_number']
    
    def get_serializer_class(self):
        return DiagnosticCodeLibrarySerializer
    
    @action(detail=False, methods=['get'])
    def lookup(self, request):
        """Lookup a code by number and type"""
        code_number = request.query_params.get('code_number', '').strip().upper()
        code_type = request.query_params.get('code_type', 'obd_ii').strip().lower()
        use_external = request.query_params.get('use_external', 'false').lower() == 'true'
        
        if not code_number:
            return Response(
                {'error': 'code_number parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Try exact match first
        try:
            code = DiagnosticCodeLibrary.objects.get(
                code_number=code_number,
                code_type=code_type,
                is_active=True
            )
        except DiagnosticCodeLibrary.DoesNotExist:
            # Try case-insensitive match
            try:
                code = DiagnosticCodeLibrary.objects.get(
                    code_number__iexact=code_number,
                    code_type__iexact=code_type,
                    is_active=True
                )
            except DiagnosticCodeLibrary.DoesNotExist:
                code = None
        
        if code:
            # Increment use count
            code.increment_use_count()
            serializer = self.get_serializer(code)
            return Response(serializer.data)
        elif use_external:
            # Try external API as fallback (Hybrid System)
            from apps.diagnosis.services.external_code_api import ExternalCodeAPIService, CodeSyncService
            
            external_result = ExternalCodeAPIService.lookup_external(code_number, code_type, use_cache=True)
            
            if external_result:
                # Auto-save to local database for future fast lookups (Hybrid System)
                # This way, popular codes get cached locally over time
                saved_code = CodeSyncService.save_external_code_to_local(external_result, auto_create=True)
                
                if saved_code:
                    # Return from local DB (now cached)
                    saved_code.increment_use_count()
                    serializer = self.get_serializer(saved_code)
                    return Response(serializer.data)
                else:
                    # Return external data if save failed
                    return Response({
                        'code_number': external_result['code_number'],
                        'code_type': external_result['code_type'],
                        'title': external_result['title'],
                        'description': external_result['description'],
                        'severity': external_result['severity'],
                        'common_causes': external_result.get('common_causes', []),
                        'common_fixes': external_result.get('common_fixes', []),
                        'source': 'external_api',
                        'is_local': False
                    })
        
        return Response(
            {
                'error': 'Code not found in library',
                'message': f'Code {code_number} not found. Local library has {DiagnosticCodeLibrary.objects.filter(code_type=code_type).count()} {code_type} codes.',
                'suggestion': 'Add ?use_external=true to try external APIs (if configured)'
            },
            status=status.HTTP_404_NOT_FOUND
        )
    
    @action(detail=True, methods=['post'])
    def increment_use(self, request, pk=None):
        """Increment use count (when code is looked up)"""
        code = self.get_object()
        code.increment_use_count()
        serializer = self.get_serializer(code)
        return Response(serializer.data)


class DiagnosisHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Diagnosis History/Analytics (Read-only).
    """
    queryset = DiagnosisHistory.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['vehicle_make', 'vehicle_model', 'vehicle_year']
    search_fields = ['vehicle_make', 'vehicle_model']
    ordering_fields = ['diagnosis_count', 'avg_repair_cost', 'created_at']
    ordering = ['-diagnosis_count']
    
    def get_serializer_class(self):
        return DiagnosisHistorySerializer
    
    @action(detail=False, methods=['get'])
    def similar_issues(self, request):
        """Get similar vehicle issues based on make/model/year"""
        make = request.query_params.get('make')
        model = request.query_params.get('model')
        year = request.query_params.get('year')
        
        if not make or not model:
            return Response(
                {'error': 'make and model parameters are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Try to find matching history
        history = DiagnosisHistory.objects.filter(
            vehicle_make=make,
            vehicle_model=model
        )
        
        if year:
            try:
                history = history.filter(vehicle_year=int(year))
            except ValueError:
                pass
        
        if history.exists():
            serializer = self.get_serializer(history.first())
            return Response(serializer.data)
        else:
            return Response(
                {'error': 'No historical data found for this vehicle'},
                status=status.HTTP_404_NOT_FOUND
            )

