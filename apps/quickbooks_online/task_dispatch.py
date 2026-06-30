"""Schedule QuickBooks outbound sync — Celery when available, inline in dev/tests."""
from __future__ import annotations

import logging
import os
import sys
import threading

from django.conf import settings
from django.db import close_old_connections, transaction

from .celery_queue import QBO_OUTBOUND_QUEUE
from .sync_guard import mark_mapping_pending_for_entity, should_debounce_part_sync

logger = logging.getLogger(__name__)


def _auto_sync_enabled() -> bool:
    return getattr(settings, 'QUICKBOOKS_AUTO_SYNC_ENABLED', True)


def _in_test_context() -> bool:
    in_django_manage_test = len(sys.argv) >= 2 and sys.argv[1] == 'test'
    in_pytest = 'pytest' in sys.modules or bool(os.environ.get('PYTEST_CURRENT_TEST'))
    return in_django_manage_test or in_pytest


def _sync_inline() -> bool:
    if getattr(settings, 'QUICKBOOKS_SYNC_INLINE', None) is not None:
        return bool(settings.QUICKBOOKS_SYNC_INLINE)
    if getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False):
        return True
    return bool(getattr(settings, 'DEBUG', False)) or _in_test_context()


def _run_sync_task(entity_type: str, object_id: int, task) -> None:
    """Execute a sync task without blocking the HTTP response in dev."""
    mark_mapping_pending_for_entity(entity_type, object_id)

    if _sync_inline() and not _in_test_context():
        def worker():
            close_old_connections()
            try:
                task(object_id)
            except Exception as exc:
                logger.error(
                    'Background QBO sync failed for %s %s: %s',
                    entity_type,
                    object_id,
                    exc,
                )
            finally:
                close_old_connections()

        threading.Thread(
            target=worker,
            name=f'qbo-sync-{entity_type}-{object_id}',
            daemon=True,
        ).start()
        return

    if _sync_inline():
        try:
            task(object_id)
        except Exception as exc:
            logger.error('Inline QBO sync failed for %s %s: %s', entity_type, object_id, exc)
        return

    try:
        task.apply_async(args=[object_id], queue=QBO_OUTBOUND_QUEUE)
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


def schedule_entity_sync(entity_type: str, object_id: int, *, task):
    """
    Queue outbound QBO sync after the current DB transaction commits.

    In DEBUG without Celery, sync runs in a background thread so API requests
    (e.g. POST /api/billing/estimates/) return immediately instead of waiting
    on QuickBooks HTTP calls.
    """
    if not object_id or not _auto_sync_enabled():
        return

    transaction.on_commit(lambda: _run_sync_task(entity_type, object_id, task))


def schedule_part_sync(part_id: int):
    from .tasks import task_sync_part_to_qbo

    if should_debounce_part_sync(part_id):
        logger.debug('Debouncing duplicate QBO part sync for Part %s', part_id)
        return
    schedule_entity_sync('part', part_id, task=task_sync_part_to_qbo)
