"""
Gate Pass API views
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError as DRFValidationError
from django_filters.rest_framework import DjangoFilterBackend
from django.core.exceptions import ValidationError
from django.utils import timezone

from .models import GatePass
from .serializers import (
    GatePassListSerializer,
    GatePassDetailSerializer,
    GatePassCreateSerializer,
    GatePassUpdateSerializer
)
from apps.accounts.permissions import HasPermission
from apps.branches.utils import resolve_branch, filter_queryset_for_user_branches
from apps.notifications_app.triggers import notification_triggers


class GatePassViewSet(viewsets.ModelViewSet):
    """
    Gate Pass management with workflow actions
    """
    queryset = GatePass.objects.all().select_related(
        'work_order', 'work_order__customer', 'work_order__vehicle',
        'customer', 'customer__user', 'vehicle', 'branch',
        'issued_by', 'authorized_by'
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'work_order', 'customer', 'vehicle', 'branch']
    search_fields = [
        'gate_pass_number', 'work_order__work_order_number',
        'customer__user__first_name', 'customer__user__last_name',
        'vehicle__vin', 'vehicle__license_plate', 'pickup_person_name'
    ]
    ordering_fields = [
        'created_at', 'issued_at', 'completed_at', 'status', 'gate_pass_number'
    ]
    ordering = ['-created_at']

    def create(self, request, *args, **kwargs):
        """Override create to handle ValidationErrors from model"""
        try:
            return super().create(request, *args, **kwargs)
        except ValidationError as e:
            # Convert Django ValidationError to DRF ValidationError
            error_message = str(e)
            if hasattr(e, 'message_dict'):
                return Response(
                    e.message_dict,
                    status=status.HTTP_400_BAD_REQUEST
                )
            elif hasattr(e, 'messages'):
                return Response(
                    {'detail': e.messages[0] if e.messages else error_message},
                    status=status.HTTP_400_BAD_REQUEST
                )
            else:
                return Response(
                    {'detail': error_message},
                    status=status.HTTP_400_BAD_REQUEST
                )

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('view_gatepass')]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('create_gatepass')]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('change_gatepass')]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('delete_gatepass')]
        return [IsAuthenticated()]

    def get_queryset(self):
        """Filter gate passes by active branch from session"""
        queryset = super().get_queryset()
        # Check if user wants to see all branches (for admins) or just active branch
        show_all = self.request.query_params.get('all_branches', 'false').lower() == 'true'
        queryset = filter_queryset_for_user_branches(
            queryset,
            self.request.user,
            request=self.request,
            use_active_branch=not show_all
        )
        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return GatePassListSerializer
        elif self.action == 'create':
            return GatePassCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return GatePassUpdateSerializer
        return GatePassDetailSerializer

    def perform_create(self, serializer):
        """Create gate pass with branch resolution"""
        request = self.request
        branch_id = request.data.get('branch') or request.data.get('branch_id')
        branch = resolve_branch(request, branch_id=branch_id)

        # If branch is not provided, let serializer auto-populate from work order
        # Otherwise use the resolved branch
        save_kwargs = {'issued_by': request.user}
        if branch is not None:
            save_kwargs['branch'] = branch

        try:
            gate_pass = serializer.save(**save_kwargs)
            # Send notification to customer when gate pass is created
            try:
                notification_triggers.gate_pass_created(gate_pass)
            except Exception as notify_error:
                # Log notification error but don't fail the creation
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send gate pass created notification: {str(notify_error)}", exc_info=True)
        except ValidationError as e:
            # Convert Django ValidationError to DRF ValidationError
            error_message = str(e)
            if hasattr(e, 'message_dict'):
                # Django ValidationError with field-specific errors
                raise DRFValidationError(e.message_dict)
            elif hasattr(e, 'messages'):
                # Django ValidationError with messages list
                raise DRFValidationError(e.messages[0] if e.messages else error_message)
            else:
                raise DRFValidationError(error_message)
        except Exception as e:
            # Catch any other exceptions and provide a user-friendly message
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error creating gate pass: {str(e)}", exc_info=True)
            raise DRFValidationError(f"Error creating gate pass: {str(e)}")

    @action(detail=True, methods=['post'])
    def issue(self, request, pk=None):
        """Issue the gate pass (mark as issued)"""
        gate_pass = self.get_object()

        if gate_pass.status != 'pending':
            return Response(
                {'error': f'Cannot issue gate pass in {gate_pass.status} status.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            gate_pass.issue(user=request.user)
            # Send notification to customer when gate pass is issued
            try:
                notification_triggers.gate_pass_issued(gate_pass)
            except Exception as notify_error:
                # Log notification error but don't fail the issue action
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send gate pass issued notification: {str(notify_error)}", exc_info=True)
            serializer = self.get_serializer(gate_pass)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Complete the gate pass (vehicle picked up)"""
        gate_pass = self.get_object()

        if gate_pass.status not in ['pending', 'issued']:
            return Response(
                {'error': f'Cannot complete gate pass in {gate_pass.status} status.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            gate_pass.complete(user=request.user)
            serializer = self.get_serializer(gate_pass)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel the gate pass"""
        gate_pass = self.get_object()

        if gate_pass.status in ['completed', 'cancelled']:
            return Response(
                {'error': f'Cannot cancel gate pass in {gate_pass.status} status.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            gate_pass.cancel(user=request.user)
            serializer = self.get_serializer(gate_pass)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'], url_path='from-workorder/(?P<work_order_id>[^/.]+)')
    def from_workorder(self, request, work_order_id=None):
        """Get gate pass for a specific work order"""
        from apps.workorders.models import WorkOrder

        try:
            work_order = WorkOrder.objects.get(pk=work_order_id)
        except WorkOrder.DoesNotExist:
            return Response(
                {'error': 'Work order not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        gate_pass = GatePass.objects.filter(work_order=work_order).first()

        if not gate_pass:
            return Response(
                {'error': 'No gate pass found for this work order.'},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = self.get_serializer(gate_pass)
        return Response(serializer.data)
