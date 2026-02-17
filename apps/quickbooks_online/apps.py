from django.apps import AppConfig


class QuickbooksOnlineConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.quickbooks_online'

    def ready(self):
        import apps.quickbooks_online.signals
