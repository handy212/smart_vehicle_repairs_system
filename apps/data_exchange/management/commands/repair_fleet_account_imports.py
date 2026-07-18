"""
Repair customers created by import with the "Fleet Account" user stub.

Sets user + primary contact names from Customer.company_name (already stored).

Usage:
  python manage.py repair_fleet_account_imports --dry-run
  python manage.py repair_fleet_account_imports
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.customers.contact_services import apply_business_contact_person_name, sync_primary_contact
from apps.customers.models import Customer
from apps.data_exchange.utils import split_person_name


class Command(BaseCommand):
    help = 'Replace Fleet Account stubs with company names on imported customers'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--limit', type=int, default=0)

    def handle(self, *args, **options):
        qs = (
            Customer.objects.filter(
                user__first_name='Fleet',
                user__last_name='Account',
            )
            .exclude(company_name='')
            .select_related('user')
            .order_by('id')
        )
        if options['limit']:
            qs = qs[: options['limit']]

        customers = list(qs)
        self.stdout.write(f'Candidates: {len(customers)}')
        if options['dry_run']:
            for customer in customers[:20]:
                first, last = split_person_name(customer.company_name)
                self.stdout.write(
                    f'  #{customer.id} {customer.company_name!r} → {first!r} {last!r}'
                )
            if len(customers) > 20:
                self.stdout.write(f'  … and {len(customers) - 20} more')
            self.stdout.write(self.style.WARNING('DRY RUN — no changes'))
            return

        updated = 0
        for customer in customers:
            first, last = split_person_name(customer.company_name)
            with transaction.atomic():
                user = customer.user
                user.first_name = first
                user.last_name = last
                user.save(update_fields=['first_name', 'last_name'])
                if customer.customer_type in {'business', 'fleet'}:
                    if not customer.contact_person_name or customer.contact_person_name == 'Fleet Account':
                        customer.contact_person_name = customer.company_name
                    apply_business_contact_person_name(
                        customer,
                        first_name=first,
                        last_name=last,
                        contact_person_name=customer.contact_person_name,
                    )
                    customer.save(update_fields=['contact_person_name'])
                    sync_primary_contact(customer)
            updated += 1
            if updated % 200 == 0:
                self.stdout.write(f'  … {updated}')

        self.stdout.write(self.style.SUCCESS(f'Repaired {updated} customers'))
