"""Shared serializer helpers for QuickBooks Online sync fields."""


class QBOSyncFieldsMixin:
    """Omit QBO sync fields from API output when QuickBooks is not connected."""

    def _qbo_is_connected(self):
        if not hasattr(self, '_qbo_connected_cache'):
            from apps.quickbooks_online.services import QuickBooksService
            self._qbo_connected_cache = QuickBooksService.is_connected()
        return self._qbo_connected_cache

    def get_qbo_sync_status(self, obj):
        if not self._qbo_is_connected():
            return None
        mapping = self._get_qbo_mapping(obj)
        return mapping.status if mapping else 'un-synced'

    def get_qbo_sync_error(self, obj):
        if not self._qbo_is_connected():
            return None
        mapping = self._get_qbo_mapping(obj)
        return mapping.error_message if mapping else ''

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not self._qbo_is_connected():
            data.pop('qbo_sync_status', None)
            data.pop('qbo_sync_error', None)
        return data
