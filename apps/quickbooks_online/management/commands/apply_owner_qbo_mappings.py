"""Apply owner legacy COA auto-mappings to QBO (control accounts, items, branches)."""

from django.core.management.base import BaseCommand

from apps.accounting.wire_controls import wire_accounting_controls
from apps.quickbooks_online.owner_coa_services import get_owner_coa_setup_service
from apps.quickbooks_online.services import QuickBooksService


class Command(BaseCommand):
    help = (
        'Auto-map SVR control accounts, payment methods, invoice line items, and '
        'branch departments to the owner QuickBooks chart. SVR GL stays lean.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview mappings without writing to QBO or SVR.',
        )
        parser.add_argument(
            '--overwrite',
            action='store_true',
            help='Replace existing QBOAccountMapping rows.',
        )
        parser.add_argument(
            '--wire-svr',
            action='store_true',
            help='Run setup_chart_of_accounts + wire controls before mapping.',
        )
        parser.add_argument(
            '--skip-items',
            action='store_true',
            help='Skip QBO Item creation for invoice line types.',
        )
        parser.add_argument(
            '--skip-branches',
            action='store_true',
            help='Skip branch → QBO Department linking.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        overwrite = options['overwrite']

        if options['wire_svr'] and not dry_run:
            wire_result = wire_accounting_controls()
            self.stdout.write(
                self.style.SUCCESS(
                    f"SVR controls wired: {', '.join(wire_result['changed_fields']) or 'none changed'}."
                )
            )
        elif options['wire_svr']:
            self.stdout.write('Would wire SVR control accounts (--dry-run).')

        qb = QuickBooksService()
        if not qb.is_connected():
            self.stdout.write(self.style.ERROR('QuickBooks is not connected. Connect in Admin → Integrations first.'))
            return

        service = get_owner_coa_setup_service()

        if not dry_run:
            supplemental = service.create_supplemental_accounts(dry_run=False)
            for name in supplemental.get('created') or []:
                self.stdout.write(self.style.SUCCESS(f'Supplemental QBO account created: {name}'))

        mappings = service.apply_control_and_payment_mappings(
            dry_run=dry_run,
            overwrite=overwrite,
        )
        if mappings.get('error'):
            self.stdout.write(self.style.ERROR(mappings['error']))
            return

        self.stdout.write(self.style.SUCCESS(f"Mapped {len(mappings.get('mapped') or [])} QBO account rows."))
        for row in mappings.get('mapped') or []:
            label = row.get('qbo_account_name') or row.get('mapping_key')
            self.stdout.write(f"  {row.get('mapping_kind')}:{row.get('mapping_key')} → {label}")

        for skip in mappings.get('skipped') or []:
            self.stdout.write(f'  Skipped: {skip}')

        if not options['skip_items']:
            items = service.setup_invoice_line_items(dry_run=dry_run)
            if items.get('error'):
                self.stdout.write(self.style.ERROR(items['error']))
            else:
                for item in items.get('items') or []:
                    self.stdout.write(
                        f"  Item {item.get('line_type')}: {item.get('action')} "
                        f"{item.get('name') or item.get('reason') or ''}"
                    )

        if not options['skip_branches']:
            branches = service.sync_branch_departments(dry_run=dry_run)
            if branches.get('error'):
                self.stdout.write(self.style.ERROR(branches['error']))
            else:
                for link in branches.get('linked') or []:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  Branch {link.get('branch')} → Department {link.get('department')}"
                        )
                    )
                for skip in branches.get('skipped') or []:
                    self.stdout.write(f'  Branch skipped: {skip}')
