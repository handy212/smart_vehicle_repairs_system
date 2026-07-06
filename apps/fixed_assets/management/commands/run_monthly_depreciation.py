"""
Management command to run monthly depreciation for all active assets
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import date
from dateutil.relativedelta import relativedelta
from apps.fixed_assets.depreciation_service import DepreciationService
from apps.branches.models import Branch


class Command(BaseCommand):
    help = 'Run monthly depreciation for all active fixed assets'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--month',
            type=int,
            help='Month to depreciate (1-12), defaults to previous month'
        )
        parser.add_argument(
            '--year',
            type=int,
            help='Year to depreciate, defaults to current year'
        )
        parser.add_argument(
            '--branch',
            type=int,
            help='Branch ID to filter (optional, defaults to all branches)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Calculate depreciation without posting to GL'
        )
        parser.add_argument(
            '--no-gl-posting',
            action='store_true',
            help='Post depreciation but do not create GL entries'
        )
    
    def handle(self, *args, **options):
        # Get parameters
        target_month = options.get('month')
        target_year = options.get('year')
        branch_id = options.get('branch')
        dry_run = options.get('dry_run', False)
        post_to_gl = not options.get('no_gl_posting', False)
        
        # Default to previous month if not specified
        if target_month is None or target_year is None:
            today = date.today()
            last_month = today.replace(day=1) - relativedelta(days=1)
            target_month = target_month or last_month.month
            target_year = target_year or last_month.year
        
        # Validate month
        if not 1 <= target_month <= 12:
            self.stdout.write(self.style.ERROR('Invalid month. Must be between 1 and 12.'))
            return
        
        # Get branch if specified
        branch = None
        if branch_id:
            try:
                branch = Branch.objects.get(id=branch_id)
                self.stdout.write(self.style.SUCCESS(f'Filtering for branch: {branch.name}'))
            except Branch.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'Branch with ID {branch_id} not found'))
                return
        
        # Inform about dry-run mode
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE: No changes will be made'))
            post_to_gl = False
        
        # Display configuration
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write(self.style.SUCCESS('Running Monthly Depreciation'))
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write(f'Period: {target_year}-{target_month:02d}')
        self.stdout.write(f'Post to GL: {"No" if dry_run else ("Yes" if post_to_gl else "No (depreciation only)")}')
        if branch:
            self.stdout.write(f'Branch: {branch.name}')
        else:
            self.stdout.write('Branch: All branches')
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write('')
        
        # Run depreciation
        try:
            summary = DepreciationService.run_monthly_depreciation(
                target_month=target_month,
                target_year=target_year,
                branch=branch,
                post_to_gl=post_to_gl and not dry_run
            )
            
            # Display results
            self.stdout.write(self.style.SUCCESS('\nDepreciation Summary:'))
            self.stdout.write(self.style.SUCCESS('-' * 70))
            self.stdout.write(f'Period: {summary["period_start"]} to {summary["period_end"]}')
            self.stdout.write(f'Total Days: {summary["period"]["days"] if "period" in summary else "N/A"}')
            self.stdout.write('')
            self.stdout.write(f'Assets Processed: {summary["assets_processed"]}')
            self.stdout.write(f'Assets Skipped: {summary["assets_skipped"]}')
            self.stdout.write(self.style.SUCCESS(f'Total Depreciation: ${summary["total_depreciation"]:,.2f}'))
            
            # Display errors if any
            if summary.get('errors'):
                self.stdout.write('')
                self.stdout.write(self.style.ERROR('Errors encountered:'))
                for error in summary['errors']:
                    self.stdout.write(self.style.ERROR(
                        f'  - Asset {error["asset"]}: {error["error"]}'
                    ))
            
            self.stdout.write(self.style.SUCCESS('-' * 70))
            
            # Final message
            if dry_run:
                self.stdout.write(self.style.WARNING('\nDRY RUN: No changes were made'))
            else:
                if post_to_gl:
                    self.stdout.write(self.style.SUCCESS(
                        f'\n✓ Successfully depreciated {summary["assets_processed"]} assets and posted to GL'
                    ))
                else:
                    self.stdout.write(self.style.SUCCESS(
                        f'\n✓ Successfully depreciated {summary["assets_processed"]} assets (GL posting skipped)'
                    ))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\n✗ Error running depreciation: {e}'))
            import traceback
            traceback.print_exc()
            return
        
        self.stdout.write('')
