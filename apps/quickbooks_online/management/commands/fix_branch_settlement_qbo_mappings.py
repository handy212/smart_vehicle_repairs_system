from django.core.management.base import BaseCommand

from apps.quickbooks_online.fix_settlement_mapping_services import fix_branch_settlement_qbo_mappings
from apps.quickbooks_online.services import QuickBooksService


class Command(BaseCommand):
    help = (
        'Clear stale QBO mappings that stole branch settlement accounts (e.g. Accra MOMO on AP) '
        'and remap SVR GL settlement rows to the correct QBO bank accounts.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--account-code',
            action='append',
            dest='account_codes',
            help='Limit to specific SVR account codes (repeatable), e.g. 1151 and 1121.',
        )
        parser.add_argument('--dry-run', action='store_true', help='Preview without saving.')

    def handle(self, *args, **options):
        if not QuickBooksService.is_connected():
            self.stderr.write(self.style.ERROR('QuickBooks is not connected.'))
            return

        dry_run = options['dry_run']
        result = fix_branch_settlement_qbo_mappings(
            account_codes=options.get('account_codes'),
            dry_run=dry_run,
        )

        if result.get('errors'):
            self.stdout.write(self.style.ERROR('ERRORS'))
            for line in result['errors']:
                self.stdout.write(self.style.ERROR(f'  - {line}'))
            return

        for line in result.get('cleared_controls') or []:
            self.stdout.write(self.style.NOTICE(f'CLEARED  {line}'))

        for item in result.get('settlement') or []:
            code = item.get('account_code')
            for cleared in item.get('cleared') or []:
                self.stdout.write(self.style.NOTICE(f'CLEARED  {code}: {cleared}'))
            if item.get('mapped'):
                self.stdout.write(self.style.SUCCESS(f'MAPPED   {item["mapped"]}'))
            if item.get('skipped'):
                self.stdout.write(f'SKIPPED  {code}: {item["skipped"]}')

        vendor = result.get('vendor_cash') or {}
        for cleared in vendor.get('cleared') or []:
            self.stdout.write(self.style.NOTICE(f'CLEARED  {cleared}'))
        if vendor.get('mapped'):
            self.stdout.write(self.style.SUCCESS(f'MAPPED   {vendor["mapped"]}'))
        elif vendor.get('skipped'):
            self.stdout.write(f'SKIPPED  vendor cash: {vendor["skipped"]}')

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run — no changes saved.'))
        else:
            self.stdout.write(self.style.SUCCESS('Settlement QBO mapping repair finished.'))
