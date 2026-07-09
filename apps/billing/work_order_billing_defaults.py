"""Resolve default billable lines and prices for work orders."""

from __future__ import annotations

from decimal import Decimal

from apps.billing.revenue_resolution import (
    _active_product,
    build_invoice_line_fields,
    merge_labor_pricing_fields,
    resolve_revenue_product_by_id,
)
from apps.workorders.workflow_profile_service import get_profile_code

PROFILE_REVENUE_FALLBACK = {
    'inspection_only': 'service_vehicle_assessment',
    'diagnostic_only': 'service_diagnosis',
}


def _product_meta(revenue_product) -> dict:
    if revenue_product is None:
        return {
            'revenue_product': None,
            'revenue_product_code': None,
            'revenue_product_name': None,
            'owner_account_code': None,
        }
    return {
        'revenue_product': revenue_product.pk,
        'revenue_product_code': revenue_product.code,
        'revenue_product_name': revenue_product.name,
        'owner_account_code': revenue_product.owner_account_code or '',
    }


def resolve_default_revenue_product_for_work_order(work_order):
    """Pick the income category for flat-fee / simplified billing on this work order."""
    branch = getattr(work_order, 'branch', None)
    job_type = getattr(work_order, 'job_type', None)
    if job_type is not None:
        product = getattr(job_type, 'default_revenue_product', None)
        if product is not None and product.is_active:
            resolved = resolve_revenue_product_by_id(product.pk, branch=branch)
            if resolved:
                return resolved
        if job_type.default_revenue_product_id:
            resolved = resolve_revenue_product_by_id(job_type.default_revenue_product_id, branch=branch)
            if resolved:
                return resolved

    profile_code = get_profile_code(work_order)
    fallback_code = PROFILE_REVENUE_FALLBACK.get(profile_code or '')
    if fallback_code:
        return _active_product(branch=branch, code=fallback_code)
    return None


def resolve_unit_price_for_revenue_product(work_order, revenue_product) -> Decimal:
    """Resolve a billable unit price for a revenue product on this work order."""
    if revenue_product is None:
        return Decimal('0')

    job_type = getattr(work_order, 'job_type', None)
    if (
        job_type
        and job_type.default_service_fee
        and job_type.default_service_fee > 0
        and job_type.default_revenue_product_id
        and (
            revenue_product.pk == job_type.default_revenue_product_id
            or revenue_product.code == getattr(job_type.default_revenue_product, 'code', None)
        )
    ):
        return Decimal(str(job_type.default_service_fee)).quantize(Decimal('0.01'))

    if getattr(revenue_product, 'default_unit_price', None) and revenue_product.default_unit_price > 0:
        return Decimal(str(revenue_product.default_unit_price)).quantize(Decimal('0.01'))

    part = getattr(revenue_product, 'catalog_part', None)
    if part and (part.selling_price or Decimal('0')) > 0:
        return Decimal(str(part.selling_price)).quantize(Decimal('0.01'))

    for attr in ('actual_labor_cost', 'estimated_labor_cost', 'estimated_total', 'actual_total'):
        val = getattr(work_order, attr, None)
        if val and Decimal(str(val)) > 0:
            return Decimal(str(val)).quantize(Decimal('0.01'))

    from apps.billing.work_order_invoices import get_billable_estimate_for_work_order

    estimate = get_billable_estimate_for_work_order(work_order)
    if estimate and (estimate.total or Decimal('0')) > 0:
        return Decimal(str(estimate.total)).quantize(Decimal('0.01'))

    return Decimal('0')


def build_job_type_default_invoice_line_payloads(work_order) -> list[dict]:
    """Return a flat-fee invoice line when the job type (or profile) defines a default service."""
    from apps.workorders.workflow_profile_service import allows_simplified_completion

    profile_code = get_profile_code(work_order)
    if profile_code == 'diagnostic_only':
        from apps.billing.work_order_invoices import get_billable_estimate_for_work_order

        if get_billable_estimate_for_work_order(work_order):
            return []

    revenue_product = resolve_default_revenue_product_for_work_order(work_order)
    if revenue_product is None:
        return []

    # Full-repair jobs only get a default line when explicitly configured on the job type.
    job_type = getattr(work_order, 'job_type', None)
    if not allows_simplified_completion(work_order) and not (
        job_type and job_type.default_revenue_product_id
    ):
        return []

    unit_price = resolve_unit_price_for_revenue_product(work_order, revenue_product)
    wo_ref = work_order.work_order_number
    job_name = getattr(job_type, 'name', None) or revenue_product.name
    desc = f"{job_name} — WO {wo_ref}"[:500]
    item_type = (
        revenue_product.default_billing_line_type
        if revenue_product.default_billing_line_type
        else 'other'
    )
    line_fields = build_invoice_line_fields(
        revenue_product=revenue_product,
        description=desc,
        item_type=item_type,
    )
    payload = {
        'order': 0,
        'is_taxable': True,
        'discount_percentage': Decimal('0'),
        **line_fields,
        **_product_meta(revenue_product),
        **merge_labor_pricing_fields(cost=unit_price, hours=None, rate=None),
    }
    if payload.get('part') is not None:
        payload['part'] = payload['part'].pk
    return [payload]


# Backwards-compatible alias used by tests and imports.
build_profile_default_invoice_line_payloads = build_job_type_default_invoice_line_payloads
