"""Helpers for keeping business/fleet primary contacts in sync with customer records."""
from __future__ import annotations

from apps.customers.models import Customer, CustomerContact


def build_primary_contact_display_name(
    first_name: str,
    last_name: str,
    contact_person_name: str | None = None,
) -> str:
    display_name = (contact_person_name or "").strip()
    if display_name:
        return display_name
    return f"{first_name} {last_name}".strip()


def _primary_contact_payload(customer: Customer) -> dict | None:
    if customer.customer_type not in {"business", "fleet"}:
        return None

    user = customer.user
    first_name = (user.first_name or "").strip()
    last_name = (user.last_name or "").strip()
    company_name = (customer.company_name or "").strip()
    contact_person = (customer.contact_person_name or "").strip()

    # Legacy import stub — replace with company / contact person identity
    if first_name == "Fleet" and last_name == "Account":
        source = contact_person if contact_person and contact_person != "Fleet Account" else company_name
        if source:
            parts = source.split(None, 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else ""

    if not first_name and not last_name:
        display_name = contact_person or company_name
        if not display_name:
            return None
        parts = display_name.split(None, 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""

    return {
        "first_name": first_name or contact_person or company_name,
        "last_name": last_name,
        "email": (user.email or customer.company_email or "").strip(),
        "phone": (user.phone or customer.company_phone or customer.alternative_phone or "").strip(),
        "job_title": (customer.occupation or "").strip(),
        "is_primary": True,
    }


def sync_primary_contact(customer: Customer) -> CustomerContact | None:
    """
    Create or update the primary CustomerContact for business/fleet accounts.
    Returns the contact record, or None for individual accounts / missing names.
    """
    payload = _primary_contact_payload(customer)
    if payload is None:
        return None

    primary_contact = (
        customer.contacts.filter(is_primary=True).order_by("created_at").first()
    )
    if primary_contact is None:
        primary_contact = customer.contacts.order_by("created_at").first()

    if primary_contact is None:
        return CustomerContact.objects.create(customer=customer, **payload)

    for field, value in payload.items():
        setattr(primary_contact, field, value)
    primary_contact.save()
    return primary_contact


def ensure_primary_contact(customer: Customer) -> CustomerContact | None:
    """Create a primary contact when missing; otherwise sync existing details."""
    if customer.customer_type not in {"business", "fleet"}:
        return None

    has_primary = customer.contacts.filter(is_primary=True).exists()
    if not has_primary and not customer.contacts.exists():
        payload = _primary_contact_payload(customer)
        if payload is None:
            return None
        return CustomerContact.objects.create(customer=customer, **payload)

    return sync_primary_contact(customer)


def apply_business_contact_person_name(
    customer: Customer,
    *,
    first_name: str | None = None,
    last_name: str | None = None,
    contact_person_name: str | None = None,
) -> None:
    """Keep Customer.contact_person_name aligned with the linked user/contact."""
    if customer.customer_type not in {"business", "fleet"}:
        return

    resolved_first = (first_name if first_name is not None else customer.user.first_name) or ""
    resolved_last = (last_name if last_name is not None else customer.user.last_name) or ""
    resolved_display = (
        contact_person_name
        if contact_person_name is not None
        else customer.contact_person_name
    )
    customer.contact_person_name = build_primary_contact_display_name(
        resolved_first,
        resolved_last,
        resolved_display,
    )
