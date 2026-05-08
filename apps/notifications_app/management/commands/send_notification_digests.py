"""
Management command to send daily or weekly notification digests.
"""
from django.core.management.base import BaseCommand

from apps.notifications_app.services import NotificationService


class Command(BaseCommand):
    help = 'Send notification digests to users who opted in'

    def add_arguments(self, parser):
        parser.add_argument(
            '--frequency',
            choices=['daily', 'weekly'],
            default='daily',
            help='Digest frequency to send',
        )

    def handle(self, *args, **options):
        frequency = options['frequency']
        self.stdout.write(f'Sending {frequency} notification digests...')

        result = NotificationService().send_digest_notifications(frequency=frequency)

        self.stdout.write(self.style.SUCCESS(
            f"Processed {result['total']} {frequency} digest(s): "
            f"{result['successful']} successful, {result['failed']} failed"
        ))
