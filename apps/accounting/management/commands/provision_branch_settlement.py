from django.core.management.base import BaseCommand

from apps.branches.models import Branch
from apps.quickbooks_online.branch_settlement_services import (
    provision_all_active_branches,
    provision_branch_settlement_accounts,
)


class Command(BaseCommand):
    help = (
        'Create branch-scoped settlement GL accounts (bank/cash/MOMO) from QuickBooks '
        'and map each to QBO via svr_account rows.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--branch-id', type=int, help='Provision a single branch by id.')
        parser.add_argument('--dry-run', action='store_true', help='Preview without saving.')
        parser.add_argument(
            '--no-map-qbo',
            action='store_true',
            help='Create SVR settlement placeholders without QBO lookup.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        map_qbo = not options['no_map_qbo']
        branch_id = options.get('branch_id')

        if branch_id:
            branch = Branch.objects.filter(pk=branch_id).first()
            if not branch:
                self.stderr.write(self.style.ERROR(f'Branch {branch_id} not found.'))
                return
            result = provision_branch_settlement_accounts(
                branch,
                dry_run=dry_run,
                map_qbo=map_qbo,
            )
        else:
            result = provision_all_active_branches(dry_run=dry_run, map_qbo=map_qbo)

        for key in ('created', 'updated', 'mapped', 'skipped', 'errors'):
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
            self.stdout.write(self.style.SUCCESS('Branch settlement provisioning finished.'))
