"""Change Data Capture (CDC) safety net for missed QBO webhook events."""

from __future__ import annotations

import logging
from datetime import timedelta

from django.utils import timezone

logger = logging.getLogger(__name__)

CDC_ENTITY_TO_WEBHOOK_NAME = {
    'Invoice': 'invoice',
    'Payment': 'payment',
    'Bill': 'bill',
    'BillPayment': 'billpayment',
    'Estimate': 'estimate',
    'CreditMemo': 'creditmemo',
    'VendorCredit': 'vendorcredit',
    'Vendor': 'vendor',
    'Item': 'item',
}

CDC_QBO_CLASSES = None


def _cdc_qbo_classes():
    global CDC_QBO_CLASSES
    if CDC_QBO_CLASSES is not None:
        return CDC_QBO_CLASSES

    try:
        from quickbooks.objects.bill import Bill
        from quickbooks.objects.billpayment import BillPayment
        from quickbooks.objects.creditmemo import CreditMemo
        from quickbooks.objects.estimate import Estimate
        from quickbooks.objects.invoice import Invoice
        from quickbooks.objects.item import Item
        from quickbooks.objects.payment import Payment
        from quickbooks.objects.vendor import Vendor
        from quickbooks.objects.vendorcredit import VendorCredit
    except ModuleNotFoundError:
        CDC_QBO_CLASSES = []
        return CDC_QBO_CLASSES

    CDC_QBO_CLASSES = [
        Invoice,
        Payment,
        Bill,
        BillPayment,
        Estimate,
        CreditMemo,
        VendorCredit,
        Vendor,
        Item,
    ]
    return CDC_QBO_CLASSES


def _cdc_changed_since():
    """Look back to the last successful inbound sync, bounded by QBO's 30-day CDC window."""
    from .models import QBOSyncLog

    now = timezone.now()
    earliest = now - timedelta(days=30)
    default_lookback = now - timedelta(hours=6)

    last_success = (
        QBOSyncLog.objects.filter(direction='inbound', status='success')
        .order_by('-finished_at')
        .values_list('finished_at', flat=True)
        .first()
    )
    if last_success:
        # Small overlap avoids missing changes at the boundary.
        changed_since = last_success - timedelta(minutes=5)
    else:
        changed_since = default_lookback

    return max(changed_since, earliest)


def run_cdc_and_queue_inbound_pulls(service) -> dict:
    """
    Run QBO CDC and queue debounced inbound pulls for entity types that changed.

    Intuit recommends CDC as a complement to webhooks for missed events.
    """
    from quickbooks.cdc import change_data_capture

    from .models import QBOSyncLog
    from .webhook_dispatch import queue_inbound_pull_for_entity

    classes = _cdc_qbo_classes()
    if not classes:
        return {'queued': [], 'skipped': 'sdk_unavailable'}

    client = service.get_client()
    if not client:
        return {'queued': [], 'skipped': 'not_connected'}

    changed_since = _cdc_changed_since()
    log = QBOSyncLog.objects.create(
        entity_type='all',
        direction='inbound',
        triggered_by=None,
    )

    queued: list[str] = []
    try:
        response = change_data_capture(classes, changed_since, qb=client)
        for qbo_name, webhook_name in CDC_ENTITY_TO_WEBHOOK_NAME.items():
            query_response = getattr(response, qbo_name, None)
            if not query_response:
                continue
            object_list = getattr(query_response, '_object_list', None) or []
            if object_list and queue_inbound_pull_for_entity(webhook_name):
                queued.append(webhook_name)

        log.records_pulled = len(queued)
        log.records_updated = len(queued)
        log.status = 'success'
        log.finished_at = timezone.now()
        log.save(update_fields=['records_pulled', 'records_updated', 'status', 'finished_at'])
        logger.info('[QBO CDC] Queued inbound pulls for: %s (since %s)', queued, changed_since)
        return {'queued': queued, 'changed_since': changed_since.isoformat()}
    except Exception as exc:
        log.status = 'failed'
        log.error_message = str(exc)
        log.finished_at = timezone.now()
        log.save(update_fields=['status', 'error_message', 'finished_at'])
        logger.error('[QBO CDC] Failed: %s', exc, exc_info=True)
        raise
