"""
Celery configuration for background tasks
"""
import os
from celery import Celery
from celery.schedules import crontab

# Set the default Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('smart_vehicle_repairs')

# Load config from Django settings
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks from all installed apps
app.autodiscover_tasks()

# Celery Beat Schedule for periodic tasks
app.conf.beat_schedule = {
    'send-service-reminders-daily': {
        'task': 'apps.notifications_app.tasks.send_service_reminders',
        'schedule': crontab(hour=9, minute=0),  # Run daily at 9 AM
    },
    'check-low-inventory-daily': {
        'task': 'apps.inventory.tasks.check_low_stock_items',
        'schedule': crontab(hour=8, minute=0),  # Run daily at 8 AM
    },
    'cleanup-old-notifications': {
        'task': 'apps.notifications_app.tasks.cleanup_old_notifications',
        'schedule': crontab(hour=2, minute=0, day_of_week=0),  # Run weekly on Sunday at 2 AM
    },
    'generate-weekly-reports': {
        'task': 'apps.reporting.tasks.generate_weekly_reports',
        'schedule': crontab(hour=6, minute=0, day_of_week=1),  # Run Monday at 6 AM
    },
}

@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
