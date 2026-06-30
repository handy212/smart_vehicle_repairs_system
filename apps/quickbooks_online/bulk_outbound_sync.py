"""Collect and queue eligible outbound QuickBooks syncs in bulk."""

from __future__ import annotations

import logging
from typing import Iterable

from django.apps import apps
from django.conf import settings
from django.contrib.contenttypes.models import ContentType

from .models import QBOMapping
from .outbound_entities import OUTBOUND_SYNC_ENTITIES
from .sync_policy import outbound_eligibility_reason

logger = logging.getLogger(__name__)

# Lower numbers sync first (vendors before bills before payments).
OUTBOUND_SYNC_PRIORITY = {
    'branch': 10,
    'customer': 20,
    'supplier': 20,
    'part': 30,
    'estimate': 40,
    'invoice': 50,
    'purchase_order': 50,
    'vendor_bill': 60,
    'vendor_expense': 65,
    'vendor_credit': 65,
    'credit_note': 65,
    'payment': 70,
    'bill_payment': 80,
}


def _sort_candidates_by_dependency(candidates):
    return sorted(
        candidates,
        key=lambda item: (OUTBOUND_SYNC_PRIORITY.get(item[0], 50), item[1]),
    )

_CONTENT_TYPE_ENTITY_MAP: dict[int, tuple[str, dict]] | None = None


def _content_type_entity_map() -> dict[int, tuple[str, dict]]:
    global _CONTENT_TYPE_ENTITY_MAP
    if _CONTENT_TYPE_ENTITY_MAP is None:
        mapping: dict[int, tuple[str, dict]] = {}
        for entity_type, cfg in OUTBOUND_SYNC_ENTITIES.items():
            model = apps.get_model(cfg['app_label'], cfg['model_name'])
            ct = ContentType.objects.get_for_model(model)
            mapping[ct.id] = (entity_type, cfg)
        _CONTENT_TYPE_ENTITY_MAP = mapping
    return _CONTENT_TYPE_ENTITY_MAP


def collect_outbound_sync_candidates(
    *,
    statuses: Iterable[str] = ('failed', 'pending'),
    entity_types: Iterable[str] | None = None,
    limit: int | None = None,
):
    """
    Return (candidates, skipped) where each candidate is
    (entity_type, object_id, entity_config).
    """
    status_list = list(statuses)
    if not status_list:
        return [], []

    allowed_types = set(entity_types) if entity_types else None
    ct_map = _content_type_entity_map()
    queryset = (
        QBOMapping.objects.filter(status__in=status_list)
        .select_related('content_type')
        .order_by('last_synced_at')
    )
    if limit:
        queryset = queryset[:limit]

    candidates = []
    skipped = []
    model_cache: dict[tuple[str, str], type] = {}

    for mapping in queryset.iterator():
        entry = ct_map.get(mapping.content_type_id)
        if not entry:
            continue

        entity_type, cfg = entry
        if allowed_types is not None and entity_type not in allowed_types:
            continue

        model_key = (cfg['app_label'], cfg['model_name'])
        if model_key not in model_cache:
            model_cache[model_key] = apps.get_model(*model_key)
        model = model_cache[model_key]

        try:
            instance = model.objects.get(pk=mapping.object_id)
        except model.DoesNotExist:
            skipped.append({
                'entity_type': entity_type,
                'object_id': mapping.object_id,
                'reason': 'Local record no longer exists.',
            })
            continue

        eligible, reason = outbound_eligibility_reason(entity_type, instance)
        if eligible:
            candidates.append((entity_type, instance.id, cfg))
        else:
            skipped.append({
                'entity_type': entity_type,
                'object_id': instance.id,
                'reason': reason,
            })

    return _sort_candidates_by_dependency(candidates), skipped


def count_pending_outbound_syncs() -> dict[str, int]:
    """Counts mappings and how many are currently eligible for outbound sync."""
    candidates_failed, _ = collect_outbound_sync_candidates(statuses=('failed',))
    candidates_pending, _ = collect_outbound_sync_candidates(statuses=('pending',))
    return {
        'failed_mappings': QBOMapping.objects.filter(status='failed').count(),
        'pending_mappings': QBOMapping.objects.filter(status='pending').count(),
        'eligible_failed': len(candidates_failed),
        'eligible_pending': len(candidates_pending),
        'eligible_total': len(candidates_failed) + len(candidates_pending),
    }


def queue_outbound_sync_candidates(candidates) -> int:
    """Queue Celery (or inline) sync for each candidate. Returns count queued."""
    from . import tasks as qbo_tasks
    from .task_dispatch import schedule_entity_sync

    queued = 0
    for entity_type, object_id, cfg in candidates:
        task = getattr(qbo_tasks, cfg['task_name'])
        schedule_entity_sync(entity_type, object_id, task=task)
        queued += 1
    return queued


def retry_failed_outbound_syncs():
    """Queue sync for failed mappings that are currently eligible."""
    batch_size = int(getattr(settings, 'QUICKBOOKS_RETRY_FAILED_BATCH_SIZE', 100))
    candidates, skipped = collect_outbound_sync_candidates(
        statuses=('failed',),
        limit=batch_size,
    )
    queued = queue_outbound_sync_candidates(candidates)
    logger.info(
        '[QBO Outbound] Retry failed syncs: queued=%s, skipped_ineligible=%s',
        queued,
        len(skipped),
    )
    return queued, skipped


def sync_all_pending_outbound(*, include_failed: bool = True, include_pending: bool = True):
    """Queue all eligible failed/pending mappings for outbound sync."""
    statuses = []
    if include_failed:
        statuses.append('failed')
    if include_pending:
        statuses.append('pending')
    candidates, skipped = collect_outbound_sync_candidates(statuses=statuses)
    queued = queue_outbound_sync_candidates(candidates)
    return queued, skipped
