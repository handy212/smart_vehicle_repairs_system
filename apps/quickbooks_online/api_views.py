"""DRF endpoints for QuickBooks account and item mappings."""

from django.apps import apps
from django.contrib.contenttypes.models import ContentType

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasPermission, IsModuleEnabled, user_has_permission
from apps.quickbooks_online.mapping_services import get_account_mapping_service
from apps.quickbooks_online.models import QBOMapping, QBOSyncLog
from apps.quickbooks_online.serializers import QBOMappingListSerializer, QBOSyncLogSerializer
from apps.quickbooks_online.services import QuickBooksService
from apps.quickbooks_online import tasks as qbo_tasks
from apps.quickbooks_online.outbound_log import run_outbound_entity_sync
from apps.quickbooks_online.bulk_outbound_sync import (
    count_pending_outbound_syncs,
    sync_all_pending_outbound,
)
from apps.quickbooks_online.outbound_entities import OUTBOUND_SYNC_ENTITIES
from apps.quickbooks_online.sync_policy import outbound_eligibility_reason


class QBOConnectedMixin:
    def ensure_connected(self):
        if not QuickBooksService.is_connected():
            return Response(
                {'detail': 'QuickBooks is not connected. Connect under Admin → Integrations first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not QuickBooksService.sdk_available():
            return Response(
                {'detail': QuickBooksService.sdk_unavailable_message()},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        if QuickBooksService.get_client() is None:
            return Response(
                {
                    'detail': (
                        'QuickBooks is linked but the live API session is unavailable. '
                        'Reconnect under Admin → Integrations.'
                    ),
                    'code': 'qbo_api_unavailable',
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return None


class QBOAccountsListView(QBOConnectedMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        IsModuleEnabled('accounting'),
        HasPermission('view_accounting'),
    ]

    def get(self, request):
        blocked = self.ensure_connected()
        if blocked:
            return blocked
        accounts, error = get_account_mapping_service().list_accounts()
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'accounts': accounts, 'is_connected': True})


class QBOItemsListView(QBOConnectedMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        IsModuleEnabled('accounting'),
        HasPermission('view_accounting'),
    ]

    def get(self, request):
        blocked = self.ensure_connected()
        if blocked:
            return blocked
        items, error = get_account_mapping_service().list_items()
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'items': items, 'is_connected': True})


class QBOTaxCodesListView(QBOConnectedMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        IsModuleEnabled('accounting'),
        HasPermission('view_accounting'),
    ]

    def get(self, request):
        blocked = self.ensure_connected()
        if blocked:
            return blocked
        tax_codes, error = get_account_mapping_service().list_tax_codes()
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'tax_codes': tax_codes, 'is_connected': True})


class QBOClassesListView(QBOConnectedMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        IsModuleEnabled('accounting'),
        HasPermission('view_accounting'),
    ]

    def get(self, request):
        blocked = self.ensure_connected()
        if blocked:
            return blocked
        classes, error = get_account_mapping_service().list_classes()
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'classes': classes, 'is_connected': True})


class QBOSyncLogsListView(APIView):
    permission_classes = [
        IsAuthenticated,
        IsModuleEnabled('accounting'),
        HasPermission('view_accounting'),
    ]

    def get(self, request):
        queryset = QBOSyncLog.objects.select_related('triggered_by').order_by('-started_at')

        entity_type = request.query_params.get('entity_type')
        if entity_type:
            queryset = queryset.filter(entity_type=entity_type)

        direction = request.query_params.get('direction')
        if direction:
            queryset = queryset.filter(direction=direction)

        log_status = request.query_params.get('status')
        if log_status:
            queryset = queryset.filter(status=log_status)

        try:
            limit = min(int(request.query_params.get('limit', 50)), 200)
        except (TypeError, ValueError):
            limit = 50

        logs = queryset[:limit]
        serializer = QBOSyncLogSerializer(logs, many=True)
        return Response({
            'count': queryset.count(),
            'results': serializer.data,
        })


class QBOMappingsListView(APIView):
    """List per-record QBO sync mappings (failed/pending/synced) for the integrations UI."""

    permission_classes = [
        IsAuthenticated,
        IsModuleEnabled('accounting'),
        HasPermission('view_accounting'),
    ]

    def get(self, request):
        from .mapping_list_helpers import (
            entity_type_display,
            load_mapping_instance,
            resolve_mapping_object_label,
        )

        queryset = (
            QBOMapping.objects.select_related('content_type')
            .order_by('-last_synced_at')
        )

        mapping_status = request.query_params.get('status')
        if mapping_status:
            queryset = queryset.filter(status=mapping_status)

        entity_type_filter = request.query_params.get('entity_type')
        if entity_type_filter:
            cfg = OUTBOUND_SYNC_ENTITIES.get(entity_type_filter)
            if cfg:
                model = apps.get_model(cfg['app_label'], cfg['model_name'])
                ct = ContentType.objects.get_for_model(model)
                queryset = queryset.filter(content_type_id=ct.id)
            else:
                queryset = queryset.none()

        try:
            limit = min(int(request.query_params.get('limit', 100)), 500)
        except (TypeError, ValueError):
            limit = 100

        rows = []
        for mapping in queryset[:limit]:
            instance, entity_type = load_mapping_instance(mapping)
            rows.append({
                'id': mapping.id,
                'entity_type': entity_type,
                'entity_type_display': entity_type_display(entity_type),
                'object_id': mapping.object_id,
                'object_label': resolve_mapping_object_label(instance) if instance else f'#{mapping.object_id}',
                'object_exists': instance is not None,
                'qbo_id': mapping.qbo_id or '',
                'status': mapping.status,
                'status_display': mapping.get_status_display(),
                'error_message': mapping.error_message or '',
                'last_synced_at': mapping.last_synced_at,
            })

        serializer = QBOMappingListSerializer(rows, many=True)
        return Response({
            'count': len(rows),
            'results': serializer.data,
        })


class QBOAccountMappingsView(QBOConnectedMixin, APIView):
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            permission_classes.append(HasPermission('view_accounting'))
        else:
            permission_classes.append(HasPermission('manage_accounting_periods'))
        return [permission() for permission in permission_classes]

    def get(self, request):
        blocked = self.ensure_connected()
        if blocked:
            return blocked
        overview = get_account_mapping_service().get_mapping_overview()
        return Response({'is_connected': True, **overview})

    def patch(self, request):
        blocked = self.ensure_connected()
        if blocked:
            return blocked

        mappings = request.data.get('mappings')
        if not isinstance(mappings, list):
            return Response(
                {'detail': 'Expected a list of mappings under the "mappings" key.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = get_account_mapping_service()
        errors = []
        updated = 0
        for entry in mappings:
            mapping_kind = entry.get('mapping_kind')
            mapping_key = entry.get('mapping_key')
            if not mapping_kind or not mapping_key:
                errors.append({'entry': entry, 'detail': 'mapping_kind and mapping_key are required.'})
                continue
            if entry.get('action') == 'clear':
                service.clear_row(mapping_kind, mapping_key)
                updated += 1
                continue
            success, error = service.map_row(
                mapping_kind,
                mapping_key,
                qbo_account_id=entry.get('qbo_account_id'),
                qbo_item_id=entry.get('qbo_item_id'),
                qbo_class_id=entry.get('qbo_class_id'),
                user=request.user,
            )
            if success:
                updated += 1
            else:
                errors.append({'mapping_kind': mapping_kind, 'mapping_key': mapping_key, 'detail': error})

        overview = service.get_mapping_overview()
        status_code = status.HTTP_200_OK if not errors else status.HTTP_207_MULTI_STATUS
        return Response(
            {
                'updated': updated,
                'errors': errors,
                'is_connected': True,
                **overview,
            },
            status=status_code,
        )


class QBOAccountMappingDetailView(QBOConnectedMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        IsModuleEnabled('accounting'),
        HasPermission('manage_accounting_periods'),
    ]

    def post(self, request, mapping_kind, mapping_key):
        blocked = self.ensure_connected()
        if blocked:
            return blocked

        service = get_account_mapping_service()
        action = request.data.get('action')

        if action == 'clear':
            service.clear_row(mapping_kind, mapping_key)
            return Response({'detail': 'Mapping cleared.', 'mapping_kind': mapping_kind, 'mapping_key': mapping_key})

        success, error = service.map_row(
            mapping_kind,
            mapping_key,
            qbo_account_id=request.data.get('qbo_account_id'),
            qbo_item_id=request.data.get('qbo_item_id'),
            qbo_class_id=request.data.get('qbo_class_id'),
            user=request.user,
        )
        if not success:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        mapping = service.get_mapping(mapping_kind, mapping_key)
        return Response({
            'detail': 'Mapping saved.',
            'mapping_kind': mapping_kind,
            'mapping_key': mapping_key,
            'qbo_account_id': mapping.qbo_account_id if mapping else '',
            'qbo_account_name': mapping.qbo_account_name if mapping else '',
            'qbo_item_id': mapping.qbo_item_id if mapping else '',
            'qbo_item_name': mapping.qbo_item_name if mapping else '',
            'qbo_class_id': mapping.qbo_class_id if mapping else '',
            'qbo_class_name': mapping.qbo_class_name if mapping else '',
        })


class QBOOutboundSyncView(QBOConnectedMixin, APIView):
    """Manually push a single SVR entity to QuickBooks Online."""

    permission_classes = [IsAuthenticated]

    def _entity_config(self, entity_type):
        return OUTBOUND_SYNC_ENTITIES.get(entity_type)

    def _module_enabled(self, module_slug):
        if not module_slug:
            return True
        checker = IsModuleEnabled(module_slug)
        return checker.has_permission(self.request, self)

    def _has_entity_permission(self, entity_config):
        return user_has_permission(self.request.user, entity_config['permission'])

    def _get_mapping_payload(self, instance):
        mapping = QBOMapping.objects.filter(
            content_type=ContentType.objects.get_for_model(instance),
            object_id=instance.id,
        ).first()
        return {
            'qbo_sync_status': mapping.status if mapping else 'un-synced',
            'qbo_sync_error': mapping.error_message if mapping else '',
            'qbo_id': mapping.qbo_id if mapping else '',
        }

    def post(self, request):
        blocked = self.ensure_connected()
        if blocked:
            return blocked

        entity_type = request.data.get('entity_type')
        object_id = request.data.get('object_id')
        inline = bool(request.data.get('inline', False))

        entity_config = self._entity_config(entity_type)
        if not entity_config:
            return Response(
                {
                    'detail': (
                        f'Unsupported entity_type "{entity_type}". '
                        f'Expected one of: {", ".join(sorted(OUTBOUND_SYNC_ENTITIES))}.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not self._module_enabled(entity_config['module']):
            return Response(
                {'detail': f'The {entity_config["module"]} module is not enabled.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not self._has_entity_permission(entity_config):
            return Response(
                {'detail': 'You do not have permission to sync this entity type.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            object_id = int(object_id)
        except (TypeError, ValueError):
            return Response(
                {'detail': 'object_id must be a positive integer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if object_id <= 0:
            return Response(
                {'detail': 'object_id must be a positive integer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        model = apps.get_model(entity_config['app_label'], entity_config['model_name'])
        try:
            instance = model.objects.get(id=object_id)
        except model.DoesNotExist:
            return Response(
                {'detail': f'{entity_config["model_name"]} {object_id} was not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        eligible, eligibility_reason = outbound_eligibility_reason(entity_type, instance)
        if not eligible:
            return Response(
                {
                    'detail': eligibility_reason,
                    'entity_type': entity_type,
                    'object_id': object_id,
                    **self._get_mapping_payload(instance),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if inline:
            result = run_outbound_entity_sync(
                entity_type,
                object_id,
                entity_config['app_label'],
                entity_config['model_name'],
                entity_config['service_method'],
            )
            payload = {
                'status': 'success' if result else 'failed',
                'queued': False,
                'entity_type': entity_type,
                'object_id': object_id,
                'qbo_id': getattr(result, 'Id', '') if result else '',
                **self._get_mapping_payload(instance),
            }
            if not result:
                payload['detail'] = payload['qbo_sync_error'] or 'Sync returned no result from QuickBooks.'
            return Response(payload)

        task = getattr(qbo_tasks, entity_config['task_name'])
        from .task_dispatch import schedule_entity_sync

        schedule_entity_sync(entity_type, object_id, task=task)
        queued = True
        message = 'Outbound sync queued. Status should update shortly.'

        return Response({
            'status': 'success',
            'queued': queued,
            'message': message,
            'entity_type': entity_type,
            'object_id': object_id,
            **self._get_mapping_payload(instance),
        })


class QBOBulkOutboundSyncView(QBOConnectedMixin, APIView):
    """Queue outbound sync for all eligible failed/pending QBOMapping rows."""

    permission_classes = [
        IsAuthenticated,
        HasPermission('manage_settings'),
    ]

    def post(self, request):
        blocked = self.ensure_connected()
        if blocked:
            return blocked

        include_failed = bool(request.data.get('include_failed', True))
        include_pending = bool(request.data.get('include_pending', True))
        if not include_failed and not include_pending:
            return Response(
                {'detail': 'At least one of include_failed or include_pending must be true.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queued, skipped = sync_all_pending_outbound(
            include_failed=include_failed,
            include_pending=include_pending,
        )
        counts = count_pending_outbound_syncs()
        return Response({
            'status': 'success',
            'queued': queued,
            'skipped_ineligible': len(skipped),
            'message': (
                f'Queued {queued} outbound sync(s). '
                f'{len(skipped)} mapping(s) skipped because the local record is not eligible.'
            ),
            'counts': counts,
        })


class QBOOwnerCoaSetupView(QBOConnectedMixin, APIView):
    """Apply owner legacy COA template mappings to QuickBooks (SVR GL stays lean)."""

    permission_classes = [
        IsAuthenticated,
        IsModuleEnabled('accounting'),
        HasPermission('manage_accounting_periods'),
    ]

    def post(self, request):
        blocked = self.ensure_connected()
        if blocked:
            return blocked

        from apps.accounting.wire_controls import wire_accounting_controls
        from apps.quickbooks_online.owner_coa_services import get_owner_coa_setup_service

        dry_run = bool(request.data.get('dry_run', False))
        overwrite = bool(request.data.get('overwrite', False))
        wire_svr = bool(request.data.get('wire_svr', False))

        if wire_svr and not dry_run:
            wire_accounting_controls()

        service = get_owner_coa_setup_service()
        result = service.run_full_setup(
            dry_run=dry_run,
            overwrite=overwrite,
            user=request.user,
        )

        if not result.get('success'):
            return Response({'detail': result.get('error')}, status=status.HTTP_400_BAD_REQUEST)

        overview = get_account_mapping_service().get_mapping_overview()
        return Response({
            'is_connected': True,
            'dry_run': dry_run,
            **result,
            **overview,
        })


class QBORefreshCompanyView(QBOConnectedMixin, APIView):
    """Refresh connected company display name from QBO CompanyInfo."""

    permission_classes = [
        IsAuthenticated,
        IsModuleEnabled('accounting'),
        HasPermission('manage_settings'),
    ]

    def post(self, request):
        blocked = self.ensure_connected()
        if blocked:
            return blocked
        company_name = QuickBooksService.fetch_and_store_company_name()
        if not company_name:
            return Response(
                {'detail': 'Could not read company name from QuickBooks.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({'company_name': company_name})


class QBOMappingClearView(QBOConnectedMixin, APIView):
    """Clear a stale SVR ↔ QBO entity link before retrying outbound sync."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        blocked = self.ensure_connected()
        if blocked:
            return blocked

        entity_type = request.data.get('entity_type')
        object_id = request.data.get('object_id')
        delete = bool(request.data.get('delete', False))

        entity_config = OUTBOUND_SYNC_ENTITIES.get(entity_type)
        if not entity_config:
            return Response(
                {'detail': f'Unsupported entity_type "{entity_type}".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not self._has_entity_permission_for_config(request, entity_config):
            return Response(
                {'detail': 'You do not have permission to clear this mapping.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            object_id = int(object_id)
        except (TypeError, ValueError):
            return Response(
                {'detail': 'object_id must be a positive integer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        model = apps.get_model(entity_config['app_label'], entity_config['model_name'])
        try:
            instance = model.objects.get(id=object_id)
        except model.DoesNotExist:
            return Response(
                {'detail': f'{entity_config["model_name"]} {object_id} was not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        service = QuickBooksService()
        cleared = service.clear_qbo_mapping(instance, delete=delete)
        return Response({
            'detail': 'Mapping cleared.' if cleared else 'No mapping existed.',
            'entity_type': entity_type,
            'object_id': object_id,
            'deleted': delete,
            **QBOOutboundSyncView()._get_mapping_payload(instance),
        })

    @staticmethod
    def _has_entity_permission_for_config(request, entity_config):
        return user_has_permission(request.user, entity_config['permission'])
