"""Resolve owner-aligned revenue products for billing lines."""

from __future__ import annotations

from decimal import Decimal

from apps.accounting.models import RevenueProduct
from apps.inventory.part_catalog import billing_line_type_for_part


def _active_product(**filters):
    return (
        RevenueProduct.objects.filter(is_active=True, **filters)
        .select_related('catalog_part')
        .order_by('sort_order', 'id')
        .first()
    )


def resolve_revenue_product_for_task(task) -> RevenueProduct | None:
    """Map a work-order task to a revenue product."""
    revenue_product_id = getattr(task, 'revenue_product_id', None)
    if revenue_product_id:
        return (
            RevenueProduct.objects.filter(pk=revenue_product_id, is_active=True)
            .select_related('catalog_part')
            .first()
        )

    task_type_code = (getattr(task, 'task_type', '') or '').strip()
    if task_type_code:
        from apps.workorders.models import ServiceTaskType

        task_type = (
            ServiceTaskType.objects.filter(code=task_type_code, is_active=True)
            .select_related('revenue_product', 'revenue_product__catalog_part')
            .first()
        )
        if task_type and task_type.revenue_product_id and task_type.revenue_product.is_active:
            return task_type.revenue_product

    description = (getattr(task, 'description', '') or '').lower()
    keyword_map = (
        ('spray', 'labor_spraying'),
        ('paint', 'labor_spraying'),
        ('body', 'labor_body'),
        ('electrical', 'labor_electrical'),
        ('ac ', 'labor_ac'),
        ('a/c', 'labor_ac'),
        ('air con', 'labor_ac'),
        ('alignment', 'service_wheel_alignment'),
        ('diagnos', 'service_diagnosis'),
        ('assessment', 'service_vehicle_assessment'),
        ('program', 'service_vehicle_programming'),
        ('skim', 'service_vehicle_skimming'),
        ('sublet', 'sublet_general'),
        ('sub-contract', 'sublet_general'),
    )
    for keyword, code in keyword_map:
        if keyword in description:
            product = _active_product(code=code)
            if product:
                return product

    return _active_product(code='labor_mechanical')


def resolve_revenue_product_for_part(part) -> RevenueProduct | None:
    """Map an inventory catalog part to a revenue product."""
    if part is None:
        return _active_product(code='parts_general')

    if getattr(part, 'revenue_product_id', None):
        product = getattr(part, 'revenue_product', None)
        if product and product.is_active:
            return product

    category = getattr(part, 'category', None)
    if category is not None:
        if getattr(category, 'revenue_product_id', None):
            product = category.revenue_product
            if product and product.is_active:
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
                product = _active_product(code=code)
                if product:
                    return product

    return _active_product(code='parts_general')


def resolve_revenue_product_for_roadside(service_type: str) -> RevenueProduct | None:
    service_type = (service_type or '').strip()
    if service_type:
        product = _active_product(roadside_service_type=service_type)
        if product:
            return product
        if service_type == 'towing':
            return _active_product(code='aa_towing')
        if service_type in ('mechanical_first_aid', 'battery_boost', 'flat_tyre', 'key_lockout',
                            'emergency_fuel', 'extrication', 'accident_estimate', 'pre_purchase_inspection'):
            return _active_product(code='aa_outduty')
    return _active_product(code='aa_outduty')


def resolve_revenue_product_for_package(package) -> RevenueProduct | None:
    if package is None:
        return _active_product(code='aa_subscription')
    if getattr(package, 'revenue_product_id', None):
        product = package.revenue_product
        if product and product.is_active:
            return product
    return _active_product(code='aa_subscription')


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
