"""Resolve owner-aligned revenue products for billing lines."""

from __future__ import annotations

from decimal import Decimal

from django.db.models import Q

from apps.accounting.models import RevenueProduct
from apps.inventory.part_catalog import billing_line_type_for_part


def _branch_id(branch):
    if branch is None:
        return None
    if hasattr(branch, 'id'):
        return branch.id
    return branch


def _active_product(*, branch=None, **filters):
    """Return branch-specific row first, then company-wide fallback."""
    branch_id = _branch_id(branch)
    base = RevenueProduct.objects.filter(is_active=True, **filters).select_related('catalog_part')

    if branch_id is not None:
        branch_row = base.filter(branch_id=branch_id).order_by('sort_order', 'id').first()
        if branch_row:
            return branch_row

    return base.filter(branch__isnull=True).order_by('sort_order', 'id').first()


def resolve_revenue_product_by_code(code: str, *, branch=None) -> RevenueProduct | None:
    code = (code or '').strip()
    if not code:
        return None
    return _active_product(branch=branch, code=code)


def resolve_revenue_product_by_id(product_id, *, branch=None) -> RevenueProduct | None:
    """Resolve explicit FK; re-map to branch override when code matches."""
    if not product_id:
        return None
    product = (
        RevenueProduct.objects.filter(pk=product_id, is_active=True)
        .select_related('catalog_part', 'branch')
        .first()
    )
    if not product:
        return None
    branch_id = _branch_id(branch)
    if branch_id and (product.branch_id is None or product.branch_id != branch_id):
        override = _active_product(branch=branch, code=product.code)
        if override:
            return override
    return product


def revenue_product_from_task_type_code(task_type_code: str, *, branch=None) -> RevenueProduct | None:
    """Resolve revenue product configured on a ServiceTaskType row."""
    task_type_code = (task_type_code or '').strip()
    if not task_type_code:
        return None

    from apps.workorders.models import ServiceTaskType

    task_type = (
        ServiceTaskType.objects.filter(code=task_type_code, is_active=True)
        .select_related('revenue_product', 'revenue_product__catalog_part')
        .first()
    )
    if task_type and task_type.revenue_product_id and task_type.revenue_product.is_active:
        return resolve_revenue_product_by_id(task_type.revenue_product_id, branch=branch)
    return None


def resolve_revenue_product_for_task(task, *, branch=None) -> RevenueProduct | None:
    """Map a work-order task to a revenue product."""
    if branch is None:
        work_order = getattr(task, 'work_order', None)
        branch = getattr(work_order, 'branch', None) if work_order else None

    revenue_product_id = getattr(task, 'revenue_product_id', None)
    if revenue_product_id:
        product = resolve_revenue_product_by_id(revenue_product_id, branch=branch)
        if product:
            return product

    task_type_code = (getattr(task, 'task_type', '') or '').strip()
    if task_type_code:
        product = revenue_product_from_task_type_code(task_type_code, branch=branch)
        if product:
            return product

    description = (getattr(task, 'description', '') or '').lower()
    keyword_product = _revenue_product_from_task_keywords(description, branch=branch)
    if keyword_product:
        return keyword_product

    return _active_product(branch=branch, code='labor_mechanical')


def _revenue_product_from_task_keywords(description: str, *, branch=None) -> RevenueProduct | None:
    """Best-effort discipline match from free-text task description."""
    description = (description or '').lower()
    if not description:
        return None

    keyword_map = (
        ('spray', 'labor_spraying'),
        ('paint', 'labor_spraying'),
        ('body', 'labor_body'),
        ('electrical', 'labor_electrical'),
        ('a/c', 'labor_ac'),
        ('air con', 'labor_ac'),
        ('aircon', 'labor_ac'),
        ('exhaust', 'service_exhaust'),
        ('muffler', 'service_exhaust'),
        ('upholstery', 'service_upholstery'),
        ('alignment', 'service_wheel_alignment'),
        ('diagnos', 'service_diagnosis'),
        ('assessment', 'service_vehicle_assessment'),
        ('program', 'service_vehicle_programming'),
        ('skim', 'service_vehicle_skimming'),
        ('sublet', 'sublet_general'),
        ('sub-contract', 'sublet_general'),
        ('subcontract', 'sublet_general'),
    )
    for keyword, code in keyword_map:
        if keyword in description:
            product = _active_product(branch=branch, code=code)
            if product:
                return product

    # Word-boundary style AC match ("ac gas", "ac-repair", leading "ac ")
    tokens = description.replace('-', ' ').replace('/', ' ').split()
    if 'ac' in tokens:
        product = _active_product(branch=branch, code='labor_ac')
        if product:
            return product

    return None


def resolve_revenue_product_for_part(part, *, branch=None) -> RevenueProduct | None:
    """Map an inventory catalog part to a revenue product."""
    if part is None:
        return _active_product(branch=branch, code='parts_general')

    if getattr(part, 'revenue_product_id', None):
        product = resolve_revenue_product_by_id(part.revenue_product_id, branch=branch)
        if product:
            return product

    category = getattr(part, 'category', None)
    if category is not None:
        if getattr(category, 'revenue_product_id', None):
            product = resolve_revenue_product_by_id(category.revenue_product_id, branch=branch)
            if product:
                return product
        category_name = (getattr(category, 'name', '') or '').lower()
        category_code_map = (
            ('tire', 'parts_tires'),
            ('tyre', 'parts_tires'),
            ('ac ', 'parts_ac_materials'),
            ('a/c', 'parts_ac_materials'),
            ('electrical', 'parts_electrical'),
            ('body', 'parts_body'),
            ('spray', 'parts_spraying'),
            ('paint', 'parts_spraying'),
            ('mech', 'parts_mechanical'),
            ('engine', 'parts_mechanical'),
            ('lubric', 'parts_lubricants'),
            ('oil', 'parts_lubricants'),
            ('access', 'parts_accessories'),
        )
        for keyword, code in category_code_map:
            if keyword in category_name:
                product = _active_product(branch=branch, code=code)
                if product:
                    return product

    return _active_product(branch=branch, code='parts_general')


def resolve_revenue_product_for_roadside(service_type: str, *, branch=None) -> RevenueProduct | None:
    service_type = (service_type or '').strip()
    if service_type:
        branch_id = _branch_id(branch)
        if branch_id is not None:
            product = _active_product(branch=branch, roadside_service_type=service_type)
            if product:
                return product
        product = _active_product(branch=None, roadside_service_type=service_type)
        if product:
            return product
        if service_type == 'towing':
            return _active_product(branch=branch, code='aa_towing')
        if service_type in (
            'mechanical_first_aid', 'battery_boost', 'flat_tyre', 'key_lockout',
            'emergency_fuel', 'extrication', 'accident_estimate', 'pre_purchase_inspection',
        ):
            return _active_product(branch=branch, code='aa_outduty')
    return _active_product(branch=branch, code='aa_outduty')


def resolve_revenue_product_for_package(package, *, branch=None) -> RevenueProduct | None:
    if package is None:
        return _active_product(branch=branch, code='aa_subscription')
    if getattr(package, 'revenue_product_id', None):
        product = resolve_revenue_product_by_id(package.revenue_product_id, branch=branch)
        if product:
            return product
    return _active_product(branch=branch, code='aa_subscription')


def billing_line_type_for_revenue_product(revenue_product, *, part=None) -> str:
    if part is not None:
        return billing_line_type_for_part(part)
    if revenue_product and revenue_product.default_billing_line_type:
        return revenue_product.default_billing_line_type
    return 'other'


def catalog_part_for_line(*, revenue_product, inventory_part=None):
    """Prefer operational inventory part; fall back to revenue template catalog part."""
    if inventory_part is not None:
        return inventory_part
    if revenue_product and revenue_product.catalog_part_id:
        return revenue_product.catalog_part
    return None


def build_invoice_line_fields(
    *,
    revenue_product,
    description: str,
    inventory_part=None,
    item_type: str | None = None,
) -> dict:
    """Return kwargs fragment for InvoiceLineItem (part, item_type, revenue_product)."""
    part = catalog_part_for_line(revenue_product=revenue_product, inventory_part=inventory_part)
    resolved_type = item_type or billing_line_type_for_revenue_product(revenue_product, part=part)
    fields = {
        'revenue_product': revenue_product,
        'item_type': resolved_type,
        'description': (description or (revenue_product.name if revenue_product else ''))[:500],
    }
    if part is not None:
        fields['part'] = part
        fields['part_number'] = getattr(part, 'part_number', '') or ''
    return fields


def merge_labor_pricing_fields(
    *,
    cost: Decimal,
    hours=None,
    rate=None,
) -> dict:
    """Build quantity / labor_hours / labor_rate / unit_price fields for a line."""
    cost = (cost or Decimal('0')).quantize(Decimal('0.01'))
    if hours and hours > 0:
        hours = Decimal(str(hours))
        if rate and rate > 0:
            rate = Decimal(str(rate))
            product = (hours * rate).quantize(Decimal('0.01'))
            if product == cost:
                return {'labor_hours': hours, 'labor_rate': rate}
            return {'labor_hours': hours, 'labor_rate': (cost / hours).quantize(Decimal('0.01'))}
        return {
            'labor_hours': hours,
            'labor_rate': (cost / hours).quantize(Decimal('0.01')) if cost else Decimal('0'),
        }
    return {'quantity': Decimal('1'), 'unit_price': cost}


def scope_revenue_products_for_branch(queryset, branch=None):
    """Filter queryset to branch overrides + company-wide defaults."""
    branch_id = _branch_id(branch)
    if branch_id is None:
        return queryset.filter(branch__isnull=True)
    return queryset.filter(Q(branch_id=branch_id) | Q(branch__isnull=True))
