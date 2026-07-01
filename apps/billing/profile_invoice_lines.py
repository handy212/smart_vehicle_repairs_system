"""Default billable lines for simplified workflow profiles (inspection / diagnostic-only)."""

from __future__ import annotations

from decimal import Decimal

from apps.billing.revenue_resolution import (
    _active_product,
    build_invoice_line_fields,
    merge_labor_pricing_fields,
)
from apps.workorders.workflow_profile_service import get_profile_code

PROFILE_REVENUE_PRODUCT = {
    'inspection_only': ('service_vehicle_assessment', 'Vehicle inspection'),
    'diagnostic_only': ('service_diagnosis', 'Diagnostic service'),
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


def _resolve_unit_price(work_order, *, revenue_product) -> Decimal:
    part = getattr(revenue_product, 'catalog_part', None) if revenue_product else None
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


def build_profile_default_invoice_line_payloads(work_order) -> list[dict]:
    """Return invoice line dicts for inspection-only / diagnostic-only jobs with no tasks."""
    profile_code = get_profile_code(work_order)
    if profile_code not in PROFILE_REVENUE_PRODUCT:
        return []

    if profile_code == 'diagnostic_only':
        from apps.billing.work_order_invoices import get_billable_estimate_for_work_order

        if get_billable_estimate_for_work_order(work_order):
            return []

    product_code, service_label = PROFILE_REVENUE_PRODUCT[profile_code]
    revenue_product = _active_product(code=product_code)
    unit_price = _resolve_unit_price(work_order, revenue_product=revenue_product)
    wo_ref = work_order.work_order_number
    job_name = getattr(getattr(work_order, 'job_type', None), 'name', None) or service_label
    desc = f"{job_name} — WO {wo_ref}"[:500]
    item_type = (
        revenue_product.default_billing_line_type
        if revenue_product and revenue_product.default_billing_line_type
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
