"""Seed owner-aligned revenue products and link operational catalog rows."""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounting.models import RevenueProduct
from apps.accounting.owner_revenue_product_specs import OWNER_REVENUE_PRODUCT_SPECS
from apps.inventory.models import Part, PartCategory
from apps.subscriptions.models import Package
from apps.workorders.models import ServiceTaskType


class Command(BaseCommand):
    help = (
        'Create or update RevenueProduct rows from the owner legacy chart, '
        'optionally seed service catalog Parts and wire task types / categories.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview changes without writing to the database.',
        )
        parser.add_argument(
            '--skip-catalog-parts',
            action='store_true',
            help='Do not create service catalog Parts for revenue products.',
        )
        parser.add_argument(
            '--wire-references',
            action='store_true',
            default=True,
            help='Link ServiceTaskType, PartCategory, Package, and roadside types (default: on).',
        )
        parser.add_argument(
            '--no-wire-references',
            action='store_true',
            help='Skip linking operational references.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        skip_parts = options['skip_catalog_parts']
        wire_refs = options['wire_references'] and not options['no_wire_references']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no database changes will be saved.'))

        with transaction.atomic():
            category = self._ensure_revenue_catalog_category(dry_run=dry_run)
            created_products = 0
            updated_products = 0
            created_parts = 0

            for spec in OWNER_REVENUE_PRODUCT_SPECS:
                product, was_created = self._upsert_product(spec, dry_run=dry_run)
                if was_created:
                    created_products += 1
                elif product:
                    updated_products += 1

                if product and not skip_parts and spec.get('catalog_part_number'):
                    part, part_created = self._ensure_catalog_part(
                        product, spec, category, dry_run=dry_run,
                    )
                    if part_created:
                        created_parts += 1

                if product and wire_refs:
                    self._wire_references(product, spec, dry_run=dry_run)

            if dry_run:
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS(
            f'Revenue products: {created_products} created, {updated_products} updated; '
            f'{created_parts} catalog parts created.'
        ))

    def _ensure_revenue_catalog_category(self, *, dry_run=False):
        category, _ = PartCategory.objects.get_or_create(
            name='Revenue Catalog',
            defaults={'description': 'Service items for owner revenue product QBO sync.'},
        )
        if dry_run:
            self.stdout.write(f'  Category: {category.name}')
        return category

    def _upsert_product(self, spec, *, dry_run=False):
        defaults = {
            'name': spec['name'],
            'owner_account_code': spec.get('owner_account_code', ''),
            'owner_account_label': spec.get('owner_account_label', ''),
            'revenue_class': spec.get('revenue_class', 'service'),
            'default_billing_line_type': spec.get('default_billing_line_type', 'other'),
            'sort_order': spec.get('sort_order', 0),
            'is_active': True,
        }
        roadside_types = spec.get('roadside_service_types') or []
        if len(roadside_types) == 1:
            defaults['roadside_service_type'] = roadside_types[0]
        else:
            # Avoid clobbering an existing dedicated roadside row with null when
            # this product owns multiple roadside types via wire_references only.
            pass

        if dry_run:
            exists = RevenueProduct.objects.filter(code=spec['code'], branch__isnull=True).exists()
            action = 'create' if not exists else 'update'
            self.stdout.write(f'  Would {action} product {spec["code"]} ({spec["name"]})')
            return RevenueProduct(code=spec['code'], **defaults), not exists

        # If another company product already owns this roadside type, clear it first.
        roadside = defaults.get('roadside_service_type')
        if roadside:
            RevenueProduct.objects.filter(
                branch__isnull=True,
                roadside_service_type=roadside,
            ).exclude(code=spec['code']).update(roadside_service_type=None)

        product, created = RevenueProduct.objects.update_or_create(
            code=spec['code'],
            branch=None,
            defaults=defaults,
        )
        return product, created

    def _ensure_catalog_part(self, product, spec, category, *, dry_run=False):
        part_number = spec['catalog_part_number']
        if dry_run:
            exists = Part.objects.filter(part_number=part_number).exists()
            self.stdout.write(f'    Would {"create" if not exists else "update"} catalog part {part_number}')
            return None, not exists

        part, created = Part.objects.update_or_create(
            part_number=part_number,
            defaults={
                'name': spec['name'],
                'description': (
                    f"Owner account {spec.get('owner_account_code', '')} — "
                    f"QBO revenue template for {spec['code']}"
                ).strip(),
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
        return part, created

    def _wire_references(self, product, spec, *, dry_run=False):
        for code in spec.get('task_type_codes') or []:
            qs = ServiceTaskType.objects.filter(code=code)
            if dry_run:
                if qs.exists():
                    self.stdout.write(f'    Would link task type {code} → {product.code}')
                continue
            qs.update(revenue_product=product)

        for name in spec.get('part_category_names') or []:
            qs = PartCategory.objects.filter(name__iexact=name)
            if dry_run:
                if qs.exists():
                    self.stdout.write(f'    Would link category {name} → {product.code}')
                continue
            qs.update(revenue_product=product)

        if spec.get('code') == 'aa_subscription':
            qs = Package.objects.filter(is_active=True)
            if dry_run:
                count = qs.count()
                if count:
                    self.stdout.write(f'    Would link {count} active package(s) → {product.code}')
            else:
                qs.update(revenue_product=product)
