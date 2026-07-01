from django.contrib import admin
from .models import QBOConfig, QBOToken, QBOMapping, QBOSyncLog, QBOAccountMapping

@admin.register(QBOConfig)
class QBOConfigAdmin(admin.ModelAdmin):
    list_display = ('id', 'realm_id', 'company_name', 'is_sandbox', 'is_active', 'created_at', 'updated_at')
    list_filter = ('is_sandbox', 'is_active')
    search_fields = ('realm_id', 'client_id', 'company_name')
    readonly_fields = ('realm_id', 'created_at', 'updated_at')

@admin.register(QBOToken)
class QBOTokenAdmin(admin.ModelAdmin):
    list_display = ('config', 'expires_at', 'refresh_token_expires_at')
    readonly_fields = ('access_token', 'refresh_token', 'expires_at', 'refresh_token_expires_at')

@admin.register(QBOMapping)
class QBOMappingAdmin(admin.ModelAdmin):
    list_display = ('content_type', 'object_id', 'content_object', 'qbo_id', 'status', 'last_synced_at')
    list_filter = ('content_type', 'status', 'last_synced_at')
    search_fields = ('qbo_id',)
    readonly_fields = ('qbo_sync_token', 'last_synced_at')

@admin.register(QBOSyncLog)
class QBOSyncLogAdmin(admin.ModelAdmin):
    list_display = (
        'entity_type', 'status', 'started_at', 'finished_at',
        'records_pulled', 'records_created', 'records_updated', 'records_skipped',
        'triggered_by'
    )
    list_filter = ('entity_type', 'status', 'started_at')
    readonly_fields = (
        'entity_type', 'started_at', 'finished_at',
        'records_pulled', 'records_created', 'records_updated', 'records_skipped',
        'status', 'error_message', 'triggered_by'
    )

    def has_add_permission(self, request):
        return False  # Logs should never be manually created via admin


@admin.register(QBOAccountMapping)
class QBOAccountMappingAdmin(admin.ModelAdmin):
    list_display = (
        'mapping_kind', 'mapping_key', 'qbo_account_name', 'qbo_item_name', 'status', 'updated_at',
    )
    list_filter = ('mapping_kind', 'status')
    search_fields = ('mapping_key', 'qbo_account_name', 'qbo_item_name')
