"""Queue never-synced SVR records for QuickBooks outbound push."""

from django.core.management.base import BaseCommand

from apps.quickbooks_online.bulk_outbound_sync import (
    collect_never_synced_candidates,
    count_never_synced,
    queue_outbound_sync_candidates,
)
from apps.quickbooks_online.outbound_entities import OUTBOUND_SYNC_ENTITIES


class Command(BaseCommand):
    help = (
        'Queue eligible records that have never been pushed to QuickBooks '
        '(no QBOMapping row). Use for bulk customers after connecting QBO.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--entity',
            action='append',
            dest='entities',
            choices=sorted(OUTBOUND_SYNC_ENTITIES.keys()),
            help='Entity type to queue (repeatable). Default: customer.',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Max records to queue (default: all matching).',
        )
        parser.add_argument(
            '--stagger',
            type=float,
            default=0.0,
            help='Seconds between Celery countdown steps (0 = queue immediately; worker rate-limits naturally).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Only print counts; do not queue.',
        )

    def handle(self, *args, **options):
        entities = options['entities'] or ['customer']
        limit = options['limit']
        stagger = max(0.0, float(options['stagger']))
        dry_run = options['dry_run']

        counts = count_never_synced(entity_types=entities)
        self.stdout.write(f'Never-synced (approx eligible): {counts}')

        candidates, skipped = collect_never_synced_candidates(
            entity_types=entities,
            limit=limit,
        )
        self.stdout.write(
            f'Will queue {len(candidates)} (skipped ineligible while scanning: {len(skipped)})'
        )
        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run — nothing queued.'))
            return

        queued = queue_outbound_sync_candidates(
            candidates,
            stagger_seconds=stagger,
        )
        self.stdout.write(self.style.SUCCESS(
            f'Queued {queued} outbound sync(s) on the qbo Celery lane '
            f'(stagger={stagger}s). Monitor svr_celery_heavy.'
        ))
