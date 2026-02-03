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
def send_service_reminders(days_ahead=7):
    """
    Send service reminders for vehicles with services due within the next X days.
    
    Args:
        days_ahead: Number of days ahead to check for due services (default: 7)
    
    Returns:
        String with summary of reminders sent
    """
    from datetime import timedelta
    from django.db.models import Q, F
    from apps.vehicles.models import VehicleServiceSchedule
    from apps.notifications_app.triggers import notification_triggers
    
    logger.info(f"Starting service reminders task (checking {days_ahead} days ahead)")
    
    today = timezone.now().date()
    target_date = today + timedelta(days=days_ahead)
    
    # Find all active service schedules that are due or will be due soon
    due_schedules = VehicleServiceSchedule.objects.select_related(
        'vehicle', 'vehicle__owner', 'vehicle__owner__user',
        'service_type'
    ).filter(
        is_active=True,
        vehicle__status='active'
    ).filter(
        # Due by date
        Q(next_service_due_date__lte=target_date, next_service_due_date__gte=today) |
        # Due by mileage (current mileage >= due mileage)
        Q(next_service_due_mileage__lte=F('vehicle__current_mileage')) |
        # Already overdue by date
        Q(next_service_due_date__lt=today) |
        # No due date but has due mileage
        Q(next_service_due_date__isnull=True, next_service_due_mileage__isnull=False, 
          next_service_due_mileage__lte=F('vehicle__current_mileage'))
    )
    
    reminders_sent = 0
    reminders_skipped = 0
    errors = 0
    
    for schedule in due_schedules:
        try:
            # Check if customer has user account
            if not schedule.vehicle.owner or not schedule.vehicle.owner.user:
                logger.debug(f"Skipping schedule {schedule.id} - no customer user account")
                reminders_skipped += 1
                continue
            
            # Check if we've sent a reminder recently (within last 7 days) to avoid spam
            from apps.notifications_app.models import Notification
            recent_reminder = Notification.objects.filter(
                recipient=schedule.vehicle.owner.user,
                notification_type='vehicle',
                related_object_type='service_schedule',
                related_object_id=schedule.id,
                created_at__gte=timezone.now() - timedelta(days=7)
            ).exists()
            
            if recent_reminder:
                logger.debug(f"Skipping schedule {schedule.id} - reminder sent recently")
                reminders_skipped += 1
                continue
            
            # Send reminder via notification triggers
            notification_triggers.service_due_reminder(schedule)
            reminders_sent += 1
            logger.info(f"Sent service reminder for {schedule.vehicle} - {schedule.service_type.name}")
            
        except Exception as e:
            errors += 1
            logger.error(f"Failed to send reminder for schedule {schedule.id}: {str(e)}", exc_info=True)
    
    result = (
        f"Service reminders completed: {reminders_sent} sent, "
        f"{reminders_skipped} skipped, {errors} errors"
    )
    logger.info(result)
    return result

@shared_task
def cleanup_old_notifications():
    """
    Placeholder for cleanup task
    """
    logger.info("Cleanup old notifications task started")
    # Logic to delete old/read notifications
    return "Cleanup completed"
