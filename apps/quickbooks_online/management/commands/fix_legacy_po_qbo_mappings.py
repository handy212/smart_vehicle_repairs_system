"""Clear legacy Bill Ids stored on PurchaseOrder QBOMappings and optionally re-sync POs."""
from django.core.management.base import BaseCommand

from apps.quickbooks_online.po_mapping_repair import repair_legacy_po_qbo_mappings
from apps.quickbooks_online.services import QuickBooksService


class Command(BaseCommand):
    help = (
        'Detect PurchaseOrder mappings that store a QBO Bill Id (legacy mirror bug) '
        'and clear them so the PO can re-sync as a PurchaseOrder.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Clear legacy mappings (default is dry-run only).',
        )
        parser.add_argument(
            '--resync',
            action='store_true',
            help='After clearing, push each affected PO to QuickBooks (requires --apply).',
        )

    def handle(self, *args, **options):
        apply_changes = options['apply']
        resync = options['resync'] and apply_changes

        if resync and not apply_changes:
            self.stdout.write(self.style.ERROR('--resync requires --apply'))
            return

        if not QuickBooksService.is_connected():
            self.stdout.write(self.style.ERROR('QuickBooks is not connected.'))
            return

        service = QuickBooksService()
        result = repair_legacy_po_qbo_mappings(
            service,
            dry_run=not apply_changes,
            resync=resync,
        )

        mode = 'DRY RUN' if not apply_changes else 'APPLIED'
        self.stdout.write(
            f'[{mode}] Checked {result["checked"]} PO mapping(s); '
            f'legacy Bill Id: {result["legacy_bill"]}; '
            f'cleared: {result["cleared"]}; re-synced: {result["resynced"]}; '
            f'skipped (OK): {result["skipped"]}.'
        )

        for detail in result.get('details', []):
            self.stdout.write(
                f'  PO {detail["po_number"]} (id={detail["po_id"]}) legacy QBO Bill Id={detail["legacy_qbo_id"]}'
            )

        for err in result.get('errors', []):
            self.stdout.write(self.style.ERROR(err))

        if not apply_changes and result['legacy_bill']:
            self.stdout.write(self.style.WARNING('Re-run with --apply to clear legacy mappings.'))
            if resync:
                self.stdout.write(self.style.WARNING('Add --resync with --apply to push POs to QBO.'))
