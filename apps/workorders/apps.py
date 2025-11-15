from django.apps import AppConfig


class WorkordersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.workorders'
    verbose_name = 'Work Orders'
    
    def ready(self):
        """Import signals when app is ready"""
        import apps.workorders.signals  # noqa