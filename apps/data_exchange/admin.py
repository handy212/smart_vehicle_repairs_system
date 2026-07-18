from django.contrib import admin

from apps.data_exchange.models import ImportBatch, ImportRowResult


class ImportRowResultInline(admin.TabularInline):
    model = ImportRowResult
    extra = 0
    readonly_fields = (
        'row_number', 'entity_type', 'action', 'identifier',
        'message', 'object_id', 'created_at',
    )
    can_delete = False


@admin.register(ImportBatch)
class ImportBatchAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'module_key', 'status', 'original_filename',
        'created_by', 'created_at', 'committed_at',
    )
    list_filter = ('module_key', 'status', 'created_at')
    search_fields = ('original_filename', 'uuid', 'error_message')
    readonly_fields = (
        'uuid', 'preview_report', 'summary', 'created_object_refs',
        'created_at', 'previewed_at', 'committed_at', 'rolled_back_at',
    )
    inlines = [ImportRowResultInline]


@admin.register(ImportRowResult)
class ImportRowResultAdmin(admin.ModelAdmin):
    list_display = ('id', 'batch', 'row_number', 'entity_type', 'action', 'identifier')
    list_filter = ('entity_type', 'action')
    search_fields = ('identifier', 'message')
