from django.apps import AppConfig


class DataExchangeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.data_exchange'
    verbose_name = 'Data Import & Export'

    def ready(self):
        # Register built-in importers/exporters
        from apps.data_exchange import registry  # noqa: F401
        registry.autoload()
