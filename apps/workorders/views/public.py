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
from drf_spectacular.utils import extend_schema, inline_serializer, OpenApiTypes
from rest_framework import serializers

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

    @extend_schema(
        request=inline_serializer(
            name='PublicWorkOrderApproveRequest',
            fields={'notes': serializers.CharField(required=False)},
        ),
        responses=PublicWorkOrderSerializer,
        description='Customer approves a work order awaiting approval via portal access token.',
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
            from apps.accounts.terms_service import enforce_and_record_approval_terms
            from apps.accounts.terms_models import TermsAcceptance

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

            enforce_and_record_approval_terms(
                request=request,
                customer=work_order.customer,
                document_type=TermsAcceptance.DOCUMENT_WORK_ORDER,
                work_order=work_order,
                estimate=getattr(work_order, 'estimate', None),
                method='digital',
                is_public=True,
            )
            work_order.approve_customer_work(
                user=None,
                method='digital',
                notes=approval_notes,
            )

            return Response({'status': 'approved'})
            
        except ValidationError as e:
            from apps.accounts.terms_service import format_terms_validation_error
            return Response({'error': format_terms_validation_error(e)}, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        request=inline_serializer(
            name='PublicWorkOrderDeclineRequest',
            fields={'reason': serializers.CharField(required=False)},
        ),
        responses=inline_serializer(
            name='PublicWorkOrderDeclineResponse',
            fields={'status': serializers.CharField()},
        ),
        description='Customer declines a work order awaiting approval via portal access token.',
    )
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
