from rest_framework import serializers

from apps.data_exchange.models import ImportBatch, ImportRowResult


class ImportRowResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportRowResult
        fields = [
            'id', 'row_number', 'entity_type', 'action', 'identifier',
            'message', 'object_id', 'payload', 'created_at',
        ]


class ImportBatchSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    can_commit = serializers.SerializerMethodField()
    can_rollback = serializers.SerializerMethodField()

    class Meta:
        model = ImportBatch
        fields = [
            'id', 'uuid', 'module_key', 'status', 'original_filename',
            'options', 'preview_report', 'summary', 'created_object_refs',
            'error_message', 'created_by', 'created_by_name',
            'created_at', 'previewed_at', 'committed_at', 'rolled_back_at',
            'can_commit', 'can_rollback',
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        full = f'{obj.created_by.first_name} {obj.created_by.last_name}'.strip()
        return full or obj.created_by.email

    def get_can_commit(self, obj):
        if obj.status in {
            ImportBatch.STATUS_COMPLETED,
            ImportBatch.STATUS_ROLLED_BACK,
            ImportBatch.STATUS_PREVIEWING,
        }:
            return False
        report = obj.preview_report or {}
        # Allow resume when a previous background commit never finished.
        if obj.status == ImportBatch.STATUS_COMMITTING:
            refs = obj.created_object_refs or {}
            created_any = any(refs.get(key) for key in refs)
            return bool(report.get('can_commit')) and not created_any and not obj.committed_at
        if obj.status == ImportBatch.STATUS_PREVIEWED:
            return bool(report.get('can_commit'))
        return False

    def get_can_rollback(self, obj):
        return (
            obj.status == ImportBatch.STATUS_COMPLETED
            and bool(obj.created_object_refs)
        )


class ImportBatchCreateSerializer(serializers.Serializer):
    module_key = serializers.CharField(max_length=64)
    file = serializers.FileField()
    options = serializers.JSONField(required=False)
