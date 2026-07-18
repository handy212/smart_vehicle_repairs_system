from django import forms
from django.contrib import admin
from django.utils.html import format_html

from .models import QBOConfig, QBOToken, QBOMapping, QBOSyncLog, QBOAccountMapping


def _mask_secret(value: str | None, *, visible: int = 4) -> str:
    if not value:
        return '—'
    text = str(value)
    if len(text) <= visible * 2:
        return '••••••••'
    return f'{text[:visible]}…{text[-visible:]}'


class QBOConfigAdminForm(forms.ModelForm):
    class Meta:
        model = QBOConfig
        fields = '__all__'
        widgets = {
            'client_secret': forms.PasswordInput(render_value=False, attrs={'autocomplete': 'new-password'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['client_secret'].required = False
        self.fields['client_secret'].help_text = (
            'Leave blank to keep the existing secret. Prefer Admin → Integrations.'
        )

    def save(self, commit=True):
        instance = super().save(commit=False)
        new_secret = self.cleaned_data.get('client_secret')
        if not new_secret and self.instance.pk:
            instance.client_secret = QBOConfig.objects.filter(pk=self.instance.pk).values_list(
                'client_secret', flat=True,
            ).first() or instance.client_secret
        if commit:
            instance.save()
        return instance


@admin.register(QBOConfig)
class QBOConfigAdmin(admin.ModelAdmin):
    form = QBOConfigAdminForm
    list_display = ('id', 'realm_id', 'company_name', 'is_sandbox', 'is_active', 'created_at', 'updated_at')
    list_filter = ('is_sandbox', 'is_active')
    search_fields = ('realm_id', 'client_id', 'company_name')
    readonly_fields = ('realm_id', 'client_secret_masked', 'created_at', 'updated_at')
    fields = (
        'client_id',
        'client_secret',
        'client_secret_masked',
        'realm_id',
        'company_name',
        'is_sandbox',
        'is_active',
        'created_at',
        'updated_at',
    )

    @admin.display(description='Client secret (current, masked)')
    def client_secret_masked(self, obj):
        return format_html('<code>{}</code>', _mask_secret(obj.client_secret))


@admin.register(QBOToken)
class QBOTokenAdmin(admin.ModelAdmin):
    list_display = ('config', 'expires_at', 'refresh_token_expires_at', 'updated_at')
    readonly_fields = (
        'config',
        'access_token_masked',
        'refresh_token_masked',
        'expires_at',
        'refresh_token_expires_at',
        'updated_at',
    )
    fields = readonly_fields

    @admin.display(description='Access token')
    def access_token_masked(self, obj):
        return format_html('<code>{}</code>', _mask_secret(obj.access_token))

    @admin.display(description='Refresh token')
    def refresh_token_masked(self, obj):
        return format_html('<code>{}</code>', _mask_secret(obj.refresh_token))

    def has_add_permission(self, request):
        return False


@admin.register(QBOMapping)
class QBOMappingAdmin(admin.ModelAdmin):
    list_display = ('content_type', 'object_id', 'content_object', 'qbo_id', 'status', 'last_synced_at')
    list_filter = ('content_type', 'status', 'last_synced_at')
    search_fields = ('qbo_id',)
    readonly_fields = ('qbo_sync_token', 'last_synced_at')


@admin.register(QBOSyncLog)
class QBOSyncLogAdmin(admin.ModelAdmin):
    list_display = (
        'entity_type', 'direction', 'status', 'started_at', 'finished_at',
        'records_pulled', 'records_created', 'records_updated', 'records_skipped',
        'triggered_by'
    )
    list_filter = ('entity_type', 'direction', 'status', 'started_at')
    readonly_fields = (
        'entity_type', 'direction', 'started_at', 'finished_at',
        'records_pulled', 'records_created', 'records_updated', 'records_skipped',
        'status', 'error_message', 'triggered_by'
    )

    def has_add_permission(self, request):
        return False  # Logs should never be manually created via admin


@admin.register(QBOAccountMapping)
class QBOAccountMappingAdmin(admin.ModelAdmin):
    list_display = (
        'mapping_kind', 'mapping_key', 'branch', 'qbo_account_name', 'qbo_item_name', 'status', 'updated_at',
    )
    list_filter = ('mapping_kind', 'status', 'branch')
    search_fields = ('mapping_key', 'qbo_account_name', 'qbo_item_name')
