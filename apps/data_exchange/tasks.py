"""Background tasks for large import preview/commit jobs."""
from __future__ import annotations

import logging

from celery import shared_task

from config.celery_queues import HEAVY_CELERY_QUEUE

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    ignore_result=True,
    queue=HEAVY_CELERY_QUEUE,
    soft_time_limit=3600,
    time_limit=3900,
)
def run_import_preview_task(self, batch_id: int) -> str:
    from django.db import close_old_connections

    from apps.data_exchange.models import ImportBatch
    from apps.data_exchange.services import run_preview

    close_old_connections()
    batch = ImportBatch.objects.filter(pk=batch_id).first()
    if not batch:
        return f'batch {batch_id} missing'
    try:
        run_preview(batch, for_background=True)
        return f'previewed {batch_id}'
    except Exception as exc:  # noqa: BLE001
        logger.exception('Import preview failed for batch %s', batch_id)
        batch.refresh_from_db()
        batch.mark_failed(str(exc))
        raise
    finally:
        close_old_connections()


@shared_task(
    bind=True,
    ignore_result=True,
    queue=HEAVY_CELERY_QUEUE,
    soft_time_limit=7200,
    time_limit=7500,
)
def run_import_commit_task(self, batch_id: int, force: bool = False) -> str:
    from django.db import close_old_connections

    from apps.data_exchange.models import ImportBatch
    from apps.data_exchange.services import run_commit

    close_old_connections()
    batch = ImportBatch.objects.filter(pk=batch_id).first()
    if not batch:
        return f'batch {batch_id} missing'
    try:
        from apps.data_exchange.services import CommitCancelled

        run_commit(batch, force=force, for_background=True)
        batch.refresh_from_db()
        if batch.status == ImportBatch.STATUS_FAILED:
            return f'cancelled {batch_id}'
        return f'committed {batch_id}'
    except CommitCancelled:
        batch.refresh_from_db()
        if batch.status != ImportBatch.STATUS_FAILED:
            batch.mark_failed('Cancelled by user')
        return f'cancelled {batch_id}'
    except Exception as exc:  # noqa: BLE001
        logger.exception('Import commit failed for batch %s', batch_id)
        batch.refresh_from_db()
        if batch.status != ImportBatch.STATUS_COMPLETED:
            batch.mark_failed(str(exc))
        raise
    finally:
        close_old_connections()


@shared_task(
    bind=True,
    ignore_result=True,
    queue=HEAVY_CELERY_QUEUE,
    soft_time_limit=7200,
    time_limit=7500,
)
def run_wipe_task(
    self,
    job_id: str,
    user_id: int | None = None,
    clear_import_batches: bool = True,
) -> str:
    from django.contrib.auth import get_user_model
    from django.db import close_old_connections

    from apps.data_exchange.cleanup import (
        CONFIRM_PHRASE,
        mark_wipe_job_failed,
        run_customer_vehicle_wipe,
    )

    close_old_connections()
    User = get_user_model()
    user = User.objects.filter(pk=user_id).first() if user_id else None
    try:
        run_customer_vehicle_wipe(
            confirm=CONFIRM_PHRASE,
            user=user,
            clear_import_batches=clear_import_batches,
            job_id=job_id,
        )
        return f'wipe {job_id} done'
    except Exception as exc:  # noqa: BLE001
        logger.exception('Wipe job %s failed', job_id)
        mark_wipe_job_failed(job_id, str(exc))
        raise
    finally:
        close_old_connections()
