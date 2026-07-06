"""
Acquisition request lifecycle: draft → approval → receive → capitalize into FixedAsset.
"""
from django.db import transaction
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import User
from apps.accounts.permissions import (
    HasAnyPermission,
    HasPermission,
    IsModuleEnabled,
    user_has_permission,
)
from apps.branches.utils import filter_queryset_for_user_branches
from apps.documents.models import Document

from .acquisition_service import capitalize_request
from .models import AssetAcquisitionApproval, AssetAcquisitionRequest
from .serializers import (
    AssetAcquisitionReceiveSerializer,
    AssetAcquisitionRequestSerializer,
    AssetAcquisitionRequestWriteSerializer,
)


def _can_select_approvers(user):
    return user_has_permission(user, 'approve_asset_acquisitions') or user_has_permission(
        user, 'manage_assets'
    )


class AssetAcquisitionRequestViewSet(viewsets.ModelViewSet):
    queryset = AssetAcquisitionRequest.objects.select_related(
        'category',
        'branch',
        'supplier',
        'requested_by',
        'approved_by',
        'rejected_by',
        'received_by',
        'created_asset',
    ).prefetch_related('approvals__approver')

    permission_classes = [IsAuthenticated, IsModuleEnabled('fixed-assets')]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'branch', 'category']
    search_fields = ['request_number', 'title', 'proposed_asset_name', 'description']
    ordering_fields = ['created_at', 'request_number', 'expected_acquisition_cost']
    ordering = ['-created_at']

    def get_permissions(self):
        base = [IsAuthenticated(), IsModuleEnabled('fixed-assets')]
        if self.action in ['list', 'retrieve']:
            return base + [HasPermission('view_assets')]
        if self.action == 'create':
            return base + [HasPermission('create_assets')]
        if self.action in ['update', 'partial_update', 'destroy']:
            return base + [HasPermission('create_assets')]
        if self.action == 'submit_for_approval':
            return base + [HasPermission('create_assets')]
        if self.action in ['approve', 'reject']:
            return base + [HasAnyPermission(['approve_asset_acquisitions', 'manage_assets'])]
        if self.action == 'receive':
            return base + [HasAnyPermission(['receive_asset_acquisitions', 'manage_assets'])]
        return base + [HasPermission('view_assets')]

    def get_queryset(self):
        qs = super().get_queryset()
        return filter_queryset_for_user_branches(qs, self.request.user, self.request)

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return AssetAcquisitionRequestWriteSerializer
        return AssetAcquisitionRequestSerializer

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user, status='draft')

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        pk = response.data.get('id')
        if pk is None:
            return response
        instance = AssetAcquisitionRequest.objects.select_related(
            'category',
            'branch',
            'supplier',
            'requested_by',
            'approved_by',
            'rejected_by',
            'received_by',
            'created_asset',
        ).prefetch_related('approvals__approver').get(pk=pk)
        response.data = AssetAcquisitionRequestSerializer(
            instance, context={'request': request}
        ).data
        return response

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status != 'draft':
            return Response(
                {'error': 'Only draft acquisition requests can be edited'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if instance.requested_by_id != request.user.id and not user_has_permission(
            request.user, 'manage_assets'
        ):
            return Response({'error': 'Not allowed to edit this request'}, status=status.HTTP_403_FORBIDDEN)
        response = super().update(request, *args, **kwargs)
        pk = instance.pk
        fresh = AssetAcquisitionRequest.objects.select_related(
            'category',
            'branch',
            'supplier',
            'requested_by',
            'approved_by',
            'rejected_by',
            'received_by',
            'created_asset',
        ).prefetch_related('approvals__approver').get(pk=pk)
        response.data = AssetAcquisitionRequestSerializer(
            fresh, context={'request': request}
        ).data
        return response

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status != 'draft':
            return Response(
                {'error': 'Only draft requests can be deleted'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if instance.requested_by_id != request.user.id and not user_has_permission(
            request.user, 'manage_assets'
        ):
            return Response({'error': 'Not allowed to delete this request'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @staticmethod
    def _requested_approver_ids(request):
        if hasattr(request.data, 'getlist'):
            approver_ids = request.data.getlist('approver_ids')
            if not approver_ids:
                approver_id = request.data.get('approver_id')
                approver_ids = [approver_id] if approver_id else []
        else:
            approver_ids = request.data.get('approver_ids')
            if approver_ids is None:
                approver_id = request.data.get('approver_id')
                approver_ids = [approver_id] if approver_id else []
            elif not isinstance(approver_ids, list):
                approver_ids = [approver_ids]

        cleaned = []
        seen = set()
        for approver_id in approver_ids:
            try:
                cleaned_id = int(approver_id)
            except (TypeError, ValueError):
                continue
            if cleaned_id not in seen:
                cleaned.append(cleaned_id)
                seen.add(cleaned_id)
        return cleaned

    @staticmethod
    def _notify_acquisition_approvers(acquisition, approvers):
        try:
            from apps.notifications_app.triggers import NotificationTriggers

            triggers = NotificationTriggers()
            for approver in approvers:
                triggers.asset_acquisition_approval_request(acquisition, approver)
        except Exception:
            pass

    @staticmethod
    def _notify_requester(acquisition, title, message):
        recipient = acquisition.requested_by
        if not recipient:
            return
        try:
            from apps.notifications_app.triggers import NotificationTriggers

            triggers = NotificationTriggers()
            triggers.asset_acquisition_notify_requester(acquisition, recipient, title, message)
        except Exception:
            pass

    @action(detail=True, methods=['post'], url_path='submit-for-approval')
    @transaction.atomic
    def submit_for_approval(self, request, pk=None):
        acquisition = self.get_object()
        if acquisition.status != 'draft':
            return Response(
                {'error': 'Only draft requests can be submitted'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if acquisition.requested_by_id != request.user.id and not user_has_permission(
            request.user, 'manage_assets'
        ):
            return Response({'error': 'Only the requester can submit'}, status=status.HTTP_403_FORBIDDEN)

        approver_ids = self._requested_approver_ids(request)
        if not approver_ids:
            return Response(
                {'error': 'Select at least one approver before submitting.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        approvers = list(User.objects.filter(id__in=approver_ids, is_active=True))
        approvers_by_id = {u.id: u for u in approvers}
        missing_ids = [i for i in approver_ids if i not in approvers_by_id]
        if missing_ids:
            return Response(
                {'error': 'One or more selected approvers were not found.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.user.id in approver_ids:
            return Response(
                {'error': 'You cannot approve your own acquisition request.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invalid = [u for u in approvers if not _can_select_approvers(u)]
        if invalid:
            return Response(
                {'error': 'Selected users must have approval permission for asset acquisitions.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ordered = [approvers_by_id[i] for i in approver_ids]
        acquisition.status = 'pending_approval'
        acquisition.submitted_at = timezone.now()
        acquisition.save(update_fields=['status', 'submitted_at', 'updated_at'])

        acquisition.approvals.all().delete()
        AssetAcquisitionApproval.objects.bulk_create(
            [
                AssetAcquisitionApproval(acquisition_request=acquisition, approver=a)
                for a in ordered
            ]
        )

        self._notify_acquisition_approvers(acquisition, ordered)

        return Response(
            {
                'status': acquisition.status,
                'approver_count': len(ordered),
                'request_number': acquisition.request_number,
            }
        )

    def _pending_approval_row(self, user, acquisition):
        return acquisition.approvals.filter(approver=user, status='pending').first()

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def approve(self, request, pk=None):
        acquisition = self.get_object()
        if acquisition.status != 'pending_approval':
            return Response(
                {'error': 'Only pending requests can be approved'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        row = self._pending_approval_row(request.user, acquisition)
        admin_override = user_has_permission(request.user, 'manage_assets')
        if not row and not admin_override:
            return Response(
                {'error': 'You are not an assigned approver for this request'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if request.user.id == acquisition.requested_by_id and not admin_override:
            return Response(
                {'error': 'The requester cannot approve their own request'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        acquisition.status = 'approved'
        acquisition.approved_by = request.user
        acquisition.approved_at = now
        acquisition.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])

        if row:
            row.status = 'approved'
            row.approved_at = now
            row.save(update_fields=['status', 'approved_at', 'updated_at'])

        pending_qs = acquisition.approvals.filter(status='pending')
        if row:
            pending_qs = pending_qs.exclude(pk=row.pk)
        pending_qs.update(status='cancelled')

        self._notify_requester(
            acquisition,
            title=f'Acquisition approved: {acquisition.request_number}',
            message=f'Your acquisition request {acquisition.request_number} was approved by '
            f'{request.user.get_full_name() or request.user.username}.',
        )

        return Response(AssetAcquisitionRequestSerializer(acquisition).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def reject(self, request, pk=None):
        acquisition = self.get_object()
        if acquisition.status != 'pending_approval':
            return Response(
                {'error': 'Only pending requests can be rejected'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        row = self._pending_approval_row(request.user, acquisition)
        admin_override = user_has_permission(request.user, 'manage_assets')
        if not row and not admin_override:
            return Response(
                {'error': 'You are not an assigned approver for this request'},
                status=status.HTTP_403_FORBIDDEN,
            )

        reason = (request.data.get('reason') or '').strip()

        now = timezone.now()
        acquisition.status = 'rejected'
        acquisition.rejected_by = request.user
        acquisition.rejected_at = now
        acquisition.rejection_reason = reason
        acquisition.save(
            update_fields=[
                'status',
                'rejected_by',
                'rejected_at',
                'rejection_reason',
                'updated_at',
            ]
        )

        if row:
            row.status = 'rejected'
            row.rejected_at = now
            row.rejection_reason = reason
            row.save(update_fields=['status', 'rejected_at', 'rejection_reason', 'updated_at'])

        pending_qs = acquisition.approvals.filter(status='pending')
        if row:
            pending_qs = pending_qs.exclude(pk=row.pk)
        pending_qs.update(status='cancelled')

        self._notify_requester(
            acquisition,
            title=f'Acquisition rejected: {acquisition.request_number}',
            message=f'Your acquisition request {acquisition.request_number} was rejected.'
            + (f' Reason: {reason}' if reason else ''),
        )

        return Response(AssetAcquisitionRequestSerializer(acquisition).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def receive(self, request, pk=None):
        acquisition = self.get_object()
        if acquisition.status != 'approved':
            return Response(
                {'error': 'Only approved requests can be received and capitalized'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        has_supporting_docs = Document.objects.filter(
            asset_acquisition_request=acquisition,
            acquisition_document_kind__in=['invoice', 'receipt'],
        ).exists()
        if not has_supporting_docs:
            return Response(
                {
                    'error': 'Upload at least one invoice or receipt linked to this acquisition request '
                    'before completing receipt.'
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        ser = AssetAcquisitionReceiveSerializer(
            data=request.data,
            context={'acquisition': acquisition},
        )
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        req_obj = acquisition
        effective_method = (
            req_obj.depreciation_method or req_obj.category.default_depreciation_method
        )
        if effective_method == 'units_of_production':
            tu = data.get('total_units')
            if tu is None or tu < 1:
                return Response(
                    {'error': 'total_units is required and must be >= 1 for units-of-production depreciation'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        dep_start = data.pop('_effective_depreciation_start')

        try:
            asset = capitalize_request(
                req_obj,
                acquisition_cost=data['acquisition_cost'],
                acquisition_date=data['acquisition_date'],
                depreciation_start_date=dep_start,
                asset_number=data.get('asset_number') or None,
                location=data.get('location') or '',
                manufacturer=data.get('manufacturer') or None,
                model_number=data.get('model_number') or None,
                serial_number=data.get('serial_number') or None,
                supplier_id=data.get('supplier'),
                total_units=data.get('total_units'),
                declining_balance_rate=data.get('declining_balance_rate'),
                notes=data.get('notes') or '',
                created_by=request.user,
            )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        acquisition.status = 'received'
        acquisition.received_by = request.user
        acquisition.received_at = timezone.now()
        acquisition.received_notes = data.get('received_notes') or ''
        acquisition.created_asset = asset
        acquisition.save(
            update_fields=[
                'status',
                'received_by',
                'received_at',
                'received_notes',
                'created_asset',
                'updated_at',
            ]
        )

        self._notify_requester(
            acquisition,
            title=f'Asset received: {acquisition.request_number}',
            message=f'Request {acquisition.request_number} was received and capitalized as asset {asset.asset_number}.',
        )

        return Response(AssetAcquisitionRequestSerializer(acquisition).data)
