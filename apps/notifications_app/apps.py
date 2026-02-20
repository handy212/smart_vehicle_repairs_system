from django.apps import AppConfig


class NotificationsAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.notifications_app'
    verbose_name = 'Notifications'
    
    def ready(self):
        """
        Register signals when app is ready.
        Firebase is initialized lazily when first used.
        """
        import apps.notifications_app.signals  # noqa
