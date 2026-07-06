"""Backfill primary CustomerContact rows for business and fleet accounts."""
from django.core.management.base import BaseCommand
from django.db.models import Count, Q

from apps.customers.contact_services import (
    apply_business_contact_person_name,
    ensure_primary_contact,
)
from apps.customers.models import Customer


class Command(BaseCommand):
    help = (
        "Create or refresh primary contact records for existing business and fleet customers."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would change without writing to the database.",
        )
        parser.add_argument(
            "--customer-id",
            type=int,
            help="Only process a single customer ID.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        customer_id = options.get("customer_id")

        queryset = Customer.objects.filter(
            customer_type__in=["business", "fleet"],
        ).select_related("user").annotate(
            contact_count=Count("contacts"),
            primary_contact_count=Count(
                "contacts",
                filter=Q(contacts__is_primary=True),
            ),
        )

        if customer_id:
            queryset = queryset.filter(pk=customer_id)

        total = queryset.count()
        if total == 0:
            self.stdout.write(self.style.WARNING("No matching business/fleet customers found."))
            return

        created = 0
        updated = 0
        skipped = 0

        for customer in queryset.order_by("id"):
            had_primary = customer.primary_contact_count > 0
            had_any_contact = customer.contact_count > 0

            if dry_run:
                if customer.primary_contact_count == 0:
                    action = "create primary contact"
                    created += 1
                else:
                    action = "sync primary contact"
                    updated += 1
                self.stdout.write(
                    f"[dry-run] {customer.customer_number} ({customer.company_name or customer.user.email}): {action}"
                )
                continue

            apply_business_contact_person_name(customer)
            if customer.contact_person_name:
                customer.save(update_fields=["contact_person_name", "updated_at"])

            contact = ensure_primary_contact(customer)
            if contact is None:
                skipped += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"Skipped {customer.customer_number}: no usable primary contact name/email."
                    )
                )
                continue

            if not had_any_contact:
                created += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Created primary contact for {customer.customer_number} -> {contact.first_name} {contact.last_name}".strip()
                    )
                )
            elif not had_primary:
                created += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Promoted primary contact for {customer.customer_number} -> {contact.first_name} {contact.last_name}".strip()
                    )
                )
            else:
                updated += 1
                self.stdout.write(
                    f"Synced primary contact for {customer.customer_number} -> {contact.first_name} {contact.last_name}".strip()
                )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Processed {total} business/fleet customer(s): "
                f"{created} created, {updated} synced, {skipped} skipped"
                + (" (dry-run)" if dry_run else "")
            )
        )
