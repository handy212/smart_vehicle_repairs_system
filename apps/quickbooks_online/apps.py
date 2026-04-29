from django.apps import AppConfig
import logging

logger = logging.getLogger(__name__)


class QuickbooksOnlineConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.quickbooks_online'

    def ready(self):
        try:
            import apps.quickbooks_online.signals  # noqa: F401
        except ModuleNotFoundError as exc:
            if exc.name in {"quickbooks", "intuitlib"}:
                logger.warning(
                    "QuickBooks SDK dependency '%s' is not installed; "
                    "QuickBooks signal sync is disabled.",
                    exc.name,
                )
                return
            raise
