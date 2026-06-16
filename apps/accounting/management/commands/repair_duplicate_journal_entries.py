from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from apps.accounting.models import JournalEntry
from apps.accounting.services import AccountingService


class Command(BaseCommand):
    help = (
        'Reverse duplicate posted journal entries that share the same reference, '
        'keeping the oldest entry as canonical. Use --reference-prefix to scope demo data.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report duplicates without creating reversals.',
        )
        parser.add_argument(
            '--reference-prefix',
            default='',
            help='Only process references starting with this prefix (e.g. CDINV or CDPAY-REF-).',
        )
        parser.add_argument(
            '--username',
            default='admin',
            help='User to attribute reversal journal entries to.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        prefix = options['reference_prefix']
        user_model = get_user_model()
        user = user_model.objects.filter(username=options['username']).first()
        if user is None and not dry_run:
            self.stdout.write(self.style.ERROR(f"User '{options['username']}' not found."))
            return

        duplicate_refs = (
            JournalEntry.objects.filter(posted=True)
            .exclude(reference='')
            .values('reference')
            .annotate(entry_count=Count('id'))
            .filter(entry_count__gt=1)
        )
        if prefix:
            duplicate_refs = duplicate_refs.filter(reference__startswith=prefix)

        total_groups = 0
        total_reversals = 0

        for row in duplicate_refs:
            reference = row['reference']
            entries = list(
                JournalEntry.objects.filter(posted=True, reference=reference).order_by('id')
            )
            if len(entries) < 2:
                continue

            canonical = entries[0]
            duplicates = entries[1:]
            total_groups += 1

            if dry_run:
                self.stdout.write(
                    f'Would keep JE #{canonical.id} and reverse '
                    f'{len(duplicates)} duplicate(s) for reference {reference!r}.'
                )
                total_reversals += len(duplicates)
                continue

            with transaction.atomic():
                for entry in duplicates:
                    reversal_type = JournalEntry.objects.filter(
                        content_type__model='journalentry',
                        object_id=entry.id,
                        reference=f'REV-JE-{entry.id}',
                    )
                    if reversal_type.exists():
                        continue
                    AccountingService.reverse_journal_entry(
                        entry,
                        user,
                        reason=f'Duplicate reference cleanup for {reference}',
                    )
                    entry.reference = f'DUPLICATE-VOID-{entry.id}-{reference}'
                    entry._allow_posted_edit = True
                    entry.save(update_fields=['reference', 'updated_at'])
                    total_reversals += 1

        mode = 'Would reverse' if dry_run else 'Reversed'
        self.stdout.write(
            self.style.SUCCESS(
                f'{mode} {total_reversals} duplicate journal entr{"y" if total_reversals == 1 else "ies"} '
                f'across {total_groups} reference group(s).'
            )
        )
