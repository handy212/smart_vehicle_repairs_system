"""Build invoice line payloads from a work order (preview + populate)."""

from __future__ import annotations

from decimal import Decimal

from apps.inventory.models import Part


def build_work_order_invoice_line_payloads(work_order) -> list[dict]:
    """Return invoice line dicts with revenue_product resolution (no DB writes)."""
    from apps.billing.revenue_resolution import (
        _active_product,
        build_invoice_line_fields,
        merge_labor_pricing_fields,
        resolve_revenue_product_for_part,
        resolve_revenue_product_for_task,
    )
    from apps.inventory.part_catalog import billing_line_type_for_part

    payloads: list[dict] = []
    wo = work_order
    order_idx = 0

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

    def add_labor_from_task(task, *, discontinued=False):
        nonlocal order_idx
        cost = task.labor_cost or Decimal('0')
        if cost <= 0:
            return
        wo_ref = wo.work_order_number
        if discontinued:
            desc = f"{task.description or 'Labor'} — WO {wo_ref} (customer discontinued; billable)"
        else:
            desc = f"{task.description or 'Labor'} — WO {wo_ref}"

        revenue_product = resolve_revenue_product_for_task(task)
        line_fields = build_invoice_line_fields(
            revenue_product=revenue_product,
            description=desc,
            item_type='labor',
        )
        payload = {
            'order': order_idx,
            'is_taxable': True,
            'discount_percentage': Decimal('0'),
            **line_fields,
            **_product_meta(revenue_product),
            **merge_labor_pricing_fields(
                cost=cost,
                hours=task.actual_hours or task.estimated_hours,
                rate=task.labor_rate,
            ),
        }
        if payload.get('part') is not None:
            payload['part'] = payload['part'].pk
        payloads.append(payload)
        order_idx += 1

    def add_part_line(work_order_part, *, discontinued=False):
        nonlocal order_idx
        sp = work_order_part.selling_price or Decimal('0')
        if sp <= 0:
            return
        qty = work_order_part.quantity or Decimal('1')
        unit = (sp / qty).quantize(Decimal('0.01')) if qty > 0 else sp
        suffix = ' (installed)' if not discontinued else ' (customer discontinued; billable)'
        desc = f"{work_order_part.part_name} — WO {wo.work_order_number}{suffix}"[:500]
        inventory_part = None
        if work_order_part.inventory_part_id:
            inventory_part = Part.objects.filter(pk=work_order_part.inventory_part_id).select_related(
                'category', 'category__revenue_product', 'revenue_product',
            ).first()
        revenue_product = resolve_revenue_product_for_part(inventory_part)
        part_item_type = (
            billing_line_type_for_part(inventory_part)
            if inventory_part is not None
            else 'part'
        )
        line_fields = build_invoice_line_fields(
            revenue_product=revenue_product,
            description=desc,
            inventory_part=inventory_part,
            item_type=part_item_type,
        )
        payload = {
            'order': order_idx,
            'quantity': qty,
            'unit_price': unit,
            'is_taxable': True,
            'discount_percentage': Decimal('0'),
            **line_fields,
            **_product_meta(revenue_product),
        }
        if payload.get('part') is not None:
            payload['part'] = payload['part'].pk
        payloads.append(payload)
        order_idx += 1

    if wo.status == 'discontinued_pending_bill':
        tasks_qs = wo.tasks.filter(
            is_workflow_task=False,
            status__in=['completed', 'skipped'],
        ).order_by('sequence_order', 'id')
        for task in tasks_qs:
            add_labor_from_task(task, discontinued=True)
        for work_order_part in wo.parts.filter(status='installed').order_by('id'):
            add_part_line(work_order_part, discontinued=True)
    else:
        tasks_qs = wo.tasks.filter(is_workflow_task=False).order_by('sequence_order', 'id')
        for task in tasks_qs:
            add_labor_from_task(task, discontinued=False)
        installed_part_lines = 0
        for work_order_part in wo.parts.filter(status='installed').order_by('id'):
            add_part_line(work_order_part)
            installed_part_lines += 1
        if installed_part_lines == 0:
            parts_sub = wo.actual_parts_cost or Decimal('0')
            if parts_sub > 0:
                revenue_product = _active_product(code='parts_general')
                line_fields = build_invoice_line_fields(
                    revenue_product=revenue_product,
                    description=f"Parts & materials — WO {wo.work_order_number}"[:500],
                )
                payload = {
                    'order': order_idx,
                    'quantity': Decimal('1'),
                    'unit_price': parts_sub,
                    'is_taxable': True,
                    'discount_percentage': Decimal('0'),
                    **line_fields,
                    **_product_meta(revenue_product),
                }
                if payload.get('part') is not None:
                    payload['part'] = payload['part'].pk
                payloads.append(payload)
                order_idx += 1

    if order_idx == 0:
        from apps.billing.profile_invoice_lines import build_profile_default_invoice_line_payloads
        from apps.workorders.workflow_profile_service import allows_simplified_completion

        profile_payloads = (
            build_profile_default_invoice_line_payloads(wo)
            if allows_simplified_completion(wo)
            else []
        )
        if profile_payloads:
            for idx, profile_payload in enumerate(profile_payloads):
                profile_payload['order'] = idx
                payloads.append(profile_payload)
        else:
            revenue_product = _active_product(code='labor_mechanical')
            line_fields = build_invoice_line_fields(
                revenue_product=revenue_product,
                description=f"Labor / services — WO {wo.work_order_number}"[:500],
                item_type='labor',
            )
            payload = {
                'order': 0,
                'quantity': Decimal('1'),
                'unit_price': Decimal('0'),
                'is_taxable': True,
                'discount_percentage': Decimal('0'),
                **line_fields,
                **_product_meta(revenue_product),
            }
            if payload.get('part') is not None:
                payload['part'] = payload['part'].pk
            payloads.append(payload)

    return payloads
