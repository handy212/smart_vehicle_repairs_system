"""
Management command to sync diagnostic codes from external APIs
Part of the Hybrid System implementation
"""
from django.core.management.base import BaseCommand
from django.db.models import Count
from apps.diagnosis.services.external_code_api import CodeSyncService, ExternalCodeAPIService
from apps.diagnosis.models import DiagnosticCodeLibrary


class Command(BaseCommand):
    help = 'Sync diagnostic codes from external APIs to local database (Hybrid System)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit',
            type=int,
            default=100,
            help='Number of popular codes to sync (default: 100)'
        )
        parser.add_argument(
            '--code',
            type=str,
            help='Sync a specific code (e.g., P0305)'
        )
        parser.add_argument(
            '--code-type',
            type=str,
            default='obd_ii',
            help='Code type for specific code sync (default: obd_ii)'
        )
        parser.add_argument(
            '--stats',
            action='store_true',
            help='Show statistics about local code library'
        )

    def handle(self, *args, **options):
        if options['stats']:
            self.show_stats()
            return
        
        if options['code']:
            # Sync specific code
            self.stdout.write(self.style.SUCCESS(f'Syncing code {options["code"]}...'))
            external_result = ExternalCodeAPIService.lookup_external(
                options['code'],
                options['code_type'],
                use_cache=False
            )
            
            if external_result:
                saved_code = CodeSyncService.save_external_code_to_local(external_result)
                if saved_code:
                    self.stdout.write(
                        self.style.SUCCESS(f'✅ Successfully synced {options["code"]} to local database')
                    )
                else:
                    self.stdout.write(
                        self.style.ERROR(f'❌ Failed to save {options["code"]} to local database')
                    )
            else:
                self.stdout.write(
                    self.style.WARNING(f'⚠️  Code {options["code"]} not found in external APIs')
                )
        else:
            # Sync popular codes
            limit = options['limit']
            self.stdout.write(
                self.style.SUCCESS(f'🔄 Starting sync of {limit} popular codes from external APIs...')
            )
            
            stats = CodeSyncService.sync_popular_codes(limit=limit)
            
            self.stdout.write(self.style.SUCCESS('\n✅ Sync completed!'))
            self.stdout.write(self.style.SUCCESS(f'   📥 Fetched: {stats["fetched"]} codes'))
            self.stdout.write(self.style.SUCCESS(f'   ✨ Created: {stats["created"]} new codes'))
            self.stdout.write(self.style.SUCCESS(f'   🔄 Updated: {stats["updated"]} existing codes'))
            self.stdout.write(
                self.style.WARNING(f'   ❌ Failed: {stats["failed"]} codes') if stats["failed"] > 0 
                else self.style.SUCCESS(f'   ❌ Failed: {stats["failed"]} codes')
            )
            
            total = DiagnosticCodeLibrary.objects.count()
            self.stdout.write(self.style.SUCCESS(f'\n📊 Total codes in local database: {total}'))
    
    def show_stats(self):
        """Show statistics about the local code library"""
        total = DiagnosticCodeLibrary.objects.count()
        by_type = DiagnosticCodeLibrary.objects.values('code_type').annotate(
            count=models.Count('id')
        )
        
        self.stdout.write(self.style.SUCCESS('\n📊 Code Library Statistics'))
        self.stdout.write(self.style.SUCCESS('=' * 50))
        self.stdout.write(self.style.SUCCESS(f'Total codes: {total}'))
        self.stdout.write(self.style.SUCCESS('\nBy type:'))
        
        for item in by_type:
            self.stdout.write(f"  {item['code_type']}: {item['count']}")
        
        # Most used codes
        most_used = DiagnosticCodeLibrary.objects.order_by('-use_count')[:10]
        if most_used:
            self.stdout.write(self.style.SUCCESS('\nMost used codes:'))
            for code in most_used:
                self.stdout.write(f"  {code.code_number}: {code.use_count} lookups")

