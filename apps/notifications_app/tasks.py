from celery import shared_task
from django.utils import timezone
from .models import Notification
import logging

logger = logging.getLogger(__name__)

@shared_task
def process_scheduled_notifications():
    """
    Process notifications that are scheduled for delivery.
    """
    now = timezone.now()
    # Find notifications that are pending and scheduled for now or anytime in the past
    pending_notifications = Notification.objects.filter(
        status='pending',
        scheduled_for__lte=now
    )

    count = pending_notifications.count()
    if count > 0:
        logger.info(f"Processing {count} scheduled notifications")
        
        for notification in pending_notifications:
            try:
                # In a real system, here we would trigger the actual sending logic (Email, SMS, etc.)
                # For now, we'll mark them as 'sent' and set the sent_at timestamp
                notification.status = 'sent'
                notification.sent_at = timezone.now()
                notification.save(update_fields=['status', 'sent_at'])
                logger.info(f"Processed scheduled notification {notification.id}")
            except Exception as e:
                logger.error(f"Failed to process notification {notification.id}: {str(e)}")
                notification.status = 'failed'
                notification.error_message = str(e)
                notification.save(update_fields=['status', 'error_message'])

    return f"Processed {count} scheduled notifications"

@shared_task
def send_service_reminders():
    """
    Placeholder for service reminders task
    """
    logger.info("Service service reminders task started")
    # Logic to check service due dates and create notifications would go here
    return "Service reminders check completed"

@shared_task
def cleanup_old_notifications():
    """
    Placeholder for cleanup task
    """
    logger.info("Cleanup old notifications task started")
    # Logic to delete old/read notifications
    return "Cleanup completed"
