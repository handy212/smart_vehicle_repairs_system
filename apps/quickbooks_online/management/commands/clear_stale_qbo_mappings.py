"""Clear stale QuickBooks entity mappings so sync can re-match or create in QBO."""
from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand

from apps.quickbooks_online.models import QBOMapping
from apps.quickbooks_online.services import QuickBooksService


class Command(BaseCommand):
    help = (
        'Clear failed or orphaned QBOMapping rows so outbound sync can re-link or create '
        'records in QuickBooks (use after company change, sandbox reset, or bulk QBO deletes).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--failed-only',
            action='store_true',
            help='Only clear mappings with status=failed (default: all mappings).',
        )
        parser.add_argument(
            '--delete',
            action='store_true',
            help='Delete mapping rows instead of clearing qbo_id.',
        )

        parser.add_argument(
            '--stale-pending-minutes',
            type=int,
            default=None,
            metavar='MINUTES',
            help=(
                'Mark pending mappings older than MINUTES (no qbo_id) as failed so they can be '
                'retried. Does not clear qbo_id on synced rows.'
            ),
        )

    def handle(self, *args, **options):
        stale_minutes = options.get('stale_pending_minutes')
        if stale_minutes is not None and stale_minutes > 0:
            from django.utils import timezone
            from datetime import timedelta

            cutoff = timezone.now() - timedelta(minutes=stale_minutes)
            stale_qs = QBOMapping.objects.filter(
                status='pending',
                qbo_id='',
                last_synced_at__lt=cutoff,
            )
            stale_count = stale_qs.update(
                status='failed',
                error_message=(
                    'Sync did not complete (stale pending). Use Push to retry or clear the mapping.'
                ),
            )
            self.stdout.write(
                self.style.WARNING(f'Marked {stale_count} stale pending mapping(s) as failed.')
            )

        qs = QBOMapping.objects.all()
        if options['failed_only']:
            qs = qs.filter(status='failed')

        if options['delete']:
            count, _ = qs.delete()
            self.stdout.write(self.style.SUCCESS(f'Deleted {count} QBO mapping row(s).'))
            return

        updated = qs.update(
            qbo_id='',
            qbo_sync_token='',
            status='pending',
            error_message='',
        )
        self.stdout.write(self.style.SUCCESS(f'Cleared {updated} QBO mapping row(s).'))

        if not QuickBooksService.is_connected():
            self.stdout.write(
                self.style.WARNING('QuickBooks is not connected — reconnect before syncing.')
            )
