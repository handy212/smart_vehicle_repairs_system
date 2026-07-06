"""Outbound sync locking and in-flight state to prevent duplicate QBO entities."""
from __future__ import annotations

import logging
from contextlib import contextmanager

from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache

from .models import QBOMapping

logger = logging.getLogger(__name__)

LOCK_TTL_SECONDS = 120
PART_DEBOUNCE_SECONDS = 5


def _lock_key(entity_type: str, object_id: int) -> str:
    return f'qbo:outbound-lock:{entity_type}:{object_id}'


@contextmanager
def outbound_sync_lock(entity_type: str, object_id: int):
    """
    Ensure only one outbound sync runs per local entity at a time.

    Uses the Django cache backend (Redis in production). When the lock is held,
    concurrent sync attempts are skipped rather than creating duplicate QBO rows.
    """
    key = _lock_key(entity_type, object_id)
    acquired = cache.add(key, '1', LOCK_TTL_SECONDS)
    if not acquired:
        logger.info(
            'Skipping duplicate QBO outbound sync — lock held for %s %s',
            entity_type,
            object_id,
        )
        yield False
        return
    try:
        yield True
    finally:
        cache.delete(key)


def mark_mapping_pending(local_obj) -> None:
    QBOMapping.objects.update_or_create(
        content_type=ContentType.objects.get_for_model(local_obj),
        object_id=local_obj.id,
        defaults={'status': 'pending', 'error_message': ''},
    )


def mark_mapping_pending_for_entity(entity_type: str, object_id: int) -> None:
    """
    Mark a mapping pending as soon as outbound sync is scheduled.

    Shows QBO: pending in the UI immediately instead of un-synced while Celery
  waits in the queue.
    """
    if not object_id:
        return

    from django.apps import apps

    from .outbound_entities import OUTBOUND_SYNC_ENTITIES

    # Chained invoice finalization syncs the invoice row.
    if entity_type == 'invoice_finalize':
        entity_type = 'invoice'

    cfg = OUTBOUND_SYNC_ENTITIES.get(entity_type)
    if not cfg:
        return

    model = apps.get_model(cfg['app_label'], cfg['model_name'])
    try:
        instance = model.objects.get(pk=object_id)
    except model.DoesNotExist:
        return

    mark_mapping_pending(instance)


def should_debounce_part_sync(part_id: int) -> bool:
    """Coalesce rapid part saves + stock updates into one outbound sync."""
    key = f'qbo:part-debounce:{part_id}'
    if cache.get(key):
        return True
    cache.set(key, '1', PART_DEBOUNCE_SECONDS)
    return False
