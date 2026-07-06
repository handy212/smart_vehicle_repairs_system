from django.core.management.base import BaseCommand

from apps.branches.models import Branch
from apps.quickbooks_online.branch_main_cash_services import (
    migrate_all_branch_main_cash,
    migrate_branch_main_cash,
)


class Command(BaseCommand):
    help = (
        'Create per-branch till-enabled Main Cash accounts (114x) from QBO or placeholders, '
        'and optionally deactivate legacy shared Main Cash rows.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--branch-id', type=int, help='Migrate a single branch by id.')
        parser.add_argument('--dry-run', action='store_true', help='Preview without saving.')
        parser.add_argument(
            '--no-map-qbo',
            action='store_true',
            help='Skip QBO lookup; create SVR placeholders only.',
        )
        parser.add_argument(
            '--keep-legacy',
            action='store_true',
            help='Do not deactivate legacy shared Main Cash accounts.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        map_qbo = not options['no_map_qbo']
        branch_id = options.get('branch_id')
        deactivate_legacy = not options['keep_legacy']

        if branch_id:
            branch = Branch.objects.filter(pk=branch_id).first()
            if not branch:
                self.stderr.write(self.style.ERROR(f'Branch {branch_id} not found.'))
                return
            result = migrate_branch_main_cash(branch, dry_run=dry_run, map_qbo=map_qbo)
        else:
            result = migrate_all_branch_main_cash(
                dry_run=dry_run,
                map_qbo=map_qbo,
                deactivate_legacy=deactivate_legacy,
            )

        for key in ('created', 'updated', 'mapped', 'deactivated', 'skipped', 'errors'):
            values = result.get(key) or []
            if not values:
                continue
            self.stdout.write(self.style.NOTICE(key.upper()))
            for line in values:
                if key == 'errors':
                    self.stdout.write(self.style.ERROR(f'  - {line}'))
                else:
                    self.stdout.write(f'  - {line}')

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run — no changes saved.'))
        else:
            self.stdout.write(self.style.SUCCESS('Branch main cash migration finished.'))
