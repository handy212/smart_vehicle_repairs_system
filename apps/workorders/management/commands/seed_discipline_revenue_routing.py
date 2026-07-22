"""Seed discipline ServiceTaskTypes and PartCategories for owner QBO revenue routing."""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounting.models import RevenueProduct
from apps.inventory.models import PartCategory
from apps.workorders.models import ServiceTaskType

# New discipline task types (codes used as ServiceTask.task_type).
DISCIPLINE_TASK_TYPES = [
    {
        'code': 'ac_repair',
        'name': 'AC Works',
        'description': 'Air conditioning labour',
        'revenue_code': 'labor_ac',
        'sort_order': 10,
    },
    {
        'code': 'ac_service',
        'name': 'AC Service',
        'description': 'AC service / recharge',
        'revenue_code': 'labor_ac',
        'sort_order': 11,
    },
    {
        'code': 'spray',
        'name': 'Spraying / Paint',
        'description': 'Spray booth and paint labour',
        'revenue_code': 'labor_spraying',
        'sort_order': 20,
    },
    {
        'code': 'painting',
        'name': 'Painting',
        'description': 'Paint labour',
        'revenue_code': 'labor_spraying',
        'sort_order': 21,
    },
    {
        'code': 'body_paint',
        'name': 'Body Paint',
        'description': 'Body paint labour',
        'revenue_code': 'labor_spraying',
        'sort_order': 22,
    },
    {
        'code': 'mechanical',
        'name': 'Mechanical',
        'description': 'Mechanical labour',
        'revenue_code': 'labor_mechanical',
        'sort_order': 30,
    },
    {
        'code': 'electrical',
        'name': 'Electrical',
        'description': 'Electrical labour',
        'revenue_code': 'labor_electrical',
        'sort_order': 40,
    },
    {
        'code': 'body_work',
        'name': 'Body Works',
        'description': 'Body works labour',
        'revenue_code': 'labor_body',
        'sort_order': 50,
    },
    {
        'code': 'body_repair',
        'name': 'Body Repair',
        'description': 'Body repair labour',
        'revenue_code': 'labor_body',
        'sort_order': 51,
    },
    {
        'code': 'assessment',
        'name': 'Vehicle Assessment',
        'description': 'Vehicle assessment',
        'revenue_code': 'service_vehicle_assessment',
        'sort_order': 60,
    },
    {
        'code': 'vehicle_assessment',
        'name': 'Assessment',
        'description': 'Vehicle assessment',
        'revenue_code': 'service_vehicle_assessment',
        'sort_order': 61,
    },
    {
        'code': 'diagnosis',
        'name': 'Diagnosis',
        'description': 'Vehicle diagnosis',
        'revenue_code': 'service_diagnosis',
        'sort_order': 70,
    },
    {
        'code': 'programming',
        'name': 'Vehicle Programming',
        'description': 'ECU / vehicle programming',
        'revenue_code': 'service_vehicle_programming',
        'sort_order': 80,
    },
    {
        'code': 'vehicle_programming',
        'name': 'Programming',
        'description': 'Vehicle programming',
        'revenue_code': 'service_vehicle_programming',
        'sort_order': 81,
    },
    {
        'code': 'wheel_alignment',
        'name': 'Wheel Alignment',
        'description': 'Wheel alignment',
        'revenue_code': 'service_wheel_alignment',
        'sort_order': 90,
    },
    {
        'code': 'alignment',
        'name': 'Alignment',
        'description': 'Alignment',
        'revenue_code': 'service_wheel_alignment',
        'sort_order': 91,
    },
    {
        'code': 'skimming',
        'name': 'Vehicle Skimming',
        'description': 'Skimming',
        'revenue_code': 'service_vehicle_skimming',
        'sort_order': 100,
    },
    {
        'code': 'sublet',
        'name': 'Sublet / Outsource',
        'description': 'Sublet customer charge',
        'revenue_code': 'sublet_general',
        'sort_order': 110,
    },
    {
        'code': 'sub_contract',
        'name': 'Sub-Contract',
        'description': 'Sub-contract work',
        'revenue_code': 'sublet_general',
        'sort_order': 111,
    },
    {
        'code': 'exhaust',
        'name': 'Exhaust & Mufflers',
        'description': 'Exhaust and muffler work',
        'revenue_code': 'service_exhaust',
        'sort_order': 120,
    },
    {
        'code': 'muffler',
        'name': 'Muffler',
        'description': 'Muffler work',
        'revenue_code': 'service_exhaust',
        'sort_order': 121,
    },
    {
        'code': 'upholstery',
        'name': 'Upholstery',
        'description': 'Upholstery work',
        'revenue_code': 'service_upholstery',
        'sort_order': 130,
    },
    {
        'code': 'other_works',
        'name': 'Other Works',
        'description': 'Other workshop services',
        'revenue_code': 'service_other_works',
        'sort_order': 140,
    },
]

# Generic types should not force mechanical — allow description keywords / explicit product.
GENERIC_TASK_CODES_CLEAR_REVENUE = {
    'repair', 'maintenance', 'replacement', 'adjustment', 'cleaning', 'other', 'inspection', 'coordination',
}

PART_CATEGORIES = [
    ('Engine', 'parts_mechanical', 'Engine / mechanical parts'),
    ('Mechanical', 'parts_mechanical', 'Mechanical parts'),
    ('Brakes', 'parts_mechanical', 'Brake parts'),
    ('Suspension', 'parts_mechanical', 'Suspension parts'),
    ('Electrical', 'parts_electrical', 'Electrical parts'),
    ('Body', 'parts_body', 'Body parts'),
    ('Body Parts', 'parts_body', 'Body parts'),
    ('Paint', 'parts_spraying', 'Paint / spray materials'),
    ('Spraying', 'parts_spraying', 'Spraying materials'),
    ('AC', 'parts_ac_materials', 'AC materials'),
    ('A/C', 'parts_ac_materials', 'AC materials'),
    ('Tires', 'parts_tires', 'Tyres'),
    ('Tyres', 'parts_tires', 'Tyres'),
    ('Wheels', 'parts_tires', 'Wheels'),
    ('Lubricants', 'parts_lubricants', 'Oils and lubricants'),
    ('Oils', 'parts_lubricants', 'Oils'),
    ('Fluids', 'parts_lubricants', 'Fluids'),
    ('Accessories', 'parts_accessories', 'Accessories'),
    ('General Parts', 'parts_general', 'General / warehouse parts'),
    ('Parts', 'parts_general', 'General parts'),
]


class Command(BaseCommand):
    help = 'Create discipline task types and part categories linked to owner revenue products.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN'))

        products = {
            p.code: p
            for p in RevenueProduct.objects.filter(branch__isnull=True, is_active=True)
        }
        missing = sorted({
            *(row['revenue_code'] for row in DISCIPLINE_TASK_TYPES),
            *(code for _, code, _ in PART_CATEGORIES),
        } - set(products))
        if missing:
            self.stdout.write(self.style.ERROR(
                f'Missing company revenue products: {", ".join(missing)}. '
                'Run seed_owner_revenue_products / wire_owner_revenue_qbo first.'
            ))
            return

        created_types = updated_types = cleared = 0
        created_cats = updated_cats = 0

        with transaction.atomic():
            for row in DISCIPLINE_TASK_TYPES:
                product = products[row['revenue_code']]
                defaults = {
                    'name': row['name'],
                    'description': row['description'],
                    'revenue_product': product,
                    'is_active': True,
                    'is_billable': True,
                    'sort_order': row['sort_order'],
                }
                if dry_run:
                    exists = ServiceTaskType.objects.filter(code=row['code']).exists()
                    self.stdout.write(
                        f"  Would {'update' if exists else 'create'} task type {row['code']} → {product.code}"
                    )
                    if exists:
                        updated_types += 1
                    else:
                        created_types += 1
                    continue

                _, was_created = ServiceTaskType.objects.update_or_create(
                    code=row['code'],
                    defaults=defaults,
                )
                if was_created:
                    created_types += 1
                else:
                    updated_types += 1

            # Clear catch-all revenue on generic types so keywords can resolve.
            qs = ServiceTaskType.objects.filter(code__in=GENERIC_TASK_CODES_CLEAR_REVENUE)
            if dry_run:
                cleared = qs.exclude(revenue_product__isnull=True).count()
                self.stdout.write(f'  Would clear revenue_product on {cleared} generic task type(s)')
            else:
                cleared = qs.exclude(revenue_product__isnull=True).update(revenue_product=None)

            # Keep diagnostic on diagnosis product
            diag = products.get('service_diagnosis')
            if diag and not dry_run:
                ServiceTaskType.objects.filter(code='diagnostic').update(
                    revenue_product=diag,
                    is_active=True,
                )

            for name, revenue_code, description in PART_CATEGORIES:
                product = products[revenue_code]
                if dry_run:
                    exists = PartCategory.objects.filter(name__iexact=name).exists()
                    self.stdout.write(
                        f"  Would {'update' if exists else 'create'} category {name} → {product.code}"
                    )
                    if exists:
                        updated_cats += 1
                    else:
                        created_cats += 1
                    continue

                cat = PartCategory.objects.filter(name__iexact=name).first()
                if cat:
                    cat.description = cat.description or description
                    cat.revenue_product = product
                    cat.is_active = True
                    cat.save(update_fields=['description', 'revenue_product', 'is_active', 'updated_at'])
                    updated_cats += 1
                else:
                    PartCategory.objects.create(
                        name=name,
                        description=description,
                        revenue_product=product,
                        is_active=True,
                    )
                    created_cats += 1

            if dry_run:
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS(
            f'Task types: {created_types} created, {updated_types} updated; '
            f'cleared generic revenue on {cleared}; '
            f'categories: {created_cats} created, {updated_cats} updated.'
        ))
