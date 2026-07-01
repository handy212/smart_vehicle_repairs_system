"""Debounced webhook → Celery dispatch for QBO inbound pulls.

Intuit recommends responding to webhooks within 3 seconds and processing
asynchronously. Rapid edits can trigger many notifications for the same
entity type; debouncing coalesces those into one pull per entity per window.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

DEFAULT_DEBOUNCE_SECONDS = 30

# QBO webhook entity `name` (lowercase) → Celery task attribute on tasks module.
INBOUND_WEBHOOK_HANDLERS: dict[str, str] = {
    'invoice': 'task_pull_invoices_from_qbo',
    'payment': 'task_pull_invoices_from_qbo',
    'vendor': 'task_pull_vendors_from_qbo',
    'supplier': 'task_pull_vendors_from_qbo',
    'bill': 'task_pull_bills_from_qbo',
    'billpayment': 'task_pull_bill_payments_from_qbo',
    'bill_payment': 'task_pull_bill_payments_from_qbo',
    'estimate': 'task_pull_estimates_from_qbo',
    'creditmemo': 'task_pull_credit_memos_from_qbo',
    'credit_memo': 'task_pull_credit_memos_from_qbo',
    'vendorcredit': 'task_pull_vendor_credits_from_qbo',
    'vendor_credit': 'task_pull_vendor_credits_from_qbo',
    'item': 'task_pull_items_from_qbo',
}


def _debounce_seconds() -> int:
    return int(getattr(settings, 'QUICKBOOKS_WEBHOOK_DEBOUNCE_SECONDS', DEFAULT_DEBOUNCE_SECONDS))


def normalize_webhook_entity_name(entity_name: str) -> str:
    return (entity_name or '').strip().lower().replace(' ', '_')


def queue_inbound_pull_for_entity(entity_name: str) -> bool:
    """
    Queue a debounced inbound pull for a QBO webhook entity type.

    Returns True when a new Celery task was queued, False when debounced or
    the entity type has no inbound handler.
    """
    normalized = normalize_webhook_entity_name(entity_name)
    task_attr = INBOUND_WEBHOOK_HANDLERS.get(normalized)
    if not task_attr:
        return False

    debounce_seconds = _debounce_seconds()
    cache_key = f'qbo:webhook-debounce:{normalized}'
    if not cache.add(cache_key, '1', debounce_seconds):
        logger.debug('QBO webhook: debouncing duplicate %s pull', normalized)
        return False

    from . import tasks as qbo_tasks

    task = getattr(qbo_tasks, task_attr)
    task.delay()
    logger.info('QBO webhook: queued inbound %s pull (debounce=%ss)', normalized, debounce_seconds)
    return True
