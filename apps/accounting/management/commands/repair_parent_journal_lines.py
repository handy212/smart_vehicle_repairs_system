from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounting.control_accounts import DEFAULT_PARENT_ACCOUNT_REMAP
from apps.accounting.models import Account, Transaction


class Command(BaseCommand):
    help = (
        'Remap posted journal lines that use parent/category accounts to configured '
        'leaf accounts (default: 1000 -> 1100). Requires accountant review for production.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report lines that would change without saving.',
        )
        parser.add_argument(
            '--map',
            action='append',
            default=[],
            metavar='PARENT:LEAF',
            help='Additional parent:leaf code remap (repeatable).',
        )

    def _build_remap(self, extra_maps):
        remap = dict(DEFAULT_PARENT_ACCOUNT_REMAP)
        for item in extra_maps:
            if ':' not in item:
                raise ValueError(f'Invalid --map value: {item}')
            parent_code, leaf_code = item.split(':', 1)
            remap[parent_code.strip()] = leaf_code.strip()
        return remap

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        remap = self._build_remap(options['map'])

        accounts_by_code = {account.code: account for account in Account.objects.all()}
        remap_ids = {}
        for parent_code, leaf_code in remap.items():
            parent = accounts_by_code.get(parent_code)
            leaf = accounts_by_code.get(leaf_code)
            if parent is None:
                self.stdout.write(self.style.WARNING(f'Parent account {parent_code} not found; skipping.'))
                continue
            if leaf is None or leaf.children.exists() or not leaf.is_active:
                self.stdout.write(
                    self.style.WARNING(
                        f'Leaf account {leaf_code} is missing or not a valid active leaf; skipping {parent_code}.'
                    )
                )
                continue
            remap_ids[parent.id] = leaf

        if not remap_ids:
            self.stdout.write(self.style.ERROR('No valid parent->leaf remaps available.'))
            return

        parent_lines = Transaction.objects.filter(
            journal_entry__posted=True,
            account_id__in=remap_ids.keys(),
        ).select_related('journal_entry', 'account')

        count = parent_lines.count()
        if count == 0:
            self.stdout.write(self.style.SUCCESS('No posted parent-account journal lines found.'))
            return

        if dry_run:
            by_parent = {}
            for line in parent_lines.iterator():
                by_parent.setdefault(line.account.code, 0)
                by_parent[line.account.code] += 1
            for parent_code, line_count in sorted(by_parent.items()):
                leaf_code = remap.get(parent_code, '?')
                self.stdout.write(f'Would remap {line_count} line(s) from {parent_code} -> {leaf_code}.')
            self.stdout.write(self.style.SUCCESS(f'Dry run: {count} line(s) would be updated.'))
            return

        updated = 0
        with transaction.atomic():
            for line in parent_lines.iterator():
                line.account = remap_ids[line.account_id]
                line._allow_posted_edit = True
                line.save(update_fields=['account'])
                updated += 1

        self.stdout.write(self.style.SUCCESS(f'Remapped {updated} posted journal line(s).'))
