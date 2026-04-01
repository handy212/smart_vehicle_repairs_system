from django.apps import AppConfig
from django.conf import settings


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.accounts'
    verbose_name = 'User Accounts'

    def ready(self):
        if getattr(settings, 'SKIP_AUDIT_REGISTRY', False):
            return
        import apps.accounts.audit_registry
