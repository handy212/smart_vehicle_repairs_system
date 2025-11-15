"""
Management command to check for overdue work orders and send notifications.

This command should be run periodically (e.g., via cron) to check for overdue
work orders and notify relevant staff members.

Usage:
    python manage.py check_overdue_workorders
    python manage.py check_overdue_workorders --dry-run  # Preview without sending
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.workorders.models import WorkOrder
from apps.notifications_app.triggers import notification_triggers
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Check for overdue work orders and send notifications'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview overdue work orders without sending notifications',
        )
        parser.add_argument(
            '--days-overdue',
            type=int,
            default=0,
            help='Only notify for work orders overdue by this many days (default: 0)',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        days_overdue = options['days_overdue']
        
        now = timezone.now()
        threshold = now - timezone.timedelta(days=days_overdue)
        
        # Find overdue work orders
        overdue_wos = WorkOrder.objects.filter(
            estimated_completion__lt=threshold,
            status__in=['in_progress', 'paused', 'quality_check', 'awaiting_approval']
        ).select_related('customer', 'vehicle', 'primary_technician')
        
        count = overdue_wos.count()
        
        if count == 0:
            self.stdout.write(
                self.style.SUCCESS('No overdue work orders found.')
            )
            return
        
        self.stdout.write(
            self.style.WARNING(f'Found {count} overdue work order(s)')
        )
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - No notifications will be sent'))
            for wo in overdue_wos:
                days = (now - wo.estimated_completion).days
                self.stdout.write(
                    f'  - {wo.work_order_number}: {days} day(s) overdue '
                    f'(Status: {wo.get_status_display()}, '
                    f'Customer: {wo.customer}, Vehicle: {wo.vehicle})'
                )
            return
        
        # Send notifications
        notified = 0
        errors = 0
        
        for wo in overdue_wos:
            try:
                notification_triggers.work_order_overdue(wo)
                notified += 1
                days = (now - wo.estimated_completion).days
                self.stdout.write(
                    self.style.SUCCESS(
                        f'✓ Notified for {wo.work_order_number} '
                        f'({days} day(s) overdue)'
                    )
                )
            except Exception as e:
                errors += 1
                logger.error(f"Failed to send overdue notification for WO {wo.id}: {e}")
                self.stdout.write(
                    self.style.ERROR(
                        f'✗ Failed to notify for {wo.work_order_number}: {str(e)}'
                    )
                )
        
        # Summary
        self.stdout.write('')
        self.stdout.write(
            self.style.SUCCESS(
                f'Summary: {notified} notification(s) sent, {errors} error(s)'
            )
        )

