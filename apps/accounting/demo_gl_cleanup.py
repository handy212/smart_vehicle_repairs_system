"""Helpers for purging seeded GL journal entries."""

from django.db.models import Q

# References created by client seed billing and accounting loaders.
SEED_JE_REFERENCE_PREFIXES = (
    "INV-",
    "PAY-",
    "JE-SEED-",
    "AR-FIX-",
    "AP-FIX-",
)

# Backward compatibility with older demo prefixes.
LEGACY_JE_REFERENCE_PREFIXES = (
    "CDINV",
    "CDPAY",
    "CDJE-",
)


def seed_journal_entry_queryset():
    """Journal entries created by the sample data seeder."""
    from apps.accounting.models import JournalEntry
    from apps.accounts.seed_identity import SEED_MARKER

    prefix_q = Q()
    for prefix in (*SEED_JE_REFERENCE_PREFIXES, *LEGACY_JE_REFERENCE_PREFIXES):
        prefix_q |= Q(reference__startswith=prefix)

    return JournalEntry.objects.filter(
        Q(description__contains=SEED_MARKER) | prefix_q
    ).distinct()


def purge_demo_journal_entries():
    """Delete seeded journal entries. Returns count purged."""
    qs = seed_journal_entry_queryset()
    count = qs.count()
    qs.delete()
    return count


# Backward-compatible aliases
demo_journal_entry_queryset = seed_journal_entry_queryset
