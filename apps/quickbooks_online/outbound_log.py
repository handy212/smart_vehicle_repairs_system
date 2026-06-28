"""Helpers for recording outbound QuickBooks sync runs."""

import logging
import threading

from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.db import close_old_connections
from django.utils import timezone

from .models import QBOMapping, QBOSyncLog

logger = logging.getLogger(__name__)

RETRY_DELAY_SECONDS = 5
RETRY_CACHE_TTL = 30

ENTITY_LOG_TYPES = {
    'customer': 'customer',
    'invoice': 'invoice',
    'payment': 'payment',
    'supplier': 'vendor',
    'purchase_order': 'bill',
    'estimate': 'estimate',
    'credit_note': 'credit_memo',
    'vendor_bill': 'vendor_bill',
    'vendor_credit': 'vendor_credit',
    'bill_payment': 'payment',
    'vendor_expense': 'vendor_bill',
    'part': 'item',
}


def get_mapping_error(instance):
    mapping = QBOMapping.objects.filter(
        content_type=ContentType.objects.get_for_model(instance),
        object_id=instance.id,
    ).first()
    return (mapping.error_message or '').strip() if mapping else ''


def record_outbound_sync(entity_type, *, success, error_message=''):
    """Persist a single-entity outbound sync result when the entity type is logged."""
    log_entity = ENTITY_LOG_TYPES.get(entity_type)
    if not log_entity:
        return None

    log = QBOSyncLog.objects.create(
        entity_type=log_entity,
        direction='outbound',
    )
    if success:
        log.records_updated = 1
        log.status = 'success'
    else:
        log.status = 'failed'
        log.error_message = error_message or 'Sync returned no result from QuickBooks.'
    log.finished_at = timezone.now()
    log.save(update_fields=['records_updated', 'status', 'error_message', 'finished_at'])
    return log


def _schedule_outbound_retry(
    entity_type,
    object_id,
    app_label,
    model_name,
    service_method_name,
):
    """Retry once when a concurrent sync holds the outbound lock (e.g. sent then approved)."""
    cache_key = f'qbo:outbound-retry:{entity_type}:{object_id}'
    if cache.get(cache_key):
        return
    cache.set(cache_key, '1', RETRY_CACHE_TTL)

    def _retry():
        close_old_connections()
        try:
            run_outbound_entity_sync(
                entity_type,
                object_id,
                app_label,
                model_name,
                service_method_name,
            )
        except Exception as exc:
            logger.error(
                'Deferred QBO retry failed for %s %s: %s',
                entity_type,
                object_id,
                exc,
            )
        finally:
            close_old_connections()

    threading.Timer(RETRY_DELAY_SECONDS, _retry).start()
    logger.info(
        'Scheduled deferred QBO sync for %s %s in %ss (lock was held)',
        entity_type,
        object_id,
        RETRY_DELAY_SECONDS,
    )


def run_outbound_entity_sync(entity_type, object_id, app_label, model_name, service_method_name):
    """
    Load an entity, enforce sync policy, run the service method, and write sync logs.
    Returns the QuickBooks SDK result, or None when skipped or failed.
    """
    from django.apps import apps

    from .services import QuickBooksService
    from .sync_guard import mark_mapping_pending, outbound_sync_lock
    from .sync_policy import outbound_eligibility_reason

    model = apps.get_model(app_label, model_name)
    try:
        instance = model.objects.get(id=object_id)
    except model.DoesNotExist:
        logger.error('%s %s does not exist.', model_name, object_id)
        return None

    eligible, reason = outbound_eligibility_reason(entity_type, instance)
    if not eligible:
        logger.info('Skipping QBO sync for %s %s: %s', model_name, object_id, reason)
        return None

    with outbound_sync_lock(entity_type, object_id) as acquired:
        if not acquired:
            _schedule_outbound_retry(
                entity_type,
                object_id,
                app_label,
                model_name,
                service_method_name,
            )
            return None

        mark_mapping_pending(instance)
        service = QuickBooksService()
        sync_method = getattr(service, service_method_name)
        try:
            result = sync_method(instance)
        except Exception as exc:
            logger.error('Error syncing %s %s to QBO: %s', model_name, object_id, exc, exc_info=True)
            record_outbound_sync(entity_type, success=False, error_message=str(exc))
            return None

        if result:
            record_outbound_sync(entity_type, success=True)
            logger.info(
                'Successfully synced %s %s to QBO ID %s',
                model_name,
                object_id,
                getattr(result, 'Id', ''),
            )
        else:
            record_outbound_sync(
                entity_type,
                success=False,
                error_message=get_mapping_error(instance) or 'Sync returned no result from QuickBooks.',
            )
            logger.warning('Failed to sync %s %s to QBO (no result returned)', model_name, object_id)
        return result
