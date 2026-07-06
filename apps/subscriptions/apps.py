"""
Subscriptions app configuration
"""
from django.apps import AppConfig


class SubscriptionsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.subscriptions'
    verbose_name = 'Subscriptions'
    
    def ready(self):
        """Import signals when app is ready"""
        import apps.subscriptions.signals  # noqa

