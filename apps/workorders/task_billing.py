"""Flat-fee billing helpers for service tasks."""

from __future__ import annotations

from decimal import Decimal


def resolve_flat_unit_price_for_task_type(task_type) -> Decimal:
    """Resolve the flat charge for a service task type."""
    if task_type is None:
        return Decimal('0')

    if task_type.default_labor_rate and task_type.default_labor_rate > 0:
        return Decimal(str(task_type.default_labor_rate)).quantize(Decimal('0.01'))

    product = getattr(task_type, 'revenue_product', None)
    if product and getattr(product, 'default_unit_price', None) and product.default_unit_price > 0:
        return Decimal(str(product.default_unit_price)).quantize(Decimal('0.01'))

    return Decimal('0')


def resolve_flat_unit_price_for_task(task) -> Decimal:
    """Resolve the flat charge for a service task."""
    if task is None:
        return Decimal('0')

    if task.labor_cost and task.labor_cost > 0:
        return Decimal(str(task.labor_cost)).quantize(Decimal('0.01'))

    task_type_code = (getattr(task, 'task_type', '') or '').strip()
    if task_type_code:
        from apps.workorders.models import ServiceTaskType

        task_type = (
            ServiceTaskType.objects.filter(code=task_type_code, is_active=True)
            .select_related('revenue_product', 'revenue_product__catalog_part')
            .first()
        )
        flat = resolve_flat_unit_price_for_task_type(task_type)
        if flat > 0:
            return flat

    revenue_product = getattr(task, 'revenue_product', None)
    if revenue_product and getattr(revenue_product, 'default_unit_price', None) and revenue_product.default_unit_price > 0:
        return Decimal(str(revenue_product.default_unit_price)).quantize(Decimal('0.01'))

    return Decimal('0')


def task_has_billable_charge(task) -> bool:
    return resolve_flat_unit_price_for_task(task) > 0


def task_uses_hourly_pricing(task) -> bool:
    """True only when both hours and an hourly rate are explicitly set."""
    hours = getattr(task, 'actual_hours', None) or getattr(task, 'estimated_hours', None)
    rate = getattr(task, 'labor_rate', None)
    return bool(hours and hours > 0 and rate and rate > 0)
