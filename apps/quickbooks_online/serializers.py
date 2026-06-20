"""DRF serializers for QuickBooks Online API responses."""

from rest_framework import serializers

from apps.quickbooks_online.models import QBOSyncLog


class QBOSyncLogSerializer(serializers.ModelSerializer):
    entity_type_display = serializers.CharField(source='get_entity_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    direction_display = serializers.CharField(source='get_direction_display', read_only=True)
    triggered_by_name = serializers.SerializerMethodField()
    duration_seconds = serializers.SerializerMethodField()

    class Meta:
        model = QBOSyncLog
        fields = [
            'id',
            'entity_type',
            'entity_type_display',
            'direction',
            'direction_display',
            'started_at',
            'finished_at',
            'duration_seconds',
            'records_pulled',
            'records_created',
            'records_updated',
            'records_skipped',
            'status',
            'status_display',
            'error_message',
            'triggered_by',
            'triggered_by_name',
        ]

    def get_triggered_by_name(self, obj):
        if not obj.triggered_by:
            return None
        return obj.triggered_by.get_full_name() or obj.triggered_by.username

    def get_duration_seconds(self, obj):
        if not obj.finished_at:
            return None
        delta = obj.finished_at - obj.started_at
        return round(delta.total_seconds(), 1)
