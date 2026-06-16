from django.core.management.base import BaseCommand

from apps.accounting.wire_controls import wire_accounting_controls


class Command(BaseCommand):
    help = (
        'Ensure chart seeds exist and wire AccountingControl fields to canonical '
        'leaf accounts from the posting standard (idempotent).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Replace control fields that are missing, inactive, or point to parent accounts.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report changes without saving.',
        )

    def handle(self, *args, **options):
        result = wire_accounting_controls(
            force=options['force'],
            dry_run=options['dry_run'],
        )

        for message in result['messages']:
            self.stdout.write(self.style.WARNING(message))

        if result['dry_run']:
            self.stdout.write(self.style.SUCCESS('Dry run complete.'))
            return

        if result['changed_fields']:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Wired {len(result["changed_fields"])} control account(s): '
                    f'{", ".join(result["changed_fields"])}.'
                )
            )
        else:
            self.stdout.write(self.style.SUCCESS('All control accounts already configured.'))

        if result['skipped']:
            self.stdout.write(f'Unchanged ({len(result["skipped"])}): {", ".join(result["skipped"])}.')
