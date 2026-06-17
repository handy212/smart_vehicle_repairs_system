"""Helpers for purging demo / client-demo GL journal entries."""

from django.db.models import Q

# References created by client demo billing and accounting seeders.
DEMO_JE_REFERENCE_PREFIXES = (
    'CDINV',
    'CDPAY',
    'CDJE-',
    'AR-FIX-',
    'AP-FIX-',
)


def demo_journal_entry_queryset():
    """Journal entries that belong to client demo data (marker or known prefixes)."""
    from apps.accounting.models import JournalEntry

    from apps.accounts.client_demo_data import DEMO_MARKER

    prefix_q = Q()
    for prefix in DEMO_JE_REFERENCE_PREFIXES:
        prefix_q |= Q(reference__startswith=prefix)

    return JournalEntry.objects.filter(
        Q(description__contains=DEMO_MARKER) | prefix_q
    ).distinct()


def purge_demo_journal_entries():
    """Delete demo journal entries. Returns count purged."""
    qs = demo_journal_entry_queryset()
    count = qs.count()
    qs.delete()
    return count
