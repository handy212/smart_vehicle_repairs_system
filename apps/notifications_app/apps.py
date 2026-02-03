from django.apps import AppConfig


class NotificationsAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.notifications_app'
    verbose_name = 'Notifications'
    
    def ready(self):
        """
        Initialize Firebase when Django starts
        """
        from .firebase import initialize_firebase
        initialize_firebase()
        
        # Register signals
        import apps.notifications_app.signals
