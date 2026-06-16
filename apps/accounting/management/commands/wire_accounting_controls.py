from django.core.management.base import BaseCommand
from django.core.management import call_command

from apps.accounting.control_accounts import CONTROL_ACCOUNT_SPECS
from apps.accounting.models import Account, AccountingControl


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
        force = options['force']
        dry_run = options['dry_run']

        call_command('setup_chart_of_accounts')

        by_code = {account.code: account for account in Account.objects.all()}
        controls = AccountingControl.get_settings()
        changed_fields = []
        skipped = []

        for field_name in AccountingControl.ACCOUNT_FIELD_NAMES:
            spec = CONTROL_ACCOUNT_SPECS.get(field_name)
            if spec is None:
                self.stdout.write(self.style.WARNING(f'No spec for {field_name}; skipping.'))
                continue

            code, name, account_type, balance_type, account_subtype, parent_code = spec
            account = by_code.get(code)
            if account is None:
                parent = by_code.get(parent_code) if parent_code else None
                if dry_run:
                    self.stdout.write(f'Would create account {code} ({name}) for {field_name}.')
                    account = Account(code=code, name=name)
                else:
                    account, _ = Account.objects.get_or_create(
                        code=code,
                        defaults={
                            'name': name,
                            'account_type': account_type,
                            'balance_type': balance_type,
                            'account_subtype': account_subtype,
                            'parent': parent,
                            'is_active': True,
                        },
                    )
                    by_code[code] = account

            current = getattr(controls, field_name, None)
            needs_update = current is None
            if current is not None and force:
                needs_update = (
                    not current.is_active
                    or current.children.exists()
                    or current.id != account.id
                )

            if not needs_update:
                skipped.append(field_name)
                continue

            if dry_run:
                self.stdout.write(
                    f'Would set {field_name} -> {account.code} ({getattr(account, "name", name)}).'
                )
            else:
                setattr(controls, field_name, account)
                changed_fields.append(field_name)

        if changed_fields and not dry_run:
            controls.save(update_fields=changed_fields + ['updated_at'])

        if dry_run:
            self.stdout.write(self.style.SUCCESS('Dry run complete.'))
            return

        if changed_fields:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Wired {len(changed_fields)} control account(s): {", ".join(changed_fields)}.'
                )
            )
        else:
            self.stdout.write(self.style.SUCCESS('All control accounts already configured.'))

        if skipped:
            self.stdout.write(f'Unchanged ({len(skipped)}): {", ".join(skipped)}.')
