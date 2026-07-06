"""
Management command to fix invalid inspections (approved/completed without results).
"""
from django.core.management.base import BaseCommand
from django.db.models import Count, Q
from apps.inspections.models import VehicleInspection


class Command(BaseCommand):
    help = 'Fix inspections that are completed/approved without any results'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be fixed without making changes',
        )
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Actually fix the inspections',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        fix = options['fix']

        if not dry_run and not fix:
            self.stdout.write(
                self.style.ERROR(
                    'You must specify either --dry-run or --fix'
                )
            )
            return

        # Find inspections that are completed/approved but have no results
        invalid_inspections = VehicleInspection.objects.filter(
            status__in=['completed', 'approved']
        ).annotate(
            result_count=Count('results')
        ).filter(result_count=0)

        # Also find inspections with only "not_checked" results
        invalid_inspections_with_unchecked = VehicleInspection.objects.filter(
            status__in=['completed', 'approved']
        ).annotate(
            checked_count=Count('results', filter=~Q(results__result='not_checked'))
        ).filter(checked_count=0).exclude(results__isnull=True)

        all_invalid = invalid_inspections | invalid_inspections_with_unchecked
        all_invalid = all_invalid.distinct()

        count = all_invalid.count()

        if count == 0:
            self.stdout.write(
                self.style.SUCCESS('No invalid inspections found!')
            )
            return

        self.stdout.write(
            self.style.WARNING(
                f'Found {count} invalid inspection(s):'
            )
        )

        for inspection in all_invalid:
            result_count = inspection.results.count()
            checked_count = inspection.results.exclude(result='not_checked').count()
            
            self.stdout.write(f'\n  Inspection #{inspection.inspection_number}:')
            self.stdout.write(f'    Status: {inspection.status}')
            self.stdout.write(f'    Overall Result: {inspection.overall_result}')
            self.stdout.write(f'    Total Results: {result_count}')
            self.stdout.write(f'    Checked Results: {checked_count}')
            self.stdout.write(f'    Progress: {inspection.completion_percentage}%')

            if fix:
                # Reset to in_progress and clear overall_result
                inspection.status = 'in_progress'
                inspection.overall_result = None
                inspection.completed_at = None
                inspection.approved_by = None
                inspection.save()
                self.stdout.write(
                    self.style.SUCCESS(f'    ✓ Fixed: Reset to "in_progress" status')
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f'    Would be reset to "in_progress" status')
                )

        if fix:
            self.stdout.write(
                self.style.SUCCESS(
                    f'\n✓ Fixed {count} inspection(s)'
                )
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    f'\nRun with --fix to apply these changes'
                )
            )

