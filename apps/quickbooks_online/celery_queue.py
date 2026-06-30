"""Celery queue helpers for QuickBooks outbound sync."""
from __future__ import annotations

import logging

from django.conf import settings

logger = logging.getLogger(__name__)

QBO_OUTBOUND_QUEUE = 'qbo'
DEFAULT_CELERY_QUEUE = 'celery'


def _redis_client():
    import redis

    broker_url = getattr(settings, 'CELERY_BROKER_URL', 'redis://localhost:6379/0')
    return redis.from_url(broker_url)


def celery_queue_depth(queue_name: str = DEFAULT_CELERY_QUEUE) -> int:
    """Return the number of tasks waiting in a Redis-backed Celery queue."""
    try:
        return int(_redis_client().llen(queue_name))
    except Exception as exc:
        logger.debug('Could not read Celery queue depth for %s: %s', queue_name, exc)
        return 0


def outbound_queue_backlog() -> int:
    """Combined depth of the dedicated QBO queue and the default Celery queue."""
    return celery_queue_depth(QBO_OUTBOUND_QUEUE) + celery_queue_depth(DEFAULT_CELERY_QUEUE)


def outbound_queue_overloaded() -> bool:
    limit = int(getattr(settings, 'QUICKBOOKS_OUTBOUND_QUEUE_DEPTH_LIMIT', 40))
    depth = outbound_queue_backlog()
    if depth > limit:
        logger.info(
            '[QBO Outbound] Queue backlog %s exceeds limit %s — throttling bulk retry.',
            depth,
            limit,
        )
        return True
    return False
