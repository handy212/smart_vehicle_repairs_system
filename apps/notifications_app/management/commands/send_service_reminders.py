"""
Management command to send service due reminders.
Run this command via cron job (e.g., daily at 9 AM) to send reminders for services due soon.

Usage:
    python manage.py send_service_reminders [--days-ahead 7] [--service-type SERVICE_TYPE_ID] [--channel sms] [--dry-run]
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from apps.vehicles.models import VehicleServiceSchedule, ServiceType
from apps.notifications_app.triggers import notification_triggers


class Command(BaseCommand):
    help = 'Send service due reminders for vehicles with services due soon'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days-ahead',
            type=int,
            default=7,
            help='Send reminders for services due within this many days (default: 7)'
        )
        parser.add_argument(
            '--service-type',
            type=int,
            help='Filter by specific service type ID'
        )
        parser.add_argument(
            '--channel',
            type=str,
            choices=['email', 'sms', 'call'],
            default='email',
            help='Notification channel to use (default: email)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview reminders without actually sending them'
        )

    def handle(self, *args, **options):
        days_ahead = options['days_ahead']
        service_type_id = options.get('service_type')
        channel = options['channel']
        dry_run = options['dry_run']
        
        today = timezone.now().date()
        target_date = today + timedelta(days=days_ahead)
        
        self.stdout.write(self.style.SUCCESS(
            f'Sending service reminders for services due between {today} and {target_date}'
        ))
        
        if service_type_id:
            try:
                service_type = ServiceType.objects.get(pk=service_type_id)
                self.stdout.write(f'Filtering by service type: {service_type.name}')
            except ServiceType.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'Service type with ID {service_type_id} not found'))
                return
        
        # Get services due within the date range
        from django.db.models import Q, F
        
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
        
        if service_type_id:
            due_schedules = due_schedules.filter(service_type_id=service_type_id)
        
        count = 0
        skipped = 0
        errors = 0
        
        for schedule in due_schedules:
            try:
                # Check if customer has user account
                if not schedule.vehicle.owner or not schedule.vehicle.owner.user:
                    self.stdout.write(self.style.WARNING(
                        f'  ⊘ Skipping {schedule.vehicle} - {schedule.service_type.name} (no customer user account)'
                    ))
                    skipped += 1
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
                    self.stdout.write(self.style.WARNING(
                        f'  ⊘ Skipping {schedule.vehicle} - {schedule.service_type.name} (reminder sent recently)'
                    ))
                    skipped += 1
                    continue
                
                if dry_run:
                    self.stdout.write(self.style.SUCCESS(
                        f'  [DRY RUN] Would send {channel} reminder for {schedule.vehicle} - {schedule.service_type.name} '
                        f'(Due: {schedule.next_service_due_date or "N/A"})'
                    ))
                    count += 1
                else:
                    # Send reminder via notification triggers
                    notification_triggers.service_due_reminder(schedule, channel=channel)
                    count += 1
                    self.stdout.write(self.style.SUCCESS(
                        f'  ✓ Sent {channel} reminder for {schedule.vehicle} - {schedule.service_type.name} '
                        f'to {schedule.vehicle.owner.user.get_full_name()}'
                    ))
                    
            except Exception as e:
                errors += 1
                self.stdout.write(self.style.ERROR(
                    f'  ✗ Failed to send reminder for {schedule.vehicle} - {schedule.service_type.name}: {e}'
                ))
        
        summary = f'\n✓ Successfully sent {count} service reminders'
        if skipped > 0:
            summary += f', skipped {skipped}'
        if errors > 0:
            summary += f', {errors} errors'
        if dry_run:
            summary = f'\n[DRY RUN] Would send {count} service reminders'
        
        self.stdout.write(self.style.SUCCESS(summary))
