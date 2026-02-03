"""
Management command to initialize predefined service types.

Usage:
    python manage.py init_service_types
"""
from django.core.management.base import BaseCommand
from apps.vehicles.models import ServiceType
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Initialize predefined service types'

    def add_arguments(self, parser):
        parser.add_argument(
            '--overwrite',
            action='store_true',
            help='Overwrite existing predefined service types'
        )

    def handle(self, *args, **options):
        overwrite = options['overwrite']
        
        # Get or create a system user for predefined types
        system_user = None
        try:
            # Try to get a superuser
            system_user = User.objects.filter(is_superuser=True).first()
        except:
            pass
        
        # Predefined service types with default intervals
        service_types = [
            {
                'name': 'Oil Change',
                'description': 'Regular engine oil and filter change',
                'default_interval_months': 3,
                'default_interval_miles': 5000,
            },
            {
                'name': 'Tire Rotation',
                'description': 'Rotate tires to ensure even wear',
                'default_interval_months': 6,
                'default_interval_miles': 10000,
            },
            {
                'name': 'Brake Service',
                'description': 'Brake inspection and service',
                'default_interval_months': 12,
                'default_interval_miles': 20000,
            },
            {
                'name': 'Air Filter Replacement',
                'description': 'Replace engine air filter',
                'default_interval_months': 12,
                'default_interval_miles': 15000,
            },
            {
                'name': 'Cabin Air Filter Replacement',
                'description': 'Replace cabin air filter',
                'default_interval_months': 12,
                'default_interval_miles': 15000,
            },
            {
                'name': 'Transmission Service',
                'description': 'Transmission fluid change and service',
                'default_interval_months': 24,
                'default_interval_miles': 30000,
            },
            {
                'name': 'Coolant Flush',
                'description': 'Coolant system flush and refill',
                'default_interval_months': 24,
                'default_interval_miles': 30000,
            },
            {
                'name': 'Spark Plug Replacement',
                'description': 'Replace spark plugs',
                'default_interval_months': 36,
                'default_interval_miles': 60000,
            },
            {
                'name': 'Timing Belt Replacement',
                'description': 'Replace timing belt',
                'default_interval_months': 60,
                'default_interval_miles': 100000,
            },
            {
                'name': 'Battery Check',
                'description': 'Battery health check and testing',
                'default_interval_months': 6,
                'default_interval_miles': None,
            },
            {
                'name': 'Wheel Alignment',
                'description': 'Wheel alignment service',
                'default_interval_months': 12,
                'default_interval_miles': 15000,
            },
            {
                'name': 'Belt and Hose Inspection',
                'description': 'Inspect and replace belts and hoses as needed',
                'default_interval_months': 12,
                'default_interval_miles': 20000,
            },
        ]
        
        created_count = 0
        updated_count = 0
        skipped_count = 0
        
        for service_data in service_types:
            name = service_data['name']
            
            # Check if service type already exists
            existing = ServiceType.objects.filter(name=name, is_predefined=True).first()
            
            if existing:
                if overwrite:
                    # Update existing
                    for key, value in service_data.items():
                        setattr(existing, key, value)
                    existing.is_predefined = True
                    existing.is_active = True
                    if system_user:
                        existing.created_by = system_user
                    existing.save()
                    updated_count += 1
                    self.stdout.write(self.style.SUCCESS(f'  ✓ Updated: {name}'))
                else:
                    skipped_count += 1
                    self.stdout.write(self.style.WARNING(f'  ⊘ Skipped (exists): {name}'))
            else:
                # Create new
                ServiceType.objects.create(
                    name=name,
                    description=service_data['description'],
                    default_interval_months=service_data['default_interval_months'],
                    default_interval_miles=service_data['default_interval_miles'],
                    is_predefined=True,
                    is_active=True,
                    created_by=system_user
                )
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'  ✓ Created: {name}'))
        
        summary = f'\n✓ Created {created_count} service types'
        if updated_count > 0:
            summary += f', updated {updated_count}'
        if skipped_count > 0:
            summary += f', skipped {skipped_count} (already exist)'
        
        self.stdout.write(self.style.SUCCESS(summary))
