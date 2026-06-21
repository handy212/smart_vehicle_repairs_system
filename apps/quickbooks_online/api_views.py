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
from apps.quickbooks_online.serializers import QBOSyncLogSerializer
from apps.quickbooks_online.services import QuickBooksService
from apps.quickbooks_online import tasks as qbo_tasks
from apps.quickbooks_online.outbound_log import get_mapping_error, record_outbound_sync
from apps.quickbooks_online.sync_policy import outbound_eligibility_reason

OUTBOUND_SYNC_ENTITIES = {
    'customer': {
        'app_label': 'customers',
        'model_name': 'Customer',
        'module': 'customers',
        'permission': 'view_customers',
        'task_name': 'task_sync_customer_to_qbo',
        'service_method': 'sync_customer',
    },
    'invoice': {
        'app_label': 'billing',
        'model_name': 'Invoice',
        'module': 'billing',
        'permission': 'view_billing',
        'task_name': 'task_sync_invoice_to_qbo',
        'service_method': 'sync_invoice',
    },
    'payment': {
        'app_label': 'billing',
        'model_name': 'Payment',
        'module': 'billing',
        'permission': 'view_billing',
        'task_name': 'task_sync_payment_to_qbo',
        'service_method': 'sync_payment',
    },
    'supplier': {
        'app_label': 'inventory',
        'model_name': 'Supplier',
        'module': 'inventory',
        'permission': 'view_inventory',
        'task_name': 'task_sync_supplier_to_qbo',
        'service_method': 'sync_supplier',
    },
    'purchase_order': {
        'app_label': 'inventory',
        'model_name': 'PurchaseOrder',
        'module': 'inventory',
        'permission': 'view_inventory',
        'task_name': 'task_sync_purchase_order_to_qbo',
        'service_method': 'sync_purchase_order',
    },
    'branch': {
        'app_label': 'branches',
        'model_name': 'Branch',
        'module': None,
        'permission': 'manage_branches',
        'task_name': 'task_sync_branch_to_qbo',
        'service_method': 'sync_branch',
    },
    'estimate': {
        'app_label': 'billing',
        'model_name': 'Estimate',
        'module': 'billing',
        'permission': 'view_billing',
        'task_name': 'task_sync_estimate_to_qbo',
        'service_method': 'sync_estimate',
    },
    'credit_note': {
        'app_label': 'billing',
        'model_name': 'CreditNote',
        'module': 'billing',
        'permission': 'view_billing',
        'task_name': 'task_sync_credit_note_to_qbo',
        'service_method': 'sync_credit_note',
    },
}


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
            service = QuickBooksService()
            sync_method = getattr(service, entity_config['service_method'])
            try:
                result = sync_method(instance)
            except Exception as exc:
                record_outbound_sync(entity_type, success=False, error_message=str(exc))
                return Response(
                    {
                        'status': 'error',
                        'queued': False,
                        'entity_type': entity_type,
                        'object_id': object_id,
                        'detail': str(exc),
                        **self._get_mapping_payload(instance),
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            if result:
                record_outbound_sync(entity_type, success=True)
            else:
                record_outbound_sync(
                    entity_type,
                    success=False,
                    error_message=get_mapping_error(instance) or 'Sync returned no result from QuickBooks.',
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
        try:
            task.delay(object_id)
            queued = True
            message = 'Outbound sync queued. Status should update shortly.'
        except Exception:
            task(object_id)
            queued = False
            message = 'Outbound sync completed directly because the background worker was unavailable.'

        return Response({
            'status': 'success',
            'queued': queued,
            'message': message,
            'entity_type': entity_type,
            'object_id': object_id,
            **self._get_mapping_payload(instance),
        })
