"""
Seed default leave types for the HR module.
"""
from django.core.management.base import BaseCommand
from apps.hr.models import LeaveType
from apps.accounts.management.commands._auditlog_utils import disable_auditlog


DEFAULT_LEAVE_TYPES = [
    {
        'name': 'Annual Leave',
        'description': 'Standard annual vacation leave entitlement.',
        'days_allowed': 21,
        'is_paid': True,
        'carry_forward': True,
        'max_carry_forward': 5,
        'requires_document': False,
    },
    {
        'name': 'Sick Leave',
        'description': 'Leave due to illness or medical appointments.',
        'days_allowed': 10,
        'is_paid': True,
        'carry_forward': False,
        'max_carry_forward': 0,
        'requires_document': True,
    },
    {
        'name': 'Maternity Leave',
        'description': 'Leave for expectant and new mothers.',
        'days_allowed': 90,
        'is_paid': True,
        'carry_forward': False,
        'max_carry_forward': 0,
        'requires_document': True,
    },
    {
        'name': 'Paternity Leave',
        'description': 'Leave for new fathers after the birth of a child.',
        'days_allowed': 10,
        'is_paid': True,
        'carry_forward': False,
        'max_carry_forward': 0,
        'requires_document': True,
    },
    {
        'name': 'Compassionate Leave',
        'description': 'Leave granted for bereavement or family emergencies.',
        'days_allowed': 5,
        'is_paid': True,
        'carry_forward': False,
        'max_carry_forward': 0,
        'requires_document': False,
    },
    {
        'name': 'Study Leave',
        'description': 'Leave for examinations, training, or educational purposes.',
        'days_allowed': 10,
        'is_paid': True,
        'carry_forward': False,
        'max_carry_forward': 0,
        'requires_document': True,
    },
    {
        'name': 'Unpaid Leave',
        'description': 'Leave without pay, granted at management discretion.',
        'days_allowed': 30,
        'is_paid': False,
        'carry_forward': False,
        'max_carry_forward': 0,
        'requires_document': False,
    },
    {
        'name': 'Public Holiday',
        'description': 'Government-declared public holidays.',
        'days_allowed': 0,
        'is_paid': True,
        'carry_forward': False,
        'max_carry_forward': 0,
        'requires_document': False,
    },
]


class Command(BaseCommand):
    help = 'Seed default leave types for HR module'

    def handle(self, *args, **options):
        with disable_auditlog():
            self._do_seed()

    def _do_seed(self):
        created_count = 0
        updated_count = 0

        for lt_data in DEFAULT_LEAVE_TYPES:
            obj, created = LeaveType.objects.update_or_create(
                name=lt_data['name'],
                defaults=lt_data,
            )
            if created:
                self.stdout.write(f'  ✅ Created: {obj.name}')
                created_count += 1
            else:
                self.stdout.write(f'  ♻️  Updated: {obj.name}')
                updated_count += 1

        self.stdout.write(self.style.SUCCESS(
            f'\\nDone! {created_count} created, {updated_count} updated.'
        ))
