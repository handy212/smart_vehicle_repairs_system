"""
Carry forward unused leave balances into the new year.

Usage:
    python manage.py carry_forward_leave_balances [--year 2027] [--dry-run]
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.hr.models import LeaveBalance, LeaveType


class Command(BaseCommand):
    help = 'Carry forward eligible leave balances from the prior year into a target year'

    def add_arguments(self, parser):
        parser.add_argument(
            '--year',
            type=int,
            default=None,
            help='Target year to create balances for (default: current year)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report changes without writing to the database',
        )

    def handle(self, *args, **options):
        target_year = options['year'] or timezone.now().year
        source_year = target_year - 1
        dry_run = options['dry_run']

        carry_types = LeaveType.objects.filter(is_active=True, carry_forward=True)
        if not carry_types.exists():
            self.stdout.write(self.style.WARNING('No active leave types with carry-forward enabled.'))
            return

        created = 0
        updated = 0

        with transaction.atomic():
            for leave_type in carry_types:
                prior_balances = LeaveBalance.objects.filter(
                    year=source_year,
                    leave_type=leave_type,
                ).select_related('employee')

                for prior in prior_balances:
                    remaining = prior.remaining_days
                    if remaining <= 0:
                        continue

                    carry_amount = Decimal(str(remaining))
                    if leave_type.max_carry_forward:
                        carry_amount = min(
                            carry_amount,
                            Decimal(str(leave_type.max_carry_forward)),
                        )

                    if carry_amount <= 0:
                        continue

                    if dry_run:
                        self.stdout.write(
                            f'  would carry {carry_amount} day(s) for '
                            f'{prior.employee.full_name} — {leave_type.name}'
                        )
                        created += 1
                        continue

                    balance, was_created = LeaveBalance.objects.get_or_create(
                        employee=prior.employee,
                        leave_type=leave_type,
                        year=target_year,
                        defaults={
                            'total_days': leave_type.days_allowed,
                            'carried_forward': carry_amount,
                        },
                    )
                    if was_created:
                        created += 1
                        self.stdout.write(self.style.SUCCESS(
                            f'  ✓ Created {target_year} balance for '
                            f'{prior.employee.full_name} — {leave_type.name} '
                            f'({carry_amount} carried forward)'
                        ))
                    elif balance.carried_forward < carry_amount:
                        balance.carried_forward = carry_amount
                        balance.save(update_fields=['carried_forward'])
                        updated += 1
                        self.stdout.write(self.style.SUCCESS(
                            f'  ✓ Updated carry-forward for '
                            f'{prior.employee.full_name} — {leave_type.name}'
                        ))

            if dry_run:
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS(
            f'\nDone. {created} balance(s) created, {updated} updated '
            f'for year {target_year} (source: {source_year}).'
        ))
