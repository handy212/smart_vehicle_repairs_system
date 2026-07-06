"""
Management command to process subscription renewals and expiration
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from datetime import timedelta
from apps.subscriptions.models import Subscription
from apps.subscriptions.services import SubscriptionService
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Process subscription renewals and mark expired subscriptions'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Run without making changes',
        )
        parser.add_argument(
            '--days-before-expiry',
            type=int,
            default=7,
            help='Days before expiry to send reminders (default: 7)',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        days_before = options['days_before_expiry']
        today = timezone.now().date()
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))
        
        # Mark expired subscriptions
        expired = Subscription.objects.filter(
            status='active',
            end_date__lt=today
        )
        
        expired_count = expired.count()
        if expired_count > 0:
            self.stdout.write(f'Found {expired_count} expired subscriptions')
            if not dry_run:
                expired.update(status='expired')
                self.stdout.write(self.style.SUCCESS(f'Marked {expired_count} subscriptions as expired'))
        
        # Process auto-renewals
        auto_renew_date = today + timedelta(days=days_before)
        auto_renew_subscriptions = Subscription.objects.filter(
            status='active',
            auto_renew=True,
            end_date__lte=auto_renew_date,
            end_date__gte=today
        )
        
        # Get system user for renewals
        from apps.accounts.models import User
        system_user = User.objects.filter(role__in=['admin', 'manager']).first()
        if not system_user:
            self.stdout.write(
                self.style.ERROR('No system user available for renewals. Skipping auto-renewals.')
            )
            return
        
        renewed_count = 0
        for subscription in auto_renew_subscriptions:
            try:
                if not dry_run:
                    with transaction.atomic():
                        subscription, invoice = SubscriptionService.renew_subscription(
                            subscription,
                            created_by=system_user
                        )
                        # Note: Invoice will need to be paid separately
                        self.stdout.write(
                            f'Renewed subscription {subscription.subscription_number}, '
                            f'invoice {invoice.id} created'
                        )
                else:
                    self.stdout.write(
                        f'Would renew subscription {subscription.subscription_number}'
                    )
                renewed_count += 1
            except Exception as e:
                logger.error(f'Failed to renew subscription {subscription.id}: {e}')
                self.stdout.write(
                    self.style.ERROR(f'Failed to renew subscription {subscription.subscription_number}: {e}')
                )
        
        if renewed_count > 0:
            self.stdout.write(
                self.style.SUCCESS(f'Processed {renewed_count} auto-renewals')
            )
        
        # Send expiration reminders
        reminder_date = today + timedelta(days=days_before)
        expiring_soon = Subscription.objects.filter(
            status='active',
            end_date__lte=reminder_date,
            end_date__gt=today
        )
        
        reminder_count = 0
        for subscription in expiring_soon:
            # Send notification
            if not dry_run:
                from apps.subscriptions.services import SubscriptionNotificationService
                days_until = (subscription.end_date - today).days
                SubscriptionNotificationService.send_expiration_reminder(subscription, days_until)
                self.stdout.write(
                    f'Sent expiration reminder for {subscription.subscription_number} ({days_until} days remaining)'
                )
            else:
                days_until = (subscription.end_date - today).days
                self.stdout.write(
                    f'Would send expiration reminder for {subscription.subscription_number} ({days_until} days remaining)'
                )
            reminder_count += 1
        
        if reminder_count > 0:
            self.stdout.write(f'Would send {reminder_count} expiration reminders')
        
        self.stdout.write(self.style.SUCCESS('Subscription processing complete'))

