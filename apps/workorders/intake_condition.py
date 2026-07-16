"""
Job Card intake condition helpers.

Work-order fields are the source of truth for the customer Job Card.
Completed / approved DVI results can prefill battery + warning lights
when those checklist items exist on the linked inspection template.
"""
from __future__ import annotations

from typing import Any, Iterable, Optional

from django.db.models import Prefetch

# Match InspectionItem.name (case-insensitive substring / exact-ish).
WARNING_LIGHT_ITEM_MATCHERS = (
    'dashboard warning light',
    'warning light',
    'airbag warning',
    'abs warning',
    'check engine light',
    'malfunction indicator',
)

BATTERY_ITEM_MATCHERS = (
    'battery condition',
    'battery terminal',
    'battery voltage',
    'battery',
)

# Prefer stronger / more specific battery matches first.
BATTERY_ITEM_PRIORITY = (
    'battery condition',
    'battery voltage',
    'battery terminal',
    'battery',
)

FUEL_LEVEL_VALUES = {
    'empty', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8', 'full', 'unknown',
}
BATTERY_CONDITION_VALUES = {
    'good', 'weak', 'dead', 'replaced', 'unknown',
}


def _normalize_name(name: str) -> str:
    return (name or '').strip().lower()


def _item_matches(name: str, matchers: Iterable[str]) -> bool:
    normalized = _normalize_name(name)
    if not normalized:
        return False
    return any(token in normalized for token in matchers)


def _format_result_text(result) -> str:
    """Human-readable summary of an inspection result for Job Card notes."""
    parts: list[str] = []
    status = getattr(result, 'result', None) or ''
    if status and status not in ('not_checked', 'not_applicable'):
        display = result.get_result_display() if hasattr(result, 'get_result_display') else status
        parts.append(str(display))

    condition = getattr(result, 'condition', None)
    if condition:
        display = (
            result.get_condition_display()
            if hasattr(result, 'get_condition_display')
            else condition
        )
        parts.append(str(display))

    rating = getattr(result, 'rating_value', None)
    if rating:
        parts.append(f'{rating}/5')

    text_note = (getattr(result, 'text_note', None) or '').strip()
    if text_note:
        parts.append(text_note)

    recommendation = (getattr(result, 'recommendation', None) or '').strip()
    if recommendation:
        parts.append(recommendation)

    if getattr(result, 'needs_immediate_attention', False):
        parts.append('Needs immediate attention')

    return ' — '.join(parts).strip()


def _map_battery_choice(text: str) -> str:
    """Map free-form DVI battery notes onto WorkOrder.battery_condition choices."""
    lowered = (text or '').strip().lower()
    if not lowered:
        return ''
    if any(token in lowered for token in ('dead', 'no crank', 'jump', '0/5', '1/5')):
        return 'dead'
    if any(token in lowered for token in ('weak', 'low', 'fair', 'poor', '2/5', '3/5')):
        return 'weak'
    if any(token in lowered for token in ('replaced', 'new battery')):
        return 'replaced'
    if any(token in lowered for token in ('good', 'excellent', 'pass', 'ok', '4/5', '5/5')):
        return 'good'
    if 'unknown' in lowered:
        return 'unknown'
    return ''


def extract_intake_from_inspection(inspection) -> dict[str, str]:
    """
    Pull warning-light / battery summaries from inspection results.

    Returns only keys that had usable findings.
    """
    if inspection is None:
        return {}

    results = getattr(inspection, 'results', None)
    if results is None:
        return {}

    qs = results.select_related('inspection_item')
    if hasattr(results, 'all'):
        # Already prefetched queryset / related manager
        pass

    warning_bits: list[str] = []
    battery_candidates: list[tuple[int, str]] = []

    for result in qs.all() if hasattr(qs, 'all') else qs:
        item = getattr(result, 'inspection_item', None)
        item_name = getattr(item, 'name', '') if item else ''
        summary = _format_result_text(result)
        if not summary:
            continue

        if _item_matches(item_name, WARNING_LIGHT_ITEM_MATCHERS):
            warning_bits.append(f'{item_name}: {summary}' if item_name else summary)

        if _item_matches(item_name, BATTERY_ITEM_MATCHERS):
            normalized = _normalize_name(item_name)
            priority = next(
                (i for i, token in enumerate(BATTERY_ITEM_PRIORITY) if token in normalized),
                len(BATTERY_ITEM_PRIORITY),
            )
            battery_candidates.append((priority, summary if not item_name else f'{item_name}: {summary}'))

    payload: dict[str, str] = {}
    if warning_bits:
        # Prefer explicit dashboard/warning lights notes; keep compact.
        payload['warning_lights_notes'] = '; '.join(warning_bits[:6])

    if battery_candidates:
        battery_candidates.sort(key=lambda row: row[0])
        best_text = battery_candidates[0][1]
        choice = _map_battery_choice(best_text)
        if choice:
            payload['battery_condition'] = choice
        # Always keep free-form in warning-style note only for battery choice map;
        # if we couldn't map, leave battery empty (staff can set on intake).
        if not choice and best_text:
            # Fall back: store description into warning lights only when no battery choice?
            # Prefer attaching unmapped battery detail as part of warning only if empty —
            # instead leave battery_condition blank so UI stays in choice set.
            pass

    return payload


def apply_dvi_intake_prefill(
    work_order,
    inspection,
    *,
    overwrite: bool = False,
    save: bool = True,
) -> list[str]:
    """
    Prefill empty (or all, if overwrite) Job Card intake fields from DVI.

    Returns list of field names that were updated.
    """
    if not work_order or not inspection:
        return []

    extracted = extract_intake_from_inspection(inspection)
    if not extracted:
        return []

    updated: list[str] = []
    for field, value in extracted.items():
        if not value:
            continue
        current = (getattr(work_order, field, None) or '').strip()
        if current and not overwrite:
            continue
        setattr(work_order, field, value)
        updated.append(field)

    if updated and save:
        work_order.save(update_fields=[*updated, 'updated_at'] if hasattr(work_order, 'updated_at') else updated)

    return updated


def latest_linked_inspection(work_order):
    """Latest completed/approved inspection for a work order, else latest any."""
    if work_order is None:
        return None
    inspections = getattr(work_order, 'inspections', None)
    if inspections is None:
        return None
    done = inspections.filter(status__in=['completed', 'approved']).order_by('-completed_at', '-id').first()
    if done:
        return done
    return inspections.order_by('-id').first()
