"""API for centralized Import/Export under Data & Audit."""
from __future__ import annotations

from django.http import FileResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import HasAnyPermission, HasPermission
from apps.data_exchange.models import ImportBatch, ImportRowResult
from apps.data_exchange.registry import list_exporters, list_importers
from apps.data_exchange.serializers import (
    ImportBatchCreateSerializer,
    ImportBatchSerializer,
    ImportRowResultSerializer,
)
from apps.data_exchange.cleanup import (
    CONFIRM_PHRASE,
    get_wipe_job,
    preview_customer_vehicle_wipe,
    queue_customer_vehicle_wipe,
)
from apps.data_exchange.services import (
    build_validation_report_workbook,
    cancel_batch,
    create_batch,
    queue_commit,
    queue_preview,
    run_export,
    run_rollback,
)


class DataExchangeViewSet(viewsets.ViewSet):
    """Catalog of available import/export modules."""

    permission_classes = [IsAuthenticated, HasPermission('manage_data_exchange')]

    def get_permissions(self):
        if self.action in {'modules', 'exporters'}:
            return [
                IsAuthenticated(),
                HasAnyPermission(['manage_data_exchange', 'view_audit_logs'])(),
            ]
        return [IsAuthenticated(), HasPermission('manage_data_exchange')()]

    @action(detail=False, methods=['get'])
    def modules(self, request):
        return Response({
            'importers': list_importers(),
            'exporters': list_exporters(),
        })

    @action(detail=False, methods=['get'])
    def exporters(self, request):
        return Response({'exporters': list_exporters()})

    @action(detail=False, methods=['get'], url_path=r'export/(?P<module_key>[^/.]+)')
    def export_module(self, request, module_key=None):
        try:
            buffer, filename, content_type = run_export(module_key, dict(request.query_params))
        except KeyError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as exc:  # noqa: BLE001
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        response = FileResponse(buffer, as_attachment=True, filename=filename)
        response['Content-Type'] = content_type
        return response

    @action(detail=False, methods=['get', 'post'])
    def wipe(self, request):
        """
        Dry-run, queue, or poll migration wipe of customers/vehicles + related ops.

        GET: return active/latest wipe job status
        POST body:
          dry_run: bool (default true) — return counts only
          confirm: str — must be "DELETE CUSTOMERS" to start wipe (async)
          clear_import_batches: bool (default true)
        """
        if request.method == 'GET':
            job = get_wipe_job()
            if not job:
                return Response({'status': 'idle', 'job': None})
            return Response({'status': job.get('status'), 'job': job})

        dry_run = request.data.get('dry_run', True)
        if isinstance(dry_run, str):
            dry_run = dry_run.lower() not in ('0', 'false', 'no')

        if dry_run:
            return Response(preview_customer_vehicle_wipe())

        confirm = request.data.get('confirm') or ''
        clear_batches = request.data.get('clear_import_batches', True)
        if isinstance(clear_batches, str):
            clear_batches = clear_batches.lower() not in ('0', 'false', 'no')

        try:
            result = queue_customer_vehicle_wipe(
                confirm=confirm,
                user=request.user,
                clear_import_batches=bool(clear_batches),
            )
        except ValueError as exc:
            return Response(
                {'error': str(exc), 'confirm_phrase': CONFIRM_PHRASE},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:  # noqa: BLE001
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        http_status = (
            status.HTTP_202_ACCEPTED
            if result.get('async')
            else status.HTTP_200_OK
        )
        return Response(result, status=http_status)


class ImportBatchViewSet(viewsets.ModelViewSet):
    """Upload → preview → commit → rollback lifecycle."""

    serializer_class = ImportBatchSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_permissions(self):
        if self.action in {'list', 'retrieve', 'rows', 'validation_report'}:
            return [
                IsAuthenticated(),
                HasAnyPermission(['manage_data_exchange', 'view_audit_logs'])(),
            ]
        return [IsAuthenticated(), HasPermission('manage_data_exchange')()]

    def get_queryset(self):
        qs = ImportBatch.objects.select_related('created_by').all()
        module_key = self.request.query_params.get('module_key')
        status_filter = self.request.query_params.get('status')
        if module_key:
            qs = qs.filter(module_key=module_key)
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = ImportBatchCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            batch = create_batch(
                module_key=serializer.validated_data['module_key'],
                upload=serializer.validated_data['file'],
                user=request.user,
                options=serializer.validated_data.get('options'),
            )
            # Return immediately; heavy validation runs in background.
            batch = queue_preview(batch)
        except Exception as exc:  # noqa: BLE001
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ImportBatchSerializer(batch).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        batch = self.get_object()
        try:
            batch = queue_preview(batch)
        except Exception as exc:  # noqa: BLE001
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ImportBatchSerializer(batch).data)

    @action(detail=True, methods=['post'])
    def commit(self, request, pk=None):
        batch = self.get_object()
        force = bool(request.data.get('force'))
        try:
            batch = queue_commit(batch, force=force)
        except Exception as exc:  # noqa: BLE001
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ImportBatchSerializer(batch).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Stop a previewing/committing batch and unlock it for delete/retry."""
        batch = self.get_object()
        try:
            batch = cancel_batch(batch)
        except Exception as exc:  # noqa: BLE001
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ImportBatchSerializer(batch).data)

    @action(detail=True, methods=['post'])
    def rollback(self, request, pk=None):
        batch = self.get_object()
        try:
            batch = run_rollback(batch)
        except Exception as exc:  # noqa: BLE001
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ImportBatchSerializer(batch).data)

    @action(detail=True, methods=['get'])
    def rows(self, request, pk=None):
        batch = self.get_object()
        qs = ImportRowResult.objects.filter(batch=batch)
        action_filter = request.query_params.get('action')
        entity = request.query_params.get('entity_type')
        if action_filter:
            qs = qs.filter(action=action_filter)
        if entity:
            qs = qs.filter(entity_type=entity)
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(ImportRowResultSerializer(page, many=True).data)
        return Response(ImportRowResultSerializer(qs[:500], many=True).data)

    @action(detail=True, methods=['get'])
    def validation_report(self, request, pk=None):
        """Download full validation report (all issues, not UI-truncated)."""
        batch = self.get_object()
        try:
            buffer, filename, content_type = build_validation_report_workbook(batch)
        except Exception as exc:  # noqa: BLE001
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        response = FileResponse(buffer, as_attachment=True, filename=filename)
        response['Content-Type'] = content_type
        return response

    def _delete_batch_files(self, batch: ImportBatch) -> None:
        if batch.source_file:
            try:
                batch.source_file.delete(save=False)
            except Exception:  # noqa: BLE001
                pass

    def destroy(self, request, *args, **kwargs):
        batch = self.get_object()
        if batch.status == ImportBatch.STATUS_COMMITTING:
            return Response(
                {'error': 'Cannot delete a batch that is currently committing'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        self._delete_batch_files(batch)
        batch_id = batch.id
        batch.delete()
        return Response({'deleted': batch_id}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def clear_history(self, request):
        """
        Delete import batch history from Data & Audit.

        Body:
          include_completed: bool (default false) — also remove committed imports
            (removes rollback ability for those batches; does not delete customers/vehicles)
          statuses: optional list of statuses to delete
        """
        include_completed = bool(request.data.get('include_completed'))
        statuses = request.data.get('statuses')
        qs = self.get_queryset().exclude(status=ImportBatch.STATUS_COMMITTING)

        if isinstance(statuses, list) and statuses:
            qs = qs.filter(status__in=statuses)
        elif not include_completed:
            qs = qs.exclude(status=ImportBatch.STATUS_COMPLETED)

        deleted_ids = list(qs.values_list('id', flat=True))
        for batch in qs.iterator(chunk_size=100):
            self._delete_batch_files(batch)
        deleted_count, _ = qs.delete()

        return Response({
            'deleted_count': deleted_count,
            'deleted_ids': deleted_ids[:200],
            'include_completed': include_completed,
        })
