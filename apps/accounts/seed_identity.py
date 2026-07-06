"""Internal identity helpers for seeded (sample) workshop data.

User-visible records must not contain the word "demo". Purge/identify seeded rows via
the seed email domain, branch code, and internal tags — not visible copy.
"""
from __future__ import annotations

import re

SEED_MARKER = "[SVR_SEED]"
SEED_EMAIL_DOMAIN = "seed.aapgh.com"
SEED_BRANCH_CODE = "NRAS"
SEED_PASSWORD = "Welcome2026!"
SEED_TAG = "svr_seed"

# Backward compatibility for existing imports/tests
DEMO_MARKER = SEED_MARKER
DEMO_PREFIX = "SVR"
DEMO_EMAIL_DOMAIN = SEED_EMAIL_DOMAIN


def seed_email(local_part: str) -> str:
    return f"{local_part}@{SEED_EMAIL_DOMAIN}"


def username_from_name(first_name: str, last_name: str, *, suffix: str = "") -> str:
    base = f"{first_name}.{last_name}".lower().replace(" ", "")
    return f"{base}{suffix}" if suffix else base


def seed_staff_email(role: str, staff_names: dict[str, tuple[str, str]]) -> str:
    first, last = staff_names[role]
    return seed_email(username_from_name(first, last))


def seed_person_email(first_name: str, last_name: str, index: int) -> str:
    return seed_email(f"{username_from_name(first_name, last_name)}+{index:03d}")


def seed_users_qs():
    from apps.accounts.models import User

    return User.objects.filter(email__iendswith=f"@{SEED_EMAIL_DOMAIN}")


def seed_customers_qs():
    from apps.customers.models import Customer

    return Customer.objects.filter(user__email__iendswith=f"@{SEED_EMAIL_DOMAIN}")


def seed_vehicles_qs():
    from apps.vehicles.models import Vehicle

    return Vehicle.objects.filter(owner__user__email__iendswith=f"@{SEED_EMAIL_DOMAIN}")


def seed_workorders_qs():
    from apps.workorders.models import WorkOrder

    return WorkOrder.objects.filter(customer__user__email__iendswith=f"@{SEED_EMAIL_DOMAIN}")


def seed_invoices_qs():
    from apps.billing.models import Invoice

    return Invoice.objects.filter(customer__user__email__iendswith=f"@{SEED_EMAIL_DOMAIN}")


def tagged(value: str) -> str:
    """Append internal seed tag to a tags field (not shown as primary label)."""
    if not value:
        return SEED_TAG
    if SEED_TAG in value:
        return value
    return f"{value},{SEED_TAG}"


def is_seed_email(email: str | None) -> bool:
    return bool(email) and email.lower().endswith(f"@{SEED_EMAIL_DOMAIN}")


def legacy_demo_email_pattern(email: str | None) -> bool:
    """Match old demo.local / client.demo.* rows during transition."""
    if not email:
        return False
    lowered = email.lower()
    return ".demo." in lowered or lowered.endswith("@demo.local")
