"""
Management command to send estimate expiration reminders.
Run this command via cron job (e.g., daily at 8 AM) to send reminders for estimates expiring soon.

Usage:
    python manage.py send_estimate_expiration_reminders [--days-before 7]
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from apps.billing.models import Estimate
from apps.notifications_app.triggers import notification_triggers


class Command(BaseCommand):
    help = 'Send reminders for estimates expiring soon'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days-before',
            type=int,
            default=7,
            help='Send reminders for estimates expiring within this many days (default: 7)'
        )
        parser.add_argument(
            '--also-expired',
            action='store_true',
            help='Also send notifications for already expired estimates'
        )

    def handle(self, *args, **options):
        days_before = options['days_before']
        also_expired = options['also_expired']
        today = timezone.now().date()
        expiration_threshold = today + timedelta(days=days_before)
        
        self.stdout.write(self.style.SUCCESS(
            f'Checking for estimates expiring within {days_before} days...'
        ))
        
        # Get estimates expiring soon (not yet expired, not approved/converted)
        expiring_soon = Estimate.objects.filter(
            status__in=['draft', 'sent', 'viewed'],
            valid_until__gte=today,
            valid_until__lte=expiration_threshold
        ).select_related(
            'customer',
            'vehicle',
            'work_order'
        )
        
        expired_count = 0
        if also_expired:
            # Get already expired estimates that haven't been marked as expired
            expired = Estimate.objects.filter(
                status__in=['draft', 'sent', 'viewed'],
                valid_until__lt=today
            ).select_related(
                'customer',
                'vehicle',
                'work_order'
            )
            
            for estimate in expired:
                try:
                    # Mark as expired if not already
                    if estimate.status != 'expired':
                        estimate.status = 'expired'
                        estimate.save()
                    
                    # Send expired notification
                    notification_triggers.estimate_expired(estimate)
                    expired_count += 1
                    self.stdout.write(self.style.SUCCESS(
                        f'  ✓ Sent expired notification for estimate {estimate.estimate_number} to {estimate.customer}'
                    ))
                except Exception as e:
                    self.stdout.write(self.style.ERROR(
                        f'  ✗ Failed to send expired notification for estimate {estimate.estimate_number}: {e}'
                    ))
        
        expiring_count = 0
        for estimate in expiring_soon:
            try:
                # Calculate days until expiration
                days_until = (estimate.valid_until - today).days
                
                # Send expiring soon notification
                notification_triggers.estimate_expiring_soon(estimate, days_until)
                expiring_count += 1
                self.stdout.write(self.style.SUCCESS(
                    f'  ✓ Sent expiring reminder for estimate {estimate.estimate_number} ({days_until} days) to {estimate.customer}'
                ))
            except Exception as e:
                self.stdout.write(self.style.ERROR(
                    f'  ✗ Failed to send reminder for estimate {estimate.estimate_number}: {e}'
                ))
        
        total_count = expiring_count + expired_count
        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Successfully sent {total_count} estimate reminders ({expiring_count} expiring soon, {expired_count} expired)'
        ))

