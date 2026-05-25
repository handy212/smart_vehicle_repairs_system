import logging

from django.apps import AppConfig
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.accounts'
    verbose_name = 'User Accounts'

    def ready(self):
        if getattr(settings, 'SKIP_AUDIT_REGISTRY', False):
            return
        import apps.accounts.audit_registry
        self._validate_production_security_settings()

    def _validate_production_security_settings(self):
        """Warn or fail fast when production is missing critical secrets."""
        if settings.DEBUG:
            return
        if not getattr(settings, 'REQUIRE_WEBHOOK_SIGNATURES', False):
            return

        missing = []
        if not getattr(settings, 'PAYSTACK_SECRET_KEY', ''):
            missing.append('PAYSTACK_SECRET_KEY')
        if not getattr(settings, 'HUBTEL_API_SECRET', ''):
            missing.append('HUBTEL_API_SECRET')

        if not missing:
            return

        message = (
            'Production security: REQUIRE_WEBHOOK_SIGNATURES is enabled but '
            f'the following are unset: {", ".join(missing)}'
        )
        if getattr(settings, 'WEBHOOK_SECRETS_STRICT', False):
            raise ImproperlyConfigured(message)
        logger.warning(message)
