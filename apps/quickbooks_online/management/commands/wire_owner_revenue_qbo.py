"""Wire owner revenue products to QBO category parents and per-branch leaf income accounts."""

from __future__ import annotations

import re
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounting.models import RevenueProduct
from apps.accounting.owner_revenue_product_specs import (
    BRANCH_QBO_CITY_LEAF,
    OWNER_REVENUE_PRODUCT_SPECS,
)
from apps.branches.models import Branch
from apps.inventory.models import Part, PartCategory
from apps.quickbooks_online.services import QuickBooksService


def _norm(value: str | None) -> str:
    return re.sub(r'\s+', ' ', (value or '').strip().lower())


def _norm_acct(value: str | None) -> str:
    return ''.join(ch for ch in (value or '') if ch.isalnum()).lower()


class Command(BaseCommand):
    help = (
        'Seed company revenue products, create branch overrides for category×city '
        'QBO income leaves, and sync catalog Parts as QBO Service items.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--skip-sync', action='store_true', help='Skip pushing catalog Parts to QBO.')
        parser.add_argument('--company-only', action='store_true', help='Skip branch leaf overrides.')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        skip_sync = options['skip_sync']
        company_only = options['company_only']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no writes.'))

        qb = QuickBooksService()
        if not qb.is_connected():
            self.stdout.write(self.style.ERROR('QuickBooks is not connected.'))
            return

        client = qb.get_client()
        if client is None:
            self.stdout.write(self.style.ERROR('QuickBooks API session unavailable.'))
            return

        accounts = self._load_income_accounts(client)
        self.stdout.write(f'Loaded {len(accounts)} QBO income accounts.')

        # 1) Seed company products via existing command logic
        from django.core.management import call_command
        call_command(
            'seed_owner_revenue_products',
            dry_run=dry_run,
            verbosity=1,
        )

        category = PartCategory.objects.filter(name='Revenue Catalog').first()
        if category is None and not dry_run:
            category = PartCategory.objects.create(
                name='Revenue Catalog',
                description='Service items for owner revenue product QBO sync.',
            )

        created_branch = 0
        synced = 0
        sync_errors = []

        specs_by_code = {s['code']: s for s in OWNER_REVENUE_PRODUCT_SPECS}

        # 2) Ensure company catalog parts point at parent income codes, then sync
        for spec in OWNER_REVENUE_PRODUCT_SPECS:
            if not spec.get('catalog_part_number'):
                continue
            product = RevenueProduct.objects.filter(code=spec['code'], branch__isnull=True).first()
            if not product and dry_run:
                continue
            if not product:
                continue

            parent = self._find_account_by_code_or_name(
                accounts,
                code=spec.get('owner_account_code'),
                name=spec.get('owner_account_label') or spec.get('name'),
            )
            if parent:
                acct_num = (getattr(parent, 'AcctNum', None) or spec.get('owner_account_code') or '').strip()
                # Prefer clean numeric code from spec when QBO AcctNum is noisy
                preferred = spec.get('owner_account_code') or acct_num
                if not dry_run and product.owner_account_code != preferred:
                    product.owner_account_code = preferred
                    product.owner_account_label = parent.Name
                    product.save(update_fields=['owner_account_code', 'owner_account_label', 'updated_at'])

            part = product.catalog_part
            if part is None and category and not dry_run:
                part, _ = Part.objects.update_or_create(
                    part_number=spec['catalog_part_number'],
                    defaults={
                        'name': spec['name'],
                        'description': f"QBO revenue template for {spec['code']}",
                        'category': category,
                        'item_type': 'service',
                        'cost_price': Decimal('0.00'),
                        'selling_price': Decimal('0.00'),
                        'revenue_product': product,
                        'is_active': True,
                    },
                )
                product.catalog_part = part
                product.save(update_fields=['catalog_part', 'updated_at'])

            if part and not skip_sync and not dry_run:
                ok, err = self._sync_part(qb, part)
                if ok:
                    synced += 1
                else:
                    sync_errors.append(f'{part.part_number}: {err}')

        if company_only:
            self._print_summary(created_branch, synced, sync_errors)
            return

        # 3) Branch leaf products + catalog parts
        branches = list(Branch.objects.filter(is_active=True).order_by('code'))
        for branch in branches:
            city = BRANCH_QBO_CITY_LEAF.get(branch.code)
            if not city:
                self.stdout.write(self.style.WARNING(f'No city leaf mapping for branch {branch.code}'))
                continue

            for spec in OWNER_REVENUE_PRODUCT_SPECS:
                prefix = spec.get('qbo_leaf_name_prefix')
                if not prefix:
                    continue

                leaf = self._find_branch_leaf(accounts, prefix, city)
                if not leaf:
                    self.stdout.write(
                        self.style.WARNING(f'  No leaf for {spec["code"]} / {branch.code} ({prefix} – {city})')
                    )
                    continue

                leaf_code = (getattr(leaf, 'AcctNum', None) or '').strip() or spec['owner_account_code']
                # Prefer QBO AcctNum when present and alphanumeric-ish
                if not _norm_acct(leaf_code):
                    leaf_code = spec['owner_account_code']

                part_number = f"{spec['catalog_part_number']}-{branch.code}"[:50]

                if dry_run:
                    self.stdout.write(
                        f'  Would map {branch.code}:{spec["code"]} → {leaf.Name} ({leaf_code})'
                    )
                    created_branch += 1
                    continue

                with transaction.atomic():
                    product, was_created = RevenueProduct.objects.update_or_create(
                        code=spec['code'],
                        branch=branch,
                        defaults={
                            'name': f'{spec["name"]} – {city}',
                            'owner_account_code': leaf_code[:20],
                            'owner_account_label': leaf.Name,
                            'revenue_class': spec.get('revenue_class', 'service'),
                            'default_billing_line_type': spec.get('default_billing_line_type', 'other'),
                            'sort_order': spec.get('sort_order', 0),
                            'is_active': True,
                        },
                    )
                    if was_created:
                        created_branch += 1

                    part, _ = Part.objects.update_or_create(
                        part_number=part_number,
                        defaults={
                            'name': f'{spec["name"]} – {city}',
                            'description': f'Branch leaf {leaf.Name} ({leaf_code})',
                            'category': category,
                            'item_type': 'service',
                            'cost_price': Decimal('0.00'),
                            'selling_price': Decimal('0.00'),
                            'revenue_product': product,
                            'is_active': True,
                        },
                    )
                    if product.catalog_part_id != part.id:
                        product.catalog_part = part
                        product.save(update_fields=['catalog_part', 'updated_at'])

                if not skip_sync:
                    ok, err = self._sync_part(qb, part)
                    if ok:
                        synced += 1
                        self.stdout.write(
                            self.style.SUCCESS(f'  {branch.code}:{spec["code"]} → {leaf.Name}')
                        )
                    else:
                        sync_errors.append(f'{part_number}: {err}')
                        self.stdout.write(self.style.ERROR(f'  {part_number}: {err}'))

        self._print_summary(created_branch, synced, sync_errors)

    def _print_summary(self, created_branch, synced, sync_errors):
        self.stdout.write(self.style.SUCCESS(
            f'Done. Branch products created/ensured: {created_branch}; catalog syncs: {synced}; '
            f'errors: {len(sync_errors)}'
        ))
        for err in sync_errors[:20]:
            self.stdout.write(self.style.ERROR(f'  {err}'))

    def _load_income_accounts(self, client):
        from quickbooks.objects.account import Account as QBAccount

        rows = QBAccount.query(
            "SELECT * FROM Account WHERE AccountType IN ('Income', 'Other Income') MAXRESULTS 1000",
            qb=client,
        )
        return list(rows or [])

    def _find_account_by_code_or_name(self, accounts, *, code=None, name=None):
        want_code = _norm_acct(code)
        want_name = _norm(name)
        for account in accounts:
            acct_num = _norm_acct(getattr(account, 'AcctNum', None))
            if want_code and acct_num == want_code:
                return account
        for account in accounts:
            if want_name and _norm(getattr(account, 'Name', None)) == want_name:
                return account
        return None

    def _find_branch_leaf(self, accounts, prefix: str, city: str):
        prefix_n = _norm(prefix)
        city_n = _norm(city)
        exact = {
            f'{prefix_n} – {city_n}',
            f'{prefix_n} - {city_n}',
        }
        exact_matches = []
        prefix_matches = []
        for account in accounts:
            name = _norm(getattr(account, 'Name', None))
            if name in exact:
                exact_matches.append(account)
                continue
            # Require name to start with the category prefix so
            # "AC Works" does not match "AC Works Labour – Accra".
            if not (name.startswith(f'{prefix_n} – ') or name.startswith(f'{prefix_n} - ')):
                continue
            if city_n in name:
                prefix_matches.append(account)
        if exact_matches:
            return exact_matches[0]
        if len(prefix_matches) == 1:
            return prefix_matches[0]
        if not prefix_matches:
            return None
        return prefix_matches[0]

    def _sync_part(self, qb: QuickBooksService, part: Part):
        try:
            # Ensure revenue_product is loaded for income resolution
            part = Part.objects.select_related('revenue_product', 'revenue_product__branch').get(pk=part.pk)
            result = qb.sync_part(part, update_qty_on_hand=False)
            if result is None:
                from django.contrib.contenttypes.models import ContentType
                from apps.quickbooks_online.models import QBOMapping
                mapping = QBOMapping.objects.filter(
                    content_type=ContentType.objects.get_for_model(Part),
                    object_id=part.pk,
                ).first()
                return False, (mapping.error_message if mapping and mapping.error_message else 'sync returned None')
            return True, None
        except Exception as exc:
            return False, str(exc)
