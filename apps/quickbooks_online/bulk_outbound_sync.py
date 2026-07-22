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
    'inventory_adjustment': 55,
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


def collect_never_synced_candidates(
    *,
    entity_types: Iterable[str] | None = None,
    limit: int | None = None,
):
    """
    Eligible local records that have no QBOMapping row yet.

    These never appear in Push Pending (that only retries existing mappings).
    """
    types = list(entity_types) if entity_types else ['customer']
    candidates = []
    skipped = []

    for entity_type in types:
        cfg = OUTBOUND_SYNC_ENTITIES.get(entity_type)
        if not cfg:
            continue
        model = apps.get_model(cfg['app_label'], cfg['model_name'])
        ct = ContentType.objects.get_for_model(model)
        mapped_ids = QBOMapping.objects.filter(content_type=ct).values_list(
            'object_id', flat=True,
        )
        queryset = model.objects.exclude(pk__in=mapped_ids).order_by('pk')
        remaining = None if limit is None else max(limit - len(candidates), 0)
        if remaining is not None:
            if remaining <= 0:
                break
            queryset = queryset[:remaining]

        for instance in queryset.iterator(chunk_size=500):
            eligible, reason = outbound_eligibility_reason(entity_type, instance)
            if eligible:
                candidates.append((entity_type, instance.id, cfg))
                if limit is not None and len(candidates) >= limit:
                    break
            else:
                skipped.append({
                    'entity_type': entity_type,
                    'object_id': instance.id,
                    'reason': reason,
                })
        if limit is not None and len(candidates) >= limit:
            break

    return _sort_candidates_by_dependency(candidates), skipped


def count_never_synced(*, entity_types: Iterable[str] | None = None) -> dict[str, int]:
    """Approximate eligible never-synced counts by entity (skips full eligibility scan)."""
    types = list(entity_types) if entity_types else list(OUTBOUND_SYNC_ENTITIES.keys())
    counts: dict[str, int] = {}
    for entity_type in types:
        cfg = OUTBOUND_SYNC_ENTITIES.get(entity_type)
        if not cfg:
            continue
        model = apps.get_model(cfg['app_label'], cfg['model_name'])
        ct = ContentType.objects.get_for_model(model)
        mapped_ids = QBOMapping.objects.filter(content_type=ct).values_list(
            'object_id', flat=True,
        )
        qs = model.objects.exclude(pk__in=mapped_ids)
        # Fast path for customers: customer_number required
        if entity_type == 'customer':
            qs = qs.exclude(customer_number__isnull=True).exclude(customer_number='')
        counts[entity_type] = qs.count()
    return counts


def queue_outbound_sync_candidates(candidates, *, stagger_seconds: float = 0) -> int:
    """Queue Celery (or inline) sync for each candidate. Returns count queued."""
    from . import tasks as qbo_tasks
    from .celery_queue import QBO_OUTBOUND_QUEUE
    from .sync_guard import mark_mapping_pending_for_entity
    from .task_dispatch import _auto_sync_enabled, _sync_inline, schedule_entity_sync

    if not candidates:
        return 0

    # Small batches / interactive paths keep the normal on_commit helper.
    if stagger_seconds <= 0 and len(candidates) <= 50:
        queued = 0
        for entity_type, object_id, cfg in candidates:
            task = getattr(qbo_tasks, cfg['task_name'])
            schedule_entity_sync(entity_type, object_id, task=task)
            queued += 1
        return queued

    if not _auto_sync_enabled():
        return 0

    queued = 0
    for index, (entity_type, object_id, cfg) in enumerate(candidates):
        task = getattr(qbo_tasks, cfg['task_name'])
        mark_mapping_pending_for_entity(entity_type, object_id)
        countdown = int(index * stagger_seconds) if stagger_seconds > 0 else 0
        if _sync_inline():
            try:
                task(object_id)
            except Exception as exc:
                logger.error(
                    'Inline QBO sync failed for %s %s: %s',
                    entity_type,
                    object_id,
                    exc,
                )
        else:
            try:
                task.apply_async(
                    args=[object_id],
                    queue=QBO_OUTBOUND_QUEUE,
                    countdown=countdown,
                )
            except Exception as exc:
                logger.warning(
                    'Celery unavailable for QBO %s %s; running inline: %s',
                    entity_type,
                    object_id,
                    exc,
                )
                try:
                    task(object_id)
                except Exception as inline_exc:
                    logger.error('Fallback inline QBO sync failed: %s', inline_exc)
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


def sync_all_pending_outbound(
    *,
    include_failed: bool = True,
    include_pending: bool = True,
    include_never_synced: bool = False,
    entity_types: Iterable[str] | None = None,
    never_synced_limit: int | None = None,
    stagger_seconds: float = 0.5,
):
    """
    Queue outbound syncs.

    - failed/pending: existing QBOMapping rows
    - never_synced: local records with no mapping yet (e.g. imported customers)
    """
    statuses = []
    if include_failed:
        statuses.append('failed')
    if include_pending:
        statuses.append('pending')

    candidates = []
    skipped = []
    if statuses:
        mapped_candidates, mapped_skipped = collect_outbound_sync_candidates(
            statuses=statuses,
            entity_types=entity_types,
        )
        candidates.extend(mapped_candidates)
        skipped.extend(mapped_skipped)

    never_queued = 0
    if include_never_synced:
        never_candidates, never_skipped = collect_never_synced_candidates(
            entity_types=entity_types or ['customer'],
            limit=never_synced_limit,
        )
        skipped.extend(never_skipped)
        never_queued = queue_outbound_sync_candidates(
            never_candidates,
            stagger_seconds=stagger_seconds,
        )
        # Avoid double-queueing the same ids if somehow also pending
        never_ids = {(et, oid) for et, oid, _ in never_candidates}
        candidates = [
            c for c in candidates if (c[0], c[1]) not in never_ids
        ]

    mapped_queued = queue_outbound_sync_candidates(candidates)
    return mapped_queued + never_queued, skipped
