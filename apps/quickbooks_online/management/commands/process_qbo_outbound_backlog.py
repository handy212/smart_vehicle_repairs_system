"""Process failed/pending QBO outbound mappings inline in dependency order."""
from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.quickbooks_online.bulk_outbound_sync import collect_outbound_sync_candidates
from apps.quickbooks_online.models import QBOMapping
from apps.quickbooks_online.outbound_log import run_outbound_entity_sync
from apps.quickbooks_online.services import QuickBooksService


class Command(BaseCommand):
    help = (
        'Clear stale pending mappings and process outbound QuickBooks sync backlog inline '
        '(suppliers before bills before payments). Use when Celery queue is backed up.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--stale-minutes',
            type=int,
            default=5,
            help='Mark pending mappings older than N minutes (no qbo_id) as failed before processing.',
        )
        parser.add_argument(
            '--entity-types',
            type=str,
            default='',
            help='Comma-separated entity types to process (default: all eligible).',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=100,
            help='Maximum mappings to process in this run.',
        )
        parser.add_argument(
            '--skip-stale-cleanup',
            action='store_true',
            help='Do not mark stale pending rows as failed first.',
        )
        parser.add_argument(
            '--statuses',
            type=str,
            default='failed,pending',
            help='Comma-separated mapping statuses to include (default: failed,pending).',
        )

    def handle(self, *args, **options):
        if not QuickBooksService.is_connected():
            self.stdout.write(self.style.ERROR('QuickBooks is not connected. Reconnect under Admin → Integrations.'))
            return

        if QuickBooksService.get_client() is None:
            self.stdout.write(self.style.ERROR('QuickBooks OAuth session is unavailable. Reconnect to refresh the token.'))
            return

        stale_minutes = options['stale_minutes']
        if not options['skip_stale_cleanup'] and stale_minutes > 0:
            cutoff = timezone.now() - timedelta(minutes=stale_minutes)
            stale_count = QBOMapping.objects.filter(
                status='pending',
                qbo_id='',
                last_synced_at__lt=cutoff,
            ).update(
                status='failed',
                error_message=(
                    'Sync did not complete (stale pending). Retrying via process_qbo_outbound_backlog.'
                ),
            )
            if stale_count:
                self.stdout.write(self.style.WARNING(f'Marked {stale_count} stale pending mapping(s) as failed.'))

        statuses = tuple(s.strip() for s in options['statuses'].split(',') if s.strip())
        entity_types = None
        if options['entity_types'].strip():
            entity_types = tuple(t.strip() for t in options['entity_types'].split(',') if t.strip())

        candidates, skipped = collect_outbound_sync_candidates(
            statuses=statuses,
            entity_types=entity_types,
            limit=options['limit'],
        )

        self.stdout.write(f'Processing {len(candidates)} eligible mapping(s) inline…')
        if skipped:
            self.stdout.write(self.style.WARNING(f'Skipped {len(skipped)} ineligible mapping(s).'))

        synced = failed = 0
        for entity_type, object_id, cfg in candidates:
            result = run_outbound_entity_sync(
                entity_type,
                object_id,
                cfg['app_label'],
                cfg['model_name'],
                cfg['service_method'],
            )
            mapping = QBOMapping.objects.filter(
                content_type__app_label=cfg['app_label'],
                content_type__model=cfg['model_name'].lower(),
                object_id=object_id,
            ).first()
            status = mapping.status if mapping else 'unknown'
            err = (mapping.error_message or '')[:120] if mapping else ''
            if result or status == 'synced':
                synced += 1
                self.stdout.write(self.style.SUCCESS(f'  synced  {entity_type} {object_id}'))
            else:
                failed += 1
                self.stdout.write(self.style.ERROR(f'  failed  {entity_type} {object_id}: {err or "no result"}'))

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(f'Done: {synced} synced, {failed} failed, {len(skipped)} skipped.'))
