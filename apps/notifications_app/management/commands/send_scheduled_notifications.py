"""
Management command to send scheduled notifications.
Run this command via cron job (e.g., every hour) to send scheduled notifications.

Usage:
    python manage.py send_scheduled_notifications
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.notifications_app.services import NotificationService
from apps.notifications_app.models import Notification


class Command(BaseCommand):
    help = 'Send scheduled notifications that are due'

    def handle(self, *args, **options):
        service = NotificationService()
        
        self.stdout.write(self.style.SUCCESS('Starting scheduled notifications send...'))
        
        # Send scheduled notifications
        count = service.send_scheduled_notifications()
        
        self.stdout.write(self.style.SUCCESS(
            f'✓ Successfully processed {count} scheduled notifications'
        ))
