import logging
from datetime import timedelta

from celery import shared_task

from config.celery_queues import HEAVY_CELERY_QUEUE
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


@shared_task(queue=HEAVY_CELERY_QUEUE)
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


@shared_task(name='ai_daily_ops_briefing')
def send_daily_ops_briefing():
    """Generate and deliver a daily operations briefing to managers (6 AM local)."""
    from apps.core.services.ai_audit import is_ai_enabled
    from apps.core.services.ai_service import AIService
    from apps.notifications_app.models import Notification
    from apps.accounts.models import User

    if not is_ai_enabled('ops_briefing'):
        return 'AI ops briefing disabled'

    from .operations_reports import OperationsReportingService
    today = timezone.now().date()
    start = today.replace(day=1)
    context = {
        'exceptions': OperationsReportingService.exception_log(None),
        'return_jobs': OperationsReportingService.cost_control_return_jobs(start, today, None),
        'capacity': OperationsReportingService.capacity_planning(start, today, None),
        'ap_cycle': OperationsReportingService.ap_cycle_time(start, today, None),
        'period': {'start': str(start), 'end': str(today)},
    }
    briefing = AIService.generate_ops_briefing(context)
    if not briefing:
        return 'No briefing generated'

    manager_users = User.objects.filter(is_active=True, groups__name__in=['Manager', 'Admin']).distinct()
    if not manager_users.exists():
        manager_users = User.objects.filter(is_active=True, is_staff=True)[:10]

    created = 0
    for user in manager_users:
        Notification.objects.create(
            recipient=user,
            notification_type='system',
            channel='in_app',
            priority='high',
            title='Daily Operations Briefing',
            message=briefing[:2000],
            data={'type': 'ops_briefing', 'full_briefing': briefing},
            status='sent',
            sent_at=timezone.now(),
        )
        created += 1
    return f'Delivered briefing to {created} manager(s)'


@shared_task(name='ai_proactive_exception_comms')
def proactive_exception_comms():
    """Draft exception comms and notify managers when new critical delays are detected."""
    from apps.core.services.ai_audit import is_ai_enabled
    from apps.core.services.ai_service import AIService
    from apps.notifications_app.models import Notification
    from apps.accounts.models import User

    if not is_ai_enabled('ops_exception_draft'):
        return 'Proactive exception comms disabled'

    from .operations_reports import OperationsReportingService
    data = OperationsReportingService.exception_log(None)
    exceptions = [
        e for e in data.get('exceptions', [])
        if e.get('type') == 'work_order_delay' and (e.get('delay_hours') or 0) >= 24
    ]
    if not exceptions:
        return 'No critical exceptions'

    drafts = AIService.draft_exception_comms(exceptions[:10])
    managers = User.objects.filter(is_active=True, is_staff=True)[:20]
    created = 0
    for draft in drafts[:5]:
        msg = f"{draft.get('reference', 'Exception')}: {draft.get('draft_sms', '')}"
        for user in managers:
            Notification.objects.create(
                recipient=user,
                notification_type='work_order',
                channel='in_app',
                priority='urgent',
                title='Exception — draft customer SMS',
                message=msg[:500],
                data={'draft': draft, 'requires_approval': True},
                status='sent',
                sent_at=timezone.now(),
            )
            created += 1
    return f'Created {created} exception draft notification(s)'
