"""
Wipe customers, vehicles, and related operational records.

Usage:
  python manage.py wipe_customers_vehicles --dry-run
  python manage.py wipe_customers_vehicles --confirm "DELETE CUSTOMERS"
"""
from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.data_exchange.cleanup import (
    CONFIRM_PHRASE,
    preview_customer_vehicle_wipe,
    run_customer_vehicle_wipe,
)


class Command(BaseCommand):
    help = (
        'Delete all customers, vehicles, and related ops data '
        '(work orders, invoices, payments, appointments, etc.). '
        'Keeps staff, branches, inventory catalog, and settings.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show counts only; do not delete anything.',
        )
        parser.add_argument(
            '--confirm',
            type=str,
            default='',
            help=f'Required phrase to execute wipe: "{CONFIRM_PHRASE}"',
        )
        parser.add_argument(
            '--keep-import-batches',
            action='store_true',
            help='Do not clear ImportBatch history.',
        )

    def handle(self, *args, **options):
        if options['dry_run']:
            preview = preview_customer_vehicle_wipe()
            self.stdout.write(self.style.WARNING('DRY RUN — nothing deleted'))
            self.stdout.write(f'Confirm phrase: {preview["confirm_phrase"]}')
            self.stdout.write('Counts:')
            for key, value in sorted(preview['counts'].items()):
                self.stdout.write(f'  {key}: {value}')
            self.stdout.write('Will delete: ' + ', '.join(preview['deletes']))
            self.stdout.write('Will keep: ' + ', '.join(preview['keeps']))
            return

        confirm = options['confirm']
        if confirm.strip() != CONFIRM_PHRASE:
            raise CommandError(
                f'Must pass --confirm "{CONFIRM_PHRASE}" (or use --dry-run first).'
            )

        try:
            result = run_customer_vehicle_wipe(
                confirm=confirm,
                clear_import_batches=not options['keep_import_batches'],
            )
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(self.style.SUCCESS('Wipe completed'))
        self.stdout.write('Deleted:')
        for key, value in sorted(result['deleted'].items()):
            self.stdout.write(f'  {key}: {value}')
        self.stdout.write('Remaining:')
        for key, value in sorted(result['after'].items()):
            self.stdout.write(f'  {key}: {value}')
        if not result.get('ok'):
            self.stdout.write(self.style.WARNING(
                'Wipe finished but some customers/vehicles remain — check blockers.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                'Customers and vehicles cleared. Ready for re-import.'
            ))
