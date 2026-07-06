"""Queue outbound QuickBooks re-sync for branch-scoped sales documents."""

from __future__ import annotations

import logging

from apps.branches.models import Branch

from importlib import import_module

from .outbound_entities import OUTBOUND_SYNC_ENTITIES
from .sync_policy import is_outbound_eligible
from .task_dispatch import schedule_entity_sync

logger = logging.getLogger(__name__)

BRANCH_RESYNC_ENTITY_TYPES = ('invoice', 'estimate', 'credit_note')
_tasks = import_module('apps.quickbooks_online.tasks')


def queue_branch_sales_document_resync(branch, *, entity_types=None):
    """
    Queue outbound QBO sync for eligible invoices, estimates, and credit notes on a branch.

    Use after branch chart-of-accounts overrides change so existing QBO documents pick up
    new AR / income item mappings on the next push.
    """
    if isinstance(branch, int):
        branch = Branch.objects.get(pk=branch)

    entity_types = tuple(entity_types or BRANCH_RESYNC_ENTITY_TYPES)
    queued = []
    skipped = []

    for entity_type in entity_types:
        config = OUTBOUND_SYNC_ENTITIES.get(entity_type)
        if not config:
            continue

        from django.apps import apps

        model = apps.get_model(config['app_label'], config['model_name'])
        task = getattr(_tasks, config['task_name'])

        queryset = model.objects.filter(branch=branch)
        status_field = getattr(model, 'status', None)
        if status_field is not None:
            queryset = queryset.exclude(status__in=('void', 'cancelled', 'draft'))

        for instance in queryset.iterator(chunk_size=200):
            eligible, reason = is_outbound_eligible(entity_type, instance)
            if not eligible:
                skipped.append({
                    'entity_type': entity_type,
                    'object_id': instance.pk,
                    'label': str(instance),
                    'reason': reason,
                })
                continue
            schedule_entity_sync(entity_type, instance.pk, task=task)
            queued.append({
                'entity_type': entity_type,
                'object_id': instance.pk,
                'label': str(instance),
            })

    logger.info(
        'Queued %s branch QBO resync(s) for %s; skipped %s',
        len(queued),
        branch.code,
        len(skipped),
    )
    return {
        'branch_id': branch.id,
        'branch_name': branch.name,
        'queued_count': len(queued),
        'skipped_count': len(skipped),
        'queued': queued[:100],
        'skipped': skipped[:50],
    }
