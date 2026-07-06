"""
Seed workflow profiles and job types.

Usage:
    python manage.py seed_job_types
    python manage.py seed_job_types --overwrite
    python manage.py seed_job_types --backfill-work-orders
"""

from django.core.management.base import BaseCommand

from apps.workorders.job_type_seed import (
    backfill_work_order_job_types,
    seed_workflow_profiles_and_job_types,
)


class Command(BaseCommand):
    help = 'Seed workflow profiles and work order job types'

    def add_arguments(self, parser):
        parser.add_argument(
            '--overwrite',
            action='store_true',
            help='Update existing predefined profiles and job types',
        )
        parser.add_argument(
            '--backfill-work-orders',
            action='store_true',
            help='Assign job_type on work orders that only have legacy maintenance_type',
        )

    def handle(self, *args, **options):
        result = seed_workflow_profiles_and_job_types(overwrite=options['overwrite'])
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {result['profiles']} workflow profiles; "
                f"created {result['job_types_created']} job types "
                f"(updated {result['job_types_updated']})."
            )
        )

        if options['backfill_work_orders']:
            count = backfill_work_order_job_types()
            self.stdout.write(self.style.SUCCESS(f'Backfilled job_type on {count} work order(s).'))
