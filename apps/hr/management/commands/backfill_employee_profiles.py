"""
Management command to backfill EmployeeProfile for existing users.

Usage:
    python3 manage.py backfill_employee_profiles
    python3 manage.py backfill_employee_profiles --dry-run
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Create EmployeeProfile for existing non-customer users who lack one.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be created without making changes.',
        )

    def handle(self, *args, **options):
        from apps.hr.models import EmployeeProfile

        dry_run = options['dry_run']

        # Find non-customer users without an EmployeeProfile
        users_without_profile = User.objects.exclude(
            role='customer'
        ).exclude(
            employee_profile__isnull=False
        )

        count = users_without_profile.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS(
                'All non-customer users already have an EmployeeProfile. Nothing to do.'
            ))
            return

        self.stdout.write(f'Found {count} user(s) without an EmployeeProfile:')
        for user in users_without_profile:
            self.stdout.write(f'  - {user.username} (role={user.role}, id={user.id})')

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'DRY RUN: Would create {count} EmployeeProfile(s). No changes made.'
            ))
            return

        created = 0
        for user in users_without_profile:
            EmployeeProfile.objects.create(
                user=user,
                start_date=getattr(user, 'hire_date', None),
            )
            created += 1

        self.stdout.write(self.style.SUCCESS(
            f'Successfully created {created} EmployeeProfile(s).'
        ))
