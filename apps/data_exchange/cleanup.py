"""
Wipe customers, vehicles, and related operational records for migration reset.

Keeps staff users, branches, inventory catalog, roles/settings, and QBO config.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

CONFIRM_PHRASE = 'DELETE CUSTOMERS'
WIPE_JOB_CACHE_KEY = 'data_exchange:wipe_job'
WIPE_JOB_TTL_SECONDS = 60 * 60 * 6  # 6 hours
DELETE_BATCH_SIZE = 400

logger = logging.getLogger(__name__)
User = get_user_model()


def _count(model) -> int:
    return model.objects.count()


def _delete_in_batches(model, *, batch_size: int = DELETE_BATCH_SIZE) -> int:
    """Delete rows in PK chunks to avoid one giant ASGI-blocking transaction."""
    total = 0
    while True:
        ids = list(model.objects.values_list('pk', flat=True)[:batch_size])
        if not ids:
            break
        with transaction.atomic():
            deleted, _ = model.objects.filter(pk__in=ids).delete()
        total += deleted
        if deleted == 0:
            break
    return total


def _import_model(path: str):
    """Import 'app.Model' and return the class, or None if unavailable."""
    try:
        app_label, model_name = path.split('.')
        from django.apps import apps
        return apps.get_model(app_label, model_name)
    except Exception:  # noqa: BLE001
        return None


def collect_wipe_counts() -> dict[str, int]:
    """Return entity counts that the wipe will remove (dry-run preview)."""
    models = {
        'gate_passes': 'gatepass.GatePass',
        'roadside_requests': 'roadside.RoadsideRequest',
        'refunds': 'billing.Refund',
        'payments': 'billing.Payment',
        'credit_note_applications': 'billing.CreditNoteApplication',
        'credit_notes': 'billing.CreditNote',
        'invoices': 'billing.Invoice',
        'estimates': 'billing.Estimate',
        'sales_orders': 'billing.SalesOrder',
        'work_orders': 'workorders.WorkOrder',
        'subscriptions': 'subscriptions.Subscription',
        'appointments': 'appointments.Appointment',
        'inspections': 'inspections.VehicleInspection',
        'ownership_history': 'vehicles.VehicleOwnershipHistory',
        'vehicles': 'vehicles.Vehicle',
        'customers': 'customers.Customer',
        'import_batches': 'data_exchange.ImportBatch',
    }
    counts: dict[str, int] = {}
    for key, path in models.items():
        model = _import_model(path)
        counts[key] = _count(model) if model is not None else 0

    customer_users = User.objects.filter(role='customer').count()
    counts['customer_users'] = customer_users
    counts['total_records'] = sum(counts.values())
    return counts


def preview_customer_vehicle_wipe() -> dict[str, Any]:
    counts = collect_wipe_counts()
    return {
        'dry_run': True,
        'confirm_phrase': CONFIRM_PHRASE,
        'counts': counts,
        'keeps': [
            'staff users',
            'branches',
            'roles and permissions',
            'inventory parts/catalog',
            'system settings',
            'QBO configuration',
        ],
        'deletes': [
            'gate passes',
            'roadside requests',
            'work orders',
            'invoices / payments / refunds / estimates / credit notes / sales orders',
            'subscriptions',
            'appointments',
            'inspections',
            'vehicles',
            'customers and customer login users',
            'import batch history',
        ],
        'active_job': get_wipe_job(),
    }


def _save_wipe_job(job: dict[str, Any]) -> dict[str, Any]:
    cache.set(WIPE_JOB_CACHE_KEY, job, timeout=WIPE_JOB_TTL_SECONDS)
    return job


def get_wipe_job() -> dict[str, Any] | None:
    job = cache.get(WIPE_JOB_CACHE_KEY)
    return job if isinstance(job, dict) else None


def queue_customer_vehicle_wipe(
    *,
    confirm: str,
    user=None,
    clear_import_batches: bool = True,
) -> dict[str, Any]:
    """
    Validate confirm phrase and start wipe in the background.
    Returns immediately with job status (running).
    """
    if (confirm or '').strip() != CONFIRM_PHRASE:
        raise ValueError(
            f'Confirmation phrase required. Type exactly: {CONFIRM_PHRASE}'
        )

    existing = get_wipe_job()
    if existing and existing.get('status') == 'running':
        # Allow retry if a previous ASGI-killed request left a stale "running" job.
        stale = True
        started_raw = existing.get('started_at') or ''
        try:
            started = datetime.fromisoformat(str(started_raw))
            if timezone.is_naive(started):
                started = timezone.make_aware(started, timezone.get_current_timezone())
            age_seconds = (timezone.now() - started).total_seconds()
            # Daphne may kill a long sync wipe; allow retry after a short grace.
            stale = age_seconds > 120
        except Exception:  # noqa: BLE001
            stale = True
        if not stale:
            raise ValueError(
                'A wipe job is already running. Wait for it to finish, then retry.'
            )

    before = collect_wipe_counts()
    job_id = str(uuid.uuid4())
    user_id = getattr(user, 'pk', None)
    job = {
        'job_id': job_id,
        'status': 'running',
        'started_at': timezone.now().isoformat(),
        'finished_at': None,
        'error': '',
        'before': before,
        'deleted': {},
        'after': {},
        'ok': False,
        'progress': 'starting',
        'confirm_phrase': CONFIRM_PHRASE,
        'clear_import_batches': bool(clear_import_batches),
        'started_by_id': user_id,
    }
    _save_wipe_job(job)

    from django.conf import settings

    if getattr(settings, 'DATA_EXCHANGE_WIPE_SYNC', False):
        # Tests / explicit sync: run inline (no Celery/thread DB connection issues).
        result = run_customer_vehicle_wipe(
            confirm=CONFIRM_PHRASE,
            user=user,
            clear_import_batches=bool(clear_import_batches),
            job_id=job_id,
        )
        return {
            'dry_run': False,
            'async': False,
            'job_id': job_id,
            'status': result.get('status') or 'completed',
            'confirm_phrase': CONFIRM_PHRASE,
            'before': before,
            'deleted': result.get('deleted') or {},
            'after': result.get('after') or {},
            'ok': result.get('ok', False),
            'message': 'Wipe completed synchronously.',
        }

    from apps.data_exchange.services import _dispatch_background
    from apps.data_exchange.tasks import run_wipe_task

    _dispatch_background(
        run_wipe_task,
        job_id,
        user_id=user_id,
        clear_import_batches=bool(clear_import_batches),
    )

    return {
        'dry_run': False,
        'async': True,
        'job_id': job_id,
        'status': 'running',
        'confirm_phrase': CONFIRM_PHRASE,
        'before': before,
        'message': 'Wipe started in the background. Poll wipe status until completed.',
    }


def run_customer_vehicle_wipe(
    *,
    confirm: str,
    user=None,
    request=None,
    clear_import_batches: bool = True,
    job_id: str | None = None,
) -> dict[str, Any]:
    """
    Permanently delete customers, vehicles, and related ops data.

    Requires confirm == CONFIRM_PHRASE.
    Prefer queue_customer_vehicle_wipe() for HTTP so Daphne is not blocked.
    """
    if (confirm or '').strip() != CONFIRM_PHRASE:
        raise ValueError(
            f'Confirmation phrase required. Type exactly: {CONFIRM_PHRASE}'
        )

    before = collect_wipe_counts()
    deleted: dict[str, int] = {}

    # Ordered to clear PROTECT FKs before parents.
    delete_order = [
        ('gate_passes', 'gatepass.GatePass'),
        ('roadside_requests', 'roadside.RoadsideRequest'),
        ('refunds', 'billing.Refund'),
        ('payments', 'billing.Payment'),
        ('credit_note_applications', 'billing.CreditNoteApplication'),
        ('credit_notes', 'billing.CreditNote'),
        ('invoices', 'billing.Invoice'),
        ('estimates', 'billing.Estimate'),
        ('sales_orders', 'billing.SalesOrder'),
        ('work_orders', 'workorders.WorkOrder'),
        ('subscriptions', 'subscriptions.Subscription'),
        ('appointments', 'appointments.Appointment'),
        ('inspections', 'inspections.VehicleInspection'),
        ('ownership_history', 'vehicles.VehicleOwnershipHistory'),
        ('vehicles', 'vehicles.Vehicle'),
        ('customers', 'customers.Customer'),
    ]

    def _touch(progress: str, **extra: Any) -> None:
        if not job_id:
            return
        job = get_wipe_job() or {}
        if job.get('job_id') != job_id:
            return
        job['progress'] = progress
        job['deleted'] = deleted
        job.update(extra)
        _save_wipe_job(job)

    try:
        from apps.quickbooks_online.sync_context import suppress_outbound_qbo_signals
    except Exception:  # noqa: BLE001
        from contextlib import nullcontext as suppress_outbound_qbo_signals

    with suppress_outbound_qbo_signals():
        for key, path in delete_order:
            model = _import_model(path)
            if model is None:
                deleted[key] = 0
                continue
            _touch(f'deleting:{key}')
            deleted[key] = _delete_in_batches(model)

        _touch('deleting:customer_users')
        user_qs = User.objects.filter(role='customer')
        deleted['customer_users'] = 0
        while True:
            ids = list(user_qs.values_list('pk', flat=True)[:DELETE_BATCH_SIZE])
            if not ids:
                break
            with transaction.atomic():
                n, _ = User.objects.filter(pk__in=ids, role='customer').delete()
            deleted['customer_users'] += n

        if clear_import_batches:
            batch_model = _import_model('data_exchange.ImportBatch')
            if batch_model is not None:
                _touch('deleting:import_batches')
                for batch in batch_model.objects.iterator(chunk_size=100):
                    if batch.source_file:
                        try:
                            batch.source_file.delete(save=False)
                        except Exception:  # noqa: BLE001
                            pass
                deleted['import_batches'] = _delete_in_batches(batch_model)
            else:
                deleted['import_batches'] = 0
        else:
            deleted['import_batches'] = 0

    after = collect_wipe_counts()
    ok = after.get('customers', 0) == 0 and after.get('vehicles', 0) == 0

    try:
        from apps.accounts.admin_views import log_audit
        log_audit(
            user,
            'delete',
            'Customer',
            'wipe_customers_vehicles',
            changes={
                'action': 'wipe_customers_vehicles',
                'job_id': job_id,
                'before': before,
                'deleted': deleted,
                'after': after,
            },
            request=request,
        )
    except Exception:  # noqa: BLE001
        pass

    result = {
        'dry_run': False,
        'confirm_phrase': CONFIRM_PHRASE,
        'before': before,
        'deleted': deleted,
        'after': after,
        'ok': ok,
        'job_id': job_id,
        'status': 'completed' if ok else 'completed_with_leftovers',
    }
    if job_id:
        _save_wipe_job({
            **(get_wipe_job() or {}),
            'job_id': job_id,
            'status': result['status'],
            'finished_at': timezone.now().isoformat(),
            'error': '',
            'before': before,
            'deleted': deleted,
            'after': after,
            'ok': ok,
            'progress': 'done',
        })
    return result


def mark_wipe_job_failed(job_id: str, error: str) -> None:
    job = get_wipe_job() or {}
    if job.get('job_id') != job_id:
        job = {'job_id': job_id}
    job.update({
        'status': 'failed',
        'error': str(error)[:2000],
        'finished_at': timezone.now().isoformat(),
        'progress': 'failed',
        'ok': False,
    })
    _save_wipe_job(job)
    logger.error('Wipe job %s failed: %s', job_id, error)
