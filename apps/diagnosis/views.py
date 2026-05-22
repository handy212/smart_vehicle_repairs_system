from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError as DRFValidationError
from apps.accounts.permissions import HasPermission, IsModuleEnabled, user_has_permission
from apps.diagnosis.permission_utils import (
    DiagnosisCodeLibraryPermissionMixin,
    DiagnosisPermissionMixin,
)
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from django.utils import timezone
from django.apps import apps as django_apps
from django_filters.rest_framework import DjangoFilterBackend
from decimal import Decimal
from datetime import timedelta

from apps.diagnosis.models import (
    Diagnosis, RepairRecommendation,
    DiagnosticCode, DiagnosticTest,
    DiagnosisFinding, DiagnosisPhoto,
    TestProcedureLibrary, DiagnosticCodeLibrary,
    DiagnosisHistory
)
from apps.core.services.ai_service import AIService
from apps.branches.utils import resolve_branch, get_user_accessible_branches
from django.db.models import Q, Sum
from apps.diagnosis.services.baseline_test_procedures import seed_baseline_test_procedures
from apps.notifications_app.triggers import notification_triggers
from apps.diagnosis.serializers import (
    DiagnosisListSerializer, DiagnosisDetailSerializer,
    DiagnosisCreateSerializer, DiagnosisUpdateSerializer,
    RepairRecommendationSerializer, RepairRecommendationCreateSerializer,
    RepairRecommendationQuoteQueueSerializer,
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
    
    # Cross-branch visibility for users with full diagnosis/branch access
    if user_has_permission(user, 'manage_branches') or user_has_permission(user, 'manage_diagnosis'):
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


DIAGNOSIS_APPROVAL_LOCK_MESSAGE = (
    'Diagnosis is locked while waiting for customer approval. '
    'Customer approval or decline must move the work order before diagnosis can be changed.'
)


def diagnosis_is_locked_for_customer_approval(diagnosis):
    work_order = getattr(diagnosis, 'work_order', None)
    return (
        diagnosis is not None
        and diagnosis.status == 'awaiting_approval'
        and work_order is not None
        and not work_order.approved_by_customer
    )


def assert_diagnosis_editable(diagnosis):
    if diagnosis_is_locked_for_customer_approval(diagnosis):
        raise DRFValidationError({'error': DIAGNOSIS_APPROVAL_LOCK_MESSAGE})


class DiagnosisMutationLockMixin:
    """Block edits to diagnosis-owned records during customer approval review."""

    def _get_instance_diagnosis(self, instance):
        return getattr(instance, 'diagnosis', instance)

    def perform_update(self, serializer):
        assert_diagnosis_editable(self._get_instance_diagnosis(serializer.instance))
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        assert_diagnosis_editable(self._get_instance_diagnosis(instance))
        return super().destroy(request, *args, **kwargs)


class DiagnosisViewSet(DiagnosisPermissionMixin, viewsets.ModelViewSet):
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
        'repair_recommendations__findings',
        'repair_recommendations__findings__diagnostic_codes',
        'diagnostic_codes',
        'diagnostic_tests',
        'findings',
        'photos',
    )
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

    @staticmethod
    def _user_has_quote_submission_role(user):
        return user_has_permission(user, 'manage_diagnosis') or user_has_permission(user, 'edit_diagnosis')

    @staticmethod
    def _user_has_quote_completion_role(user):
        return (
            user_has_permission(user, 'manage_diagnosis')
            or user_has_permission(user, 'manage_inventory')
            or user_has_permission(user, 'approve_part_requests')
        )

    def _build_or_refresh_quote_estimate(self, diagnosis, recommendations, user):
        """
        Create or refresh a stores quotation estimate for the selected recommendations.
        The estimate is linked by work-order reference number to avoid auto-syncing
        quotation parts directly into workshop execution before authorization.
        """
        if not django_apps.is_installed('apps.billing'):
            return None, None

        work_order = diagnosis.work_order
        if not work_order:
            return None, "Diagnosis is not linked to a work order."

        Estimate = django_apps.get_model('billing', 'Estimate')
        EstimateLineItem = django_apps.get_model('billing', 'EstimateLineItem')
        InventoryPart = django_apps.get_model('inventory', 'Part')

        reference_number = f"WO:{work_order.id}"
        estimate = getattr(work_order, 'estimate', None)
        if estimate and estimate.status == 'converted':
            estimate = None

        if estimate is None:
            estimate = (
                Estimate.objects.filter(
                    reference_number=reference_number,
                    customer=work_order.customer,
                    vehicle=work_order.vehicle,
                )
                .exclude(status='converted')
                .order_by('-created_at')
                .first()
            )

        if estimate is None:
            estimate = Estimate.objects.create(
                branch=work_order.branch,
                customer=work_order.customer,
                vehicle=work_order.vehicle,
                work_order=work_order,
                reference_number=reference_number,
                status='draft',
                estimate_date=timezone.now().date(),
                valid_until=timezone.now().date() + timedelta(days=14),
                title=f"Stores quotation for {work_order.work_order_number}",
                description=f"Stores quotation generated from approved diagnosis recommendations for {work_order.work_order_number}.",
                notes=f"Auto-generated from diagnosis {diagnosis.id}. Stores should complete pricing before marking recommendations as quoted.",
                created_by=user,
            )
        else:
            estimate.branch = work_order.branch
            estimate.customer = work_order.customer
            estimate.vehicle = work_order.vehicle
            estimate.work_order = work_order
            estimate.reference_number = reference_number
            estimate.title = f"Stores quotation for {work_order.work_order_number}"
            estimate.description = f"Stores quotation generated from approved diagnosis recommendations for {work_order.work_order_number}."
            estimate.valid_until = timezone.now().date() + timedelta(days=14)
            estimate.save(update_fields=[
                'branch', 'customer', 'vehicle', 'work_order', 'reference_number',
                'title', 'description', 'valid_until', 'updated_at'
            ])

        for recommendation in recommendations:
            marker = f"[DIAG-REC:{recommendation.id}]"
            estimate.line_items.filter(notes__contains=marker).delete()

            created_any_lines = False
            order = estimate.line_items.count()
            parts = recommendation.parts_needed or []

            for part_data in parts:
                quantity = Decimal(str(part_data.get('quantity') or '1'))
                if quantity <= 0:
                    quantity = Decimal('1')

                part_name = (part_data.get('part_name') or '').strip()
                part_number = (part_data.get('part_number') or '').strip()
                inventory_part = None
                part_id = part_data.get('part_id') or part_data.get('inventory_part')
                if part_id:
                    inventory_part = InventoryPart.objects.filter(pk=part_id).first()
                if inventory_part is None and part_number:
                    inventory_part = InventoryPart.objects.filter(part_number__iexact=part_number).first()

                if inventory_part and not part_name:
                    part_name = inventory_part.name
                if inventory_part and not part_number:
                    part_number = inventory_part.part_number

                unit_price = Decimal('0.00')
                if inventory_part and getattr(inventory_part, 'selling_price', None):
                    unit_price = Decimal(str(inventory_part.selling_price or '0'))
                elif part_data.get('unit_cost') not in (None, ''):
                    unit_price = Decimal(str(part_data.get('unit_cost') or '0'))

                EstimateLineItem.objects.create(
                    estimate=estimate,
                    item_type='part',
                    description=part_name or recommendation.description[:500],
                    notes=f"{marker} Recommendation: {recommendation.description}",
                    part=inventory_part,
                    part_number=part_number,
                    quantity=quantity,
                    unit_price=unit_price,
                    is_taxable=True,
                    order=order,
                )
                order += 1
                created_any_lines = True

            if recommendation.estimated_labor_hours > 0 or recommendation.estimated_labor_cost > 0:
                labor_rate = Decimal('0.00')
                if recommendation.estimated_labor_hours > 0 and recommendation.estimated_labor_cost > 0:
                    labor_rate = (recommendation.estimated_labor_cost / recommendation.estimated_labor_hours).quantize(Decimal('0.01'))

                EstimateLineItem.objects.create(
                    estimate=estimate,
                    item_type='labor',
                    description=f"Labor for: {recommendation.description[:460]}",
                    notes=f"{marker} Labor allowance for recommendation.",
                    quantity=Decimal('1.00'),
                    unit_price=Decimal(str(recommendation.estimated_labor_cost or '0')),
                    labor_hours=recommendation.estimated_labor_hours,
                    labor_rate=labor_rate,
                    is_taxable=True,
                    order=order,
                )
                order += 1
                created_any_lines = True

            if not created_any_lines:
                EstimateLineItem.objects.create(
                    estimate=estimate,
                    item_type='other',
                    description=recommendation.description[:500],
                    notes=f"{marker} Stores must complete pricing for this recommendation.",
                    quantity=Decimal('1.00'),
                    unit_price=Decimal('0.00'),
                    is_taxable=True,
                    order=order,
                )

        estimate.refresh_from_db()
        estimate.calculate_totals()
        estimate.refresh_from_db()

        self._sync_work_order_financials_from_diagnosis_parts(work_order, estimate)

        return estimate, None

    @staticmethod
    def _sync_work_order_financials_from_diagnosis_parts(work_order, estimate=None):
        """
        Keep work-order financials aligned with diagnosis-created parts.

        Estimate part lines are quote presentation only; the work order's parts
        source of truth is WorkOrderPart rows created from diagnosis
        recommendations.
        """
        parts_subtotal = work_order.parts.aggregate(
            total=Sum('selling_price')
        )['total'] or Decimal('0')
        labor_subtotal = Decimal('0')
        labor_hours = Decimal('0')

        if estimate is not None:
            labor_subtotal = estimate.labor_subtotal or Decimal('0')
            labor_hours = sum(
                Decimal(str(item.labor_hours or '0'))
                for item in estimate.line_items.filter(item_type='labor')
            ) or Decimal('0')

        work_order.estimated_parts_cost = parts_subtotal
        work_order.estimated_labor_cost = labor_subtotal
        work_order.estimated_labor_hours = labor_hours
        work_order.estimated_total = parts_subtotal + labor_subtotal
        work_order.save(update_fields=[
            'estimated_parts_cost',
            'estimated_labor_cost',
            'estimated_labor_hours',
            'estimated_total',
            'updated_at',
        ])

    @staticmethod
    def _get_recommendation_quote_estimate(recommendation):
        if not django_apps.is_installed('apps.billing'):
            return None

        estimate_id = getattr(recommendation, 'quotation_estimate_id', None)
        if not estimate_id:
            return None

        Estimate = django_apps.get_model('billing', 'Estimate')
        return Estimate.objects.filter(pk=estimate_id).first()

    @classmethod
    def _validate_quote_ready_for_recommendations(cls, recommendations):
        """
        Validate Stores has priced the existing estimate lines for each recommendation.

        Marking quoted must not rebuild the estimate, because Stores may have
        edited the generated draft with supplier pricing, alternatives, or fees.
        """
        if not django_apps.is_installed('apps.billing'):
            return None, None

        first_estimate = None
        for recommendation in recommendations:
            estimate = cls._get_recommendation_quote_estimate(recommendation)
            if estimate is None:
                return None, (
                    f'Recommendation {recommendation.id} must be linked to a quotation estimate before it can be marked as quoted.'
                )

            marker = f"[DIAG-REC:{recommendation.id}]"
            quote_lines = estimate.line_items.filter(notes__contains=marker)
            if not quote_lines.exists():
                return None, (
                    f'Recommendation {recommendation.id} has no linked estimate lines. Send it to stores again before marking it quoted.'
                )

            unpriced_lines = quote_lines.filter(unit_price__lte=Decimal('0.01')).count()
            if unpriced_lines:
                return None, (
                    f'Recommendation {recommendation.id} has {unpriced_lines} unpriced estimate line(s). Stores must enter real pricing before marking it quoted.'
                )

            if first_estimate is None:
                first_estimate = estimate

        return first_estimate, None

    @classmethod
    def _sync_recommendation_costs_from_quote_estimate(cls, recommendation):
        """Copy Stores quote part totals back onto the recommendation card."""
        estimate = cls._get_recommendation_quote_estimate(recommendation)
        if estimate is None:
            return

        marker = f"[DIAG-REC:{recommendation.id}]"
        quote_lines = estimate.line_items.filter(notes__contains=marker)
        parts_total = sum(
            Decimal(str(line.total or '0'))
            for line in quote_lines
            if line.item_type == 'part'
        ) or Decimal('0')

        recommendation.estimated_parts_cost = parts_total
        recommendation.estimated_labor_cost = Decimal('0')
        recommendation.estimated_labor_hours = Decimal('0')
        recommendation.estimated_total_cost = parts_total
        recommendation.save(update_fields=[
            'estimated_parts_cost',
            'estimated_labor_cost',
            'estimated_labor_hours',
            'estimated_total_cost',
            'updated_at',
        ])

    @staticmethod
    def _publish_quote_estimates_for_customer(recommendations, user):
        """
        Make stores-prepared quotation estimates customer-visible.

        Sending recommendations to stores creates internal draft estimates so
        stores can price parts, labor, and extra charges without exposing work
        to the customer. The estimate is sent only when the diagnosis approval
        request is actually submitted.
        """
        if not django_apps.is_installed('apps.billing'):
            return []

        Estimate = django_apps.get_model('billing', 'Estimate')
        estimate_ids = {
            recommendation.quotation_estimate_id
            for recommendation in recommendations
            if recommendation.quotation_estimate_id
        }

        missing_links = [
            recommendation.id
            for recommendation in recommendations
            if not recommendation.quotation_estimate_id
        ]
        if missing_links:
            ids = ', '.join(str(item) for item in missing_links)
            raise ValueError(f'Recommendation(s) {ids} must be linked to a stores estimate before customer approval.')

        published = []
        for estimate in Estimate.objects.filter(id__in=estimate_ids):
            if estimate.status == 'draft':
                estimate.status = 'sent'
                estimate.sent_by = user
                estimate.sent_at = timezone.now()
                estimate.save(update_fields=['status', 'sent_by', 'sent_at', 'updated_at'])

                try:
                    notification_triggers.estimate_sent(estimate)
                except Exception as exc:
                    import logging
                    logging.getLogger(__name__).warning(
                        "Failed to send estimate notification: %s",
                        exc,
                        exc_info=True,
                    )

            published.append(estimate)

        return published

    def _sync_recommendation_parts_to_work_order_requests(self, diagnosis, recommendations, user):
        """
        Create real WorkOrderPart requests as soon as stores receives a quote request.

        The quotation queue is for pricing. The parts request queue is for the
        physical stores workflow: source/order/receive/allocate before repairs start.
        """
        work_order = diagnosis.work_order
        if not work_order:
            return 0

        WorkOrderPart = django_apps.get_model('workorders', 'WorkOrderPart')
        InventoryPart = django_apps.get_model('inventory', 'Part')

        synced_count = 0
        for recommendation in recommendations:
            marker = f"[DIAG-REC:{recommendation.id}]"
            for part_data in recommendation.parts_needed or []:
                if not isinstance(part_data, dict):
                    continue

                part_name = (part_data.get('part_name') or '').strip()
                part_number = (part_data.get('part_number') or '').strip()
                part_id = part_data.get('part_id') or part_data.get('inventory_part')
                inventory_part = None

                if part_id:
                    inventory_part = InventoryPart.objects.filter(pk=part_id).first()
                if inventory_part is None and part_number:
                    inventory_part = InventoryPart.objects.filter(part_number__iexact=part_number).first()

                if inventory_part:
                    part_name = part_name or inventory_part.name
                    part_number = part_number or inventory_part.part_number

                if not part_name and not part_number:
                    continue

                try:
                    quantity = Decimal(str(part_data.get('quantity') or '1'))
                except Exception:
                    quantity = Decimal('1')
                if quantity <= 0:
                    quantity = Decimal('1')

                try:
                    unit_cost = Decimal(str(part_data.get('unit_cost') or '0'))
                except Exception:
                    unit_cost = Decimal('0')
                if inventory_part and unit_cost <= 0:
                    unit_cost = inventory_part.cost_price or Decimal('0')

                existing = WorkOrderPart.objects.filter(
                    work_order=work_order,
                    task__isnull=True,
                    description__contains=marker,
                )
                if inventory_part:
                    existing = existing.filter(inventory_part=inventory_part)
                elif part_number:
                    existing = existing.filter(part_number__iexact=part_number)
                else:
                    existing = existing.filter(part_name__iexact=part_name)

                part_request = existing.first()
                defaults = {
                    'inventory_part': inventory_part,
                    'part_name': part_name or part_number,
                    'part_number': part_number,
                    'quantity': quantity,
                    'unit_cost': unit_cost,
                    'requested_by': user,
                    'description': f"Stores request from diagnosis recommendation {recommendation.id}. {marker}",
                }

                if part_request:
                    for field, value in defaults.items():
                        if value not in (None, '') or field in {'inventory_part', 'requested_by'}:
                            setattr(part_request, field, value)
                    if part_request.status == 'draft':
                        part_request.status = 'pending'
                    part_request.save()
                else:
                    WorkOrderPart.objects.create(
                        work_order=work_order,
                        task=None,
                        status='pending',
                        **defaults,
                    )
                synced_count += 1

        return synced_count

    def get_object(self):
        """
        Return a clearer branch-context error for diagnosis detail routes.
        """
        queryset = self.filter_queryset(self.get_queryset())
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup_value = self.kwargs.get(lookup_url_kwarg)
        filter_kwargs = {self.lookup_field: lookup_value}

        obj = queryset.filter(**filter_kwargs).first()
        if obj is not None:
            self.check_object_permissions(self.request, obj)
            return obj

        unscoped_obj = super().get_queryset().filter(**filter_kwargs).first()
        if unscoped_obj is not None:
            active_branch = resolve_branch(self.request)
            work_order = getattr(unscoped_obj, 'work_order', None)
            record_branch = getattr(work_order, 'branch', None)

            if record_branch and active_branch and record_branch.id != active_branch.id:
                raise DRFValidationError({
                    'error': (
                        f"Active branch context does not match this diagnosis. "
                        f"Select branch '{record_branch.name}' or send the correct X-Branch-ID header."
                    )
                })

            raise DRFValidationError({
                'error': 'Active branch context is required to access this diagnosis. Select the correct branch or send X-Branch-ID.'
            })

        raise Http404
    
    def get_serializer_class(self):
        if self.action == 'list':
            return DiagnosisListSerializer
        elif self.action == 'create':
            return DiagnosisCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return DiagnosisUpdateSerializer
        return DiagnosisDetailSerializer

    def create(self, request, *args, **kwargs):
        """Create a diagnosis and return the full detail payload."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        diagnosis = serializer.save()
        detail_serializer = DiagnosisDetailSerializer(diagnosis, context=self.get_serializer_context())
        headers = self.get_success_headers(detail_serializer.data)
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_update(self, serializer):
        assert_diagnosis_editable(serializer.instance)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        diagnosis = self.get_object()
        assert_diagnosis_editable(diagnosis)
        return super().destroy(request, *args, **kwargs)
    
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
        
        if diagnosis.status == 'awaiting_approval':
            return Response(
                {'error': DIAGNOSIS_APPROVAL_LOCK_MESSAGE},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
    def submit_for_approval(self, request, pk=None):
        """Send diagnosis findings/recommendations to the customer for approval."""
        diagnosis = self.get_object()
        active_recommendations = diagnosis.repair_recommendations.filter(
            approval_status__in=['pending_approval', 'approved'],
            converted_to_task__isnull=True,
        )
        unsubmitted_count = active_recommendations.filter(quotation_status='not_requested').count()
        unquoted_count = active_recommendations.filter(quotation_status='requested').count()

        if active_recommendations.exists() and unsubmitted_count:
            return Response(
                {
                    'error': (
                        f'{unsubmitted_count} recommendation(s) must be sent to stores for estimate before customer approval.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if active_recommendations.exists() and unquoted_count:
            return Response(
                {
                    'error': (
                        f'{unquoted_count} recommendation(s) are still waiting for stores estimate before customer approval.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        missing_estimate_links = active_recommendations.filter(
            quotation_status='quoted',
            quotation_estimate_id__isnull=True,
        ).count()
        if missing_estimate_links:
            return Response(
                {
                    'error': (
                        f'{missing_estimate_links} quoted recommendation(s) must be linked to a stores estimate before customer approval.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            diagnosis.submit_for_approval(user=request.user)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except (DjangoValidationError, DRFValidationError) as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        diagnosis.refresh_from_db()
        work_order = diagnosis.work_order
        work_order.refresh_from_db()

        try:
            published_estimates = self._publish_quote_estimates_for_customer(
                active_recommendations.filter(quotation_status='quoted'),
                request.user,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            notification_triggers.work_order_requires_approval(work_order)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                "Failed to send diagnosis approval notification: %s",
                exc,
                exc_info=True,
            )

        serializer = self.get_serializer(diagnosis)
        return Response({
            'message': 'Diagnosis sent for customer approval',
            'published_estimate_ids': [estimate.id for estimate in published_estimates],
            'diagnosis': serializer.data,
            'work_order': {
                'id': work_order.id,
                'status': work_order.status,
                'requires_approval': work_order.requires_approval,
                'approval_requested_at': (
                    work_order.approval_requested_at.isoformat()
                    if work_order.approval_requested_at
                    else None
                ),
            }
        })
    
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
        if diagnosis.status not in ['in_progress', 'paused', 'awaiting_approval']:
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
        
        try:
            diagnosis.complete(requires_approval=requires_approval)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        
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
            
        serializer = self.get_serializer(diagnosis)
        return Response({
            'message': 'Diagnosis marked as completed',
            'diagnosis': serializer.data,
            'work_order': {
                'id': work_order.id,
                'status': work_order.status,
                'requires_approval': work_order.requires_approval,
                'diagnosis_completed_at': work_order.diagnosis_completed_at.isoformat() if work_order.diagnosis_completed_at else None,
            }
        })

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        """Reopen a completed diagnosis for revision before customer approval."""
        diagnosis = self.get_object()
        reason = request.data.get('reason', '')

        if diagnosis_is_locked_for_customer_approval(diagnosis):
            return Response(
                {'error': DIAGNOSIS_APPROVAL_LOCK_MESSAGE},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            diagnosis.reopen_for_revision(user=request.user, reason=reason)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        diagnosis.refresh_from_db()
        work_order = diagnosis.work_order
        work_order.refresh_from_db()

        serializer = self.get_serializer(diagnosis)
        return Response({
            'message': 'Diagnosis reopened for revision',
            'diagnosis': serializer.data,
            'work_order': {
                'id': work_order.id,
                'status': work_order.status,
                'requires_approval': work_order.requires_approval,
                'diagnosis_completed_at': (
                    work_order.diagnosis_completed_at.isoformat()
                    if work_order.diagnosis_completed_at
                    else None
                ),
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
        assert_diagnosis_editable(diagnosis)
        codes_data = request.data.get('codes', [])
        allowed_statuses = {choice[0] for choice in DiagnosticCode.STATUS_CHOICES}
        
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

            normalized_status = str(code_item.get('status', 'active')).lower()
            if normalized_status not in allowed_statuses:
                normalized_status = 'active'
                
            code_obj, created = DiagnosticCode.objects.get_or_create(
                diagnosis=diagnosis,
                code_number=code_str.upper(),
                code_type='obd_ii',
                defaults={
                    'code_type': 'obd_ii',
                    'description': code_item.get('description', 'Auto-synced from scanner'),
                    'status': normalized_status,
                    'severity': 'warning'  # Default for auto-sync
                }
            )
            
            if not created:
                fields_to_update = []

                if code_obj.code_type != 'obd_ii':
                    code_obj.code_type = 'obd_ii'
                    fields_to_update.append('code_type')

                # Update existing if needed
                if code_obj.status != normalized_status:
                    code_obj.status = normalized_status
                    fields_to_update.append('status')

                if 'description' in code_item:
                    code_obj.description = code_item['description']
                    fields_to_update.append('description')

                if fields_to_update:
                    code_obj.save(update_fields=fields_to_update)
                
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
        assert_diagnosis_editable(diagnosis)
        serializer = RepairRecommendationCreateSerializer(
            data=request.data,
            context={'request': request, 'diagnosis': diagnosis}
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
        Record a recommendation approval decision.
        
        Request body:
        {
            "recommendation_ids": [1, 2, 3],
            "decision": "approved" | "deferred" | "declined",
            "decision_method": "supervisor_instruction",
            "decision_notes": "Customer asked us to hold this for later."
        }
        """
        diagnosis = self.get_object()
        recommendation_ids = request.data.get('recommendation_ids', [])
        decision = request.data.get('decision')
        if not decision:
            approved = request.data.get('approved')
            if approved is True:
                decision = 'approved'
            elif approved is False:
                decision = 'declined'

        if decision not in {'approved', 'deferred', 'declined'}:
            return Response(
                {"error": "decision must be one of approved, deferred, or declined"},
                status=status.HTTP_400_BAD_REQUEST
            )

        decision_method = request.data.get('decision_method', 'supervisor_instruction')
        valid_methods = {choice[0] for choice in RepairRecommendation.DECISION_METHOD_CHOICES}
        if decision_method and decision_method not in valid_methods:
            return Response(
                {"error": f"decision_method must be one of {', '.join(sorted(valid_methods))}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        decision_notes = request.data.get('decision_notes', '')
        
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
        
        for recommendation in recommendations:
            recommendation.set_decision(
                decision,
                acted_by=request.user,
                method=decision_method,
                notes=decision_notes,
            )
        
        # Return updated recommendations
        updated_recommendations = diagnosis.repair_recommendations.filter(id__in=recommendation_ids)
        serializer = RepairRecommendationSerializer(updated_recommendations, many=True)
        
        return Response({
            'message': f'Successfully marked {updated_recommendations.count()} recommendation(s) as {decision.replace("_", " ")}',
            'recommendations': serializer.data
        })

    @action(detail=True, methods=['post'])
    def submit_recommendations_for_quote(self, request, pk=None):
        """Submit diagnosis recommendations to stores for quotation before customer approval."""
        diagnosis = self.get_object()
        assert_diagnosis_editable(diagnosis)
        if not self._user_has_quote_submission_role(request.user):
            return Response(
                {"error": "Only service coordinators, parts managers, managers, or admins can submit recommendations to stores."},
                status=status.HTTP_403_FORBIDDEN,
            )
        recommendation_ids = request.data.get('recommendation_ids', [])

        recommendations = diagnosis.repair_recommendations.filter(
            approval_status__in=['pending_approval', 'approved'],
            quotation_status='not_requested',
            converted_to_task__isnull=True,
        )

        if recommendation_ids:
            selected = diagnosis.repair_recommendations.filter(id__in=recommendation_ids)
            recommendations = recommendations.filter(id__in=recommendation_ids)
            if selected.count() != recommendations.count():
                return Response(
                    {
                        "error": "Only unquoted recommendations that are still pending customer approval or already approved can be sent to stores."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if not recommendations.exists():
            return Response(
                {"error": "No recommendations are ready to send to stores for quotation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        estimate, estimate_error = self._build_or_refresh_quote_estimate(diagnosis, recommendations, request.user)
        if estimate_error:
            return Response({"error": estimate_error}, status=status.HTTP_400_BAD_REQUEST)

        parts_synced = self._sync_recommendation_parts_to_work_order_requests(
            diagnosis,
            recommendations,
            request.user,
        )
        self._sync_work_order_financials_from_diagnosis_parts(diagnosis.work_order, estimate)

        for recommendation in recommendations:
            recommendation.request_quotation(requested_by=request.user)
            if estimate is not None:
                recommendation.quotation_estimate_id = estimate.id
                recommendation.quotation_estimate_number = estimate.estimate_number
                recommendation.save(update_fields=[
                    'quotation_estimate_id',
                    'quotation_estimate_number',
                    'updated_at',
                ])

        serializer = RepairRecommendationSerializer(recommendations, many=True)
        return Response({
            'message': f'Submitted {recommendations.count()} recommendation(s) to stores for quotation',
            'quotation_estimate_id': getattr(estimate, 'id', None),
            'quotation_estimate_number': getattr(estimate, 'estimate_number', None),
            'parts_synced': parts_synced,
            'recommendations': serializer.data,
        })

    @action(detail=True, methods=['post'])
    def mark_recommendations_quoted(self, request, pk=None):
        """Mark previously requested recommendations as quoted."""
        diagnosis = self.get_object()
        assert_diagnosis_editable(diagnosis)
        if not self._user_has_quote_completion_role(request.user):
            return Response(
                {"error": "Only parts managers, managers, or admins can mark recommendations as quoted."},
                status=status.HTTP_403_FORBIDDEN,
            )
        recommendation_ids = request.data.get('recommendation_ids', [])

        recommendations = diagnosis.repair_recommendations.filter(
            approval_status__in=['pending_approval', 'approved'],
            quotation_status='requested',
            converted_to_task__isnull=True,
        )

        if recommendation_ids:
            selected = diagnosis.repair_recommendations.filter(id__in=recommendation_ids)
            recommendations = recommendations.filter(id__in=recommendation_ids)
            if selected.count() != recommendations.count():
                return Response(
                    {
                        "error": "Only recommendations already sent to stores can be marked as quoted."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if not recommendations.exists():
            return Response(
                {"error": "No quotation requests are pending."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        estimate, estimate_error = self._validate_quote_ready_for_recommendations(recommendations)
        if estimate_error:
            return Response({"error": estimate_error}, status=status.HTTP_400_BAD_REQUEST)

        for recommendation in recommendations:
            self._sync_recommendation_costs_from_quote_estimate(recommendation)
            recommendation.mark_quoted(quoted_by=request.user)

        serializer = RepairRecommendationSerializer(recommendations, many=True)
        return Response({
            'message': f'Marked {recommendations.count()} recommendation(s) as quotation ready',
            'quotation_estimate_id': getattr(estimate, 'id', None),
            'quotation_estimate_number': getattr(estimate, 'estimate_number', None),
            'recommendations': serializer.data,
        })
    
    @action(detail=True, methods=['post'])
    def convert_recommendations_to_tasks(self, request, pk=None):
        """
        Convert approved and quoted repair recommendations to ServiceTasks
        
        Request body (optional):
        {
            "recommendation_ids": [1, 2, 3],  # Specific recommendations to convert (if not provided, converts all approved)
            "assign_to_technician": true  # Auto-assign to diagnosis technician
        }
        """
        diagnosis = self.get_object()
        assert_diagnosis_editable(diagnosis)
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
            selected_recommendations = diagnosis.repair_recommendations.filter(
                id__in=recommendation_ids
            )
            recommendations = selected_recommendations.filter(
                approval_status='approved',
                quotation_status='quoted',
                converted_to_task__isnull=True,
            )

            if selected_recommendations.count() != recommendations.count():
                return Response(
                    {
                        "error": "Only approved recommendations with a ready quotation that have not already been converted can be turned into tasks.",
                        "message": "Approve the recommendation, submit it to stores, and wait for quotation before converting."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            # Convert all approved and quoted recommendations
            recommendations = diagnosis.repair_recommendations.filter(
                approval_status='approved',
                quotation_status='quoted',
                converted_to_task__isnull=True  # Not already converted
            )
        
        if not recommendations.exists():
            return Response(
                {
                    "error": "No approved recommendations with a ready quotation found to convert.",
                    "message": "Approved recommendations must be quoted before they can become work-order tasks."
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            recommendation_ids_to_convert = list(recommendations.values_list('id', flat=True))
            tasks_created, parts_linked = work_order.convert_recommendations_to_tasks(
                user=request.user,
                recommendation_ids=recommendation_ids_to_convert,
                assign_to_technician=assign_to_technician,
            )

            if not tasks_created:
                return Response(
                    {
                        "error": "No recommendations were converted.",
                        "message": "The selected recommendations may already have been converted or may no longer be eligible.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            converted_recommendations = diagnosis.repair_recommendations.filter(
                id__in=recommendation_ids_to_convert,
                converted_to_task__isnull=False,
            ).select_related('converted_to_task')
            created_tasks = [
                {
                    'id': rec.converted_to_task_id,
                    'description': rec.converted_to_task.description,
                    'task_type': rec.converted_to_task.task_type,
                    'recommendation_id': rec.id,
                    'sequence_order': rec.converted_to_task.sequence_order,
                }
                for rec in converted_recommendations
            ]

            return Response({
                'message': f'Successfully converted {tasks_created} recommendation(s) to tasks and linked {parts_linked} part(s).',
                'tasks_created': created_tasks,
                'parts_linked': parts_linked,
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
        assert_diagnosis_editable(diagnosis)
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


class RepairRecommendationViewSet(
    DiagnosisPermissionMixin, DiagnosisMutationLockMixin, viewsets.ModelViewSet
):
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
    ).prefetch_related(
        'findings',
        'findings__diagnostic_codes',
    )
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        'diagnosis', 'recommendation_type', 'priority',
        'customer_approved', 'approval_status', 'quotation_status', 'converted_to_task'
    ]
    search_fields = ['description']
    ordering_fields = ['priority', 'order', 'created_at', 'estimated_total_cost', 'approval_status', 'quotation_status']
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

    def perform_create(self, serializer):
        diagnosis = serializer.validated_data.get('diagnosis')
        assert_diagnosis_editable(diagnosis)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        recommendation = self.get_object()
        assert_diagnosis_editable(recommendation.diagnosis)
        if recommendation.converted_to_task_id:
            return Response(
                {'error': 'Converted recommendations cannot be deleted. Update the linked work-order task instead.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if recommendation.approval_status != 'pending_approval':
            return Response(
                {'error': 'Only recommendations still pending customer decision can be deleted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if recommendation.quotation_status != 'not_requested':
            return Response(
                {'error': 'Recommendations already sent to stores cannot be deleted. Revise the recommendation so it returns to the stores queue instead.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Mark recommendation as approved by customer"""
        recommendation = self.get_object()
        recommendation.set_decision(
            'approved',
            acted_by=request.user,
            method=request.data.get('decision_method', 'supervisor_instruction'),
            notes=request.data.get('decision_notes', ''),
        )
        serializer = self.get_serializer(recommendation)
        return Response({
            'message': 'Recommendation approved',
            'recommendation': serializer.data
        })

    @action(detail=False, methods=['get'])
    def quotation_queue(self, request):
        """List active recommendations waiting on stores quotation."""
        queryset = self.get_queryset().filter(
            approval_status__in=['pending_approval', 'approved'],
            quotation_status='requested',
            converted_to_task__isnull=True,
        ).select_related(
            'diagnosis__work_order',
            'diagnosis__work_order__vehicle',
            'diagnosis__work_order__customer__user',
            'diagnosis__work_order__branch',
        )

        search = request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(description__icontains=search)
                | Q(diagnosis__work_order__work_order_number__icontains=search)
                | Q(diagnosis__work_order__vehicle__make__icontains=search)
                | Q(diagnosis__work_order__vehicle__model__icontains=search)
                | Q(findings__finding_title__icontains=search)
            ).distinct()

        queryset = queryset.order_by('-quotation_requested_at', 'priority', 'order')
        page = self.paginate_queryset(queryset)
        serializer = RepairRecommendationQuoteQueueSerializer(page or queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def mark_quoted(self, request, pk=None):
        """Mark a queued recommendation as quotation ready."""
        recommendation = self.get_object()
        assert_diagnosis_editable(recommendation.diagnosis)
        if not DiagnosisViewSet._user_has_quote_completion_role(request.user):
            return Response(
                {'error': 'Only parts managers, managers, or admins can mark recommendations as quoted.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        _, estimate_error = DiagnosisViewSet._validate_quote_ready_for_recommendations([recommendation])
        if estimate_error:
            return Response({'error': estimate_error}, status=status.HTTP_400_BAD_REQUEST)
        try:
            recommendation.mark_quoted(quoted_by=request.user)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(recommendation)
        return Response({
            'message': 'Recommendation marked as quotation ready',
            'recommendation': serializer.data,
        })


# ============================================================================
# Phase 2: Structured Data ViewSets
# ============================================================================

class DiagnosticCodeViewSet(
    DiagnosisPermissionMixin, DiagnosisMutationLockMixin, viewsets.ModelViewSet
):
    """
    ViewSet for Diagnostic Codes (DTCs).
    """
    queryset = DiagnosticCode.objects.all().select_related('diagnosis', 'diagnosis__work_order')
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
        """Auto-populate description from library cache or Gemini AI if not provided."""
        assert_diagnosis_editable(serializer.validated_data.get('diagnosis'))
        code_number = serializer.validated_data.get('code_number', '').upper()
        description = serializer.validated_data.get('description', '')

        if not description or description == 'Unknown Code':
            # Check local library first to avoid unnecessary Gemini API calls
            library_entry = DiagnosticCodeLibrary.objects.filter(
                code_number=code_number, is_active=True
            ).first()

            if library_entry:
                library_entry.increment_use_count()
                serializer.validated_data['description'] = library_entry.description
                if 'severity' not in self.request.data:
                    serializer.validated_data['severity'] = library_entry.severity
            else:
                from apps.core.services.ai_service import AIService
                ai_decoded = AIService.decode_obd_code(code_number)  # also caches to library
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

        # Check local library cache first
        library_entry = DiagnosticCodeLibrary.objects.filter(
            code_number=code_number, is_active=True
        ).first()

        if library_entry:
            library_entry.increment_use_count()
            return Response({
                'code': code_number,
                'title': library_entry.title,
                'description': library_entry.description,
                'severity': library_entry.severity,
                'common_causes': library_entry.common_causes,
                'common_fixes': library_entry.common_fixes,
                'source': 'library',
            })

        # Not cached — call Gemini (which also saves to library automatically)
        from apps.core.services.ai_service import AIService
        ai_decoded = AIService.decode_obd_code(code_number)

        return Response({
            'code': code_number,
            'title': ai_decoded.get('title', code_number),
            'description': ai_decoded.get('description', f'Unknown Diagnostic Code {code_number}'),
            'severity': ai_decoded.get('severity', 'info'),
            'common_causes': ai_decoded.get('common_causes', []),
            'common_fixes': ai_decoded.get('common_fixes', []),
            'source': 'ai',
        })
    
    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """Mark code as resolved"""
        code = self.get_object()
        assert_diagnosis_editable(code.diagnosis)
        code.status = 'resolved'
        code.save(update_fields=['status'])
        serializer = self.get_serializer(code)
        return Response({
            'message': 'Code marked as resolved',
            'code': serializer.data
        })


class DiagnosticTestViewSet(
    DiagnosisPermissionMixin, DiagnosisMutationLockMixin, viewsets.ModelViewSet
):
    """
    ViewSet for Diagnostic Tests.
    """
    queryset = DiagnosticTest.objects.all().select_related(
        'diagnosis', 'diagnosis__work_order', 'performed_by'
    )
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
    
    def get_serializer_class(self) -> type:
        if self.action in ['create', 'update', 'partial_update']:
            return DiagnosticTestCreateSerializer
        return DiagnosticTestSerializer
    
    def perform_create(self, serializer):
        """Set performed_by to current user if not specified"""
        assert_diagnosis_editable(serializer.validated_data.get('diagnosis'))
        if not serializer.validated_data.get('performed_by'):
            serializer.save(performed_by=self.request.user)
        else:
            serializer.save()


class DiagnosisFindingViewSet(
    DiagnosisPermissionMixin, DiagnosisMutationLockMixin, viewsets.ModelViewSet
):
    """
    ViewSet for Diagnosis Findings.
    """
    queryset = DiagnosisFinding.objects.all().select_related(
        'diagnosis', 'diagnosis__work_order'
    ).prefetch_related('diagnostic_codes', 'diagnostic_tests', 'photos')
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
    
    def get_serializer_class(self) -> type:
        if self.action in ['create', 'update', 'partial_update']:
            return DiagnosisFindingCreateSerializer
        return DiagnosisFindingSerializer

    def create(self, request, *args, **kwargs):
        """Create a finding and return the read serializer payload with ids and links."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assert_diagnosis_editable(serializer.validated_data.get('diagnosis'))
        finding = serializer.save()
        detail_serializer = DiagnosisFindingSerializer(finding, context=self.get_serializer_context())
        headers = self.get_success_headers(detail_serializer.data)
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class DiagnosisPhotoViewSet(
    DiagnosisPermissionMixin, DiagnosisMutationLockMixin, viewsets.ModelViewSet
):
    """
    ViewSet for Diagnosis Photos.
    """
    queryset = DiagnosisPhoto.objects.all().select_related(
        'diagnosis', 'diagnosis__work_order', 'finding', 'taken_by'
    )
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
        assert_diagnosis_editable(serializer.validated_data.get('diagnosis'))
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

class TestProcedureLibraryViewSet(DiagnosisCodeLibraryPermissionMixin, viewsets.ModelViewSet):
    """
    ViewSet for Test Procedure Library.
    """
    queryset = TestProcedureLibrary.objects.all().select_related('created_by')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['name', 'description', 'test_procedure']
    ordering_fields = ['name', 'category', 'use_count', 'created_at']
    ordering = ['category', 'name']

    def get_queryset(self):
        queryset = super().get_queryset()
        if not queryset.exists():
            user = self.request.user if getattr(self.request, 'user', None) and self.request.user.is_authenticated else None
            created_by = user if getattr(user, 'role', None) in {'admin', 'manager', 'technician'} else None
            seed_baseline_test_procedures(created_by=created_by)
            queryset = super().get_queryset()
        return queryset
    
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


class DiagnosticCodeLibraryViewSet(DiagnosisCodeLibraryPermissionMixin, viewsets.ModelViewSet):
    """
    ViewSet for Diagnostic Code Library (Code Lookup).
    """
    queryset = DiagnosticCodeLibrary.objects.all()
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


class DiagnosisHistoryViewSet(DiagnosisPermissionMixin, viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Diagnosis History/Analytics (Read-only).
    """
    queryset = DiagnosisHistory.objects.all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['vehicle_make', 'vehicle_model', 'vehicle_year']
    search_fields = ['vehicle_make', 'vehicle_model']
    ordering_fields = ['diagnosis_count', 'avg_repair_cost', 'created_at']
    ordering = ['-diagnosis_count']
    serializer_class = DiagnosisHistorySerializer
    
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
