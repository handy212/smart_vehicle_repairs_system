"""Create supplemental QBO accounts and validate owner chart corrections."""

from django.core.management.base import BaseCommand

from apps.quickbooks_online.owner_coa_services import get_owner_coa_setup_service
from apps.quickbooks_online.services import QuickBooksService


class Command(BaseCommand):
    help = (
        'Create supplemental QuickBooks accounts required by the SVR bridge '
        '(Customer Prepayments, Sales Returns, WIP) and report owner COA warnings.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview accounts that would be created without calling QBO.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        qb = QuickBooksService()

        if not qb.is_connected():
            self.stdout.write(self.style.ERROR('QuickBooks is not connected. Connect in Admin → Integrations first.'))
            return

        service = get_owner_coa_setup_service()
        client, error = service._require_client()
        if error:
            self.stdout.write(self.style.ERROR(error))
            return

        accounts = service._load_qbo_accounts(client)
        warnings = service.validate_owner_chart(accounts)
        if warnings:
            self.stdout.write(self.style.WARNING('Owner COA validation warnings:'))
            for warning in warnings:
                self.stdout.write(f"  [{warning.get('code')}] {warning.get('issue')}")
                self.stdout.write(f"    → {warning.get('action')}")
        else:
            self.stdout.write(self.style.SUCCESS('No owner COA correction warnings detected.'))

        result = service.create_supplemental_accounts(dry_run=dry_run)
        if result.get('error'):
            self.stdout.write(self.style.ERROR(result['error']))
            return

        prefix = 'Would create' if dry_run else 'Created'
        for name in result.get('created') or []:
            self.stdout.write(self.style.SUCCESS(f'{prefix}: {name}'))

        for name in result.get('skipped') or []:
            self.stdout.write(f'Skipped (already exists or failed): {name}')
