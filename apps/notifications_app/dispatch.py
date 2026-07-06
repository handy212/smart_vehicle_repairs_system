"""Schedule notification delivery — Celery when available, inline in dev/tests."""
from __future__ import annotations

import logging
import os
import sys

from django.conf import settings

logger = logging.getLogger(__name__)


def _in_test_context() -> bool:
    in_django_manage_test = len(sys.argv) >= 2 and sys.argv[1] == 'test'
    in_pytest = 'pytest' in sys.modules or bool(os.environ.get('PYTEST_CURRENT_TEST'))
    return in_django_manage_test or in_pytest


def notifications_async_enabled() -> bool:
    if _in_test_context():
        return False
    if getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False):
        return True
    return bool(getattr(settings, 'NOTIFICATIONS_ASYNC', not settings.DEBUG))


def dispatch_notification(notification_id: int) -> bool:
    """
    Queue notification delivery.

    Returns True when the caller should not send synchronously.
    """
    if not notifications_async_enabled():
        return False

    from .tasks import deliver_notification

    try:
        deliver_notification.delay(notification_id)
        return True
    except Exception as exc:
        logger.warning(
            'Celery unavailable for notification %s; caller will send inline: %s',
            notification_id,
            exc,
        )
        return False
