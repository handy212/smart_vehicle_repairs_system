import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def check_low_stock_items():
    """Scan inventory and create low-stock alerts (scheduled daily)."""
    from apps.inventory.services import InventoryService

    alerts = InventoryService.check_and_create_stock_alerts()
    count = len(alerts)
    logger.info('Low stock check complete: %s new alert(s)', count)
    return f'Created {count} stock alert(s)'


@shared_task
def generate_weekly_reports():
    """
    Process due weekly report schedules.
    Report delivery can be extended to email/export services as needed.
    """
    from apps.reporting.models import ReportSchedule

    now = timezone.now()
    due = ReportSchedule.objects.filter(
        is_active=True,
        frequency='weekly',
        next_run_date__lte=now,
    )
    processed = 0

    for schedule in due:
        try:
            logger.info(
                'Processing weekly report schedule id=%s name=%s type=%s',
                schedule.id,
                schedule.name,
                schedule.report_type,
            )
            schedule.last_run_date = now
            schedule.next_run_date = now + timedelta(days=7)
            schedule.save(update_fields=['last_run_date', 'next_run_date'])
            processed += 1
        except Exception:
            logger.exception(
                'Failed to process weekly report schedule id=%s',
                schedule.id,
            )

    return f'Processed {processed} weekly report schedule(s)'
