"""DRF endpoints for QuickBooks account and item mappings."""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasPermission, IsModuleEnabled
from apps.quickbooks_online.mapping_services import get_account_mapping_service
from apps.quickbooks_online.services import QuickBooksService


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
