"""
Management command to send appointment reminders.
Run this command via cron job (e.g., daily at 9 AM) to send reminders for upcoming appointments.

Usage:
    python manage.py send_appointment_reminders [--hours-ahead 24] [--channel email|sms|push]
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from apps.appointments.models import Appointment
from apps.notifications_app.triggers import notification_triggers


class Command(BaseCommand):
    help = 'Send appointment reminders for upcoming appointments'

    def add_arguments(self, parser):
        parser.add_argument(
            '--hours-ahead',
            type=int,
            default=24,
            help='Send reminders for appointments within this many hours (default: 24)'
        )
        parser.add_argument(
            '--channel',
            type=str,
            choices=['email', 'sms', 'push'],
            default='email',
            help='Notification channel to use (default: email)'
        )

    def handle(self, *args, **options):
        hours_ahead = options['hours_ahead']
        channel = options['channel']
        now = timezone.now()
        reminder_window_start = now
        reminder_window_end = now + timedelta(hours=hours_ahead)
        
        self.stdout.write(self.style.SUCCESS(
            f'Sending appointment reminders for appointments between {reminder_window_start} and {reminder_window_end}'
        ))
        
        # Get confirmed appointments in the time window
        appointments = Appointment.objects.filter(
            status='confirmed',
            appointment_date__gte=reminder_window_start,
            appointment_date__lte=reminder_window_end
        ).select_related(
            'customer',
            'vehicle',
            'service_bay'
        )
        
        count = 0
        for appointment in appointments:
            try:
                # Check if reminder already sent today
                # (You could add a field to track this or check NotificationLog)
                notification_triggers.appointment_reminder(appointment, channel=channel)
                count += 1
                self.stdout.write(self.style.SUCCESS(
                    f'  ✓ Sent {channel} reminder for appointment {appointment.appointment_number} to {appointment.customer}'
                ))
            except Exception as e:
                self.stdout.write(self.style.ERROR(
                    f'  ✗ Failed to send reminder for appointment {appointment.appointment_number}: {e}'
                ))
        
        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Successfully sent {count} appointment reminders'
        ))
