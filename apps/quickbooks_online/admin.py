from django.contrib import admin
from .models import QBOConfig, QBOToken, QBOMapping

@admin.register(QBOConfig)
class QBOConfigAdmin(admin.ModelAdmin):
    list_display = ('id', 'realm_id', 'is_sandbox', 'is_active', 'created_at', 'updated_at')
    list_filter = ('is_sandbox', 'is_active')
    search_fields = ('realm_id', 'client_id')
    readonly_fields = ('realm_id', 'created_at', 'updated_at')

@admin.register(QBOToken)
class QBOTokenAdmin(admin.ModelAdmin):
    list_display = ('config', 'expires_at', 'refresh_token_expires_at')
    readonly_fields = ('access_token', 'refresh_token', 'expires_at', 'refresh_token_expires_at')

@admin.register(QBOMapping)
class QBOMappingAdmin(admin.ModelAdmin):
    list_display = ('content_type', 'object_id', 'content_object', 'qbo_id', 'last_synced_at')
    list_filter = ('content_type', 'last_synced_at')
    search_fields = ('qbo_id',)
    readonly_fields = ('qbo_sync_token', 'last_synced_at')
