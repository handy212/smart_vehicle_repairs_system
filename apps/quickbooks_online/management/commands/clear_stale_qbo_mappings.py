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

    def handle(self, *args, **options):
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
