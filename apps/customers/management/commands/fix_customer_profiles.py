"""
Management command to fix missing Customer profiles
Creates Customer records for all users with role='customer' but no customer_profile
"""
from django.core.management.base import BaseCommand
from apps.accounts.models import User
from apps.customers.models import Customer


class Command(BaseCommand):
    help = 'Create missing Customer profiles for users with role=customer'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be fixed without making changes',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        # Find all customer users
        customer_users = User.objects.filter(role='customer')
        total_customers = customer_users.count()
        
        self.stdout.write(f'Found {total_customers} users with role="customer"')
        
        # Find users without profiles
        users_without_profile = []
        for user in customer_users:
            if not hasattr(user, 'customer_profile'):
                users_without_profile.append(user)
        
        if not users_without_profile:
            self.stdout.write(self.style.SUCCESS('✓ All customer users already have profiles!'))
            return
        
        self.stdout.write(
            self.style.WARNING(
                f'Found {len(users_without_profile)} customer users WITHOUT profiles:'
            )
        )
        
        # Show affected users
        for user in users_without_profile:
            self.stdout.write(f'  - {user.email} (ID: {user.id})')
        
        if dry_run:
            self.stdout.write(
                self.style.WARNING('\n--dry-run mode: No changes made')
            )
            return
        
        # Create missing profiles
        fixed_count = 0
        for user in users_without_profile:
            try:
                customer = Customer.objects.create(
                    user=user,
                    customer_type='individual',  # Default for existing users
                )
                self.stdout.write(
                    self.style.SUCCESS(
                        f'✓ Created Customer profile for {user.email} (ID: {customer.id})'
                    )
                )
                fixed_count += 1
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(
                        f'✗ Failed to create profile for {user.email}: {str(e)}'
                    )
                )
        
        # Summary
        self.stdout.write('')
        self.stdout.write(
            self.style.SUCCESS(
                f'✓ Successfully fixed {fixed_count}/{len(users_without_profile)} customer users'
            )
        )
        
        # Verify
        remaining = 0
        for user in customer_users:
            if not hasattr(user, 'customer_profile'):
                remaining += 1
        
        if remaining == 0:
            self.stdout.write(
                self.style.SUCCESS('✓ All customer users now have profiles!')
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    f'⚠ {remaining} customer users still missing profiles'
                )
            )
