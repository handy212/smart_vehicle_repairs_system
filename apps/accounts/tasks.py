import io
import json
import os
import subprocess
import zipfile
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.core.management import call_command
from django.utils import timezone
from django.utils.text import slugify

from .admin_models import SystemBackup, SystemSettings, SystemUpdateRun


def _backup_archive_root() -> Path:
    root = Path(settings.MEDIA_ROOT) / 'system_backups'
    root.mkdir(parents=True, exist_ok=True)
    return root


def _remove_backup_file(backup: SystemBackup) -> None:
    if backup.file_path and os.path.exists(backup.file_path):
        os.remove(backup.file_path)


def cleanup_expired_backups() -> int:
    try:
        retention_days = int(SystemSettings.get_setting('backup_retention_days', '30') or 30)
    except (TypeError, ValueError):
        retention_days = 30

    if retention_days <= 0:
        return 0

    cutoff = timezone.now() - timezone.timedelta(days=retention_days)
    expired = SystemBackup.objects.filter(started_at__lt=cutoff)
    deleted = 0
    for backup in expired:
        _remove_backup_file(backup)
        backup.delete()
        deleted += 1
    return deleted


@shared_task
def create_system_backup(backup_id: int) -> str:
    backup = SystemBackup.objects.get(id=backup_id)
    backup.status = 'in_progress'
    backup.error_message = ''
    backup.save(update_fields=['status', 'error_message'])

    try:
        backup_root = _backup_archive_root()
        timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
        safe_type = slugify(backup.backup_type) or 'backup'
        archive_path = backup_root / f'{safe_type}_{timestamp}_{backup.id}.zip'

        with zipfile.ZipFile(archive_path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            manifest = {
                'id': backup.id,
                'backup_type': backup.backup_type,
                'created_at': timezone.now().isoformat(),
                'notes': backup.notes,
            }
            archive.writestr('manifest.json', json.dumps(manifest, indent=2))

            if backup.backup_type in ('full', 'database'):
                buffer = io.StringIO()
                call_command(
                    'dumpdata',
                    '--natural-foreign',
                    '--natural-primary',
                    '--exclude=contenttypes',
                    '--exclude=auth.permission',
                    stdout=buffer,
                )
                archive.writestr('database.json', buffer.getvalue())

            if backup.backup_type in ('full', 'media'):
                media_root = Path(settings.MEDIA_ROOT)
                for path in media_root.rglob('*'):
                    if not path.is_file() or backup_root in path.parents:
                        continue
                    archive.write(path, f'media/{path.relative_to(media_root)}')

        backup.file_path = str(archive_path)
        backup.file_size = archive_path.stat().st_size
        backup.status = 'completed'
        backup.completed_at = timezone.now()
        backup.error_message = ''
        backup.save(update_fields=['file_path', 'file_size', 'status', 'completed_at', 'error_message'])
        cleanup_expired_backups()
        return f'Backup {backup.id} completed'
    except Exception as exc:
        backup.status = 'failed'
        backup.error_message = str(exc)
        backup.completed_at = timezone.now()
        backup.save(update_fields=['status', 'error_message', 'completed_at'])
        raise


@shared_task
def cleanup_expired_system_backups() -> str:
    deleted = cleanup_expired_backups()
    return f'Deleted {deleted} expired backups'


@shared_task
def run_system_update(run_id: int) -> str:
    run = SystemUpdateRun.objects.get(id=run_id)
    run.status = 'in_progress'
    run.error_message = ''
    run.save(update_fields=['status', 'error_message'])

    script = Path(getattr(settings, 'SYSTEM_UPDATE_RUN_SCRIPT', ''))
    log_dir = Path(getattr(settings, 'SYSTEM_UPDATE_TARGET_DIR', '/var/www/svr')) / 'logs' / 'updates'
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f'update_{run_id}.log'

    try:
        with open(log_path, 'w', encoding='utf-8') as log_file:
            process = subprocess.Popen(
                ['sudo', '-n', str(script), '--ref', run.git_ref],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            assert process.stdout is not None
            for line in process.stdout:
                log_file.write(line)
            return_code = process.wait(timeout=3600)

        log_text = log_path.read_text(encoding='utf-8', errors='replace')
        run.log_output = log_text[-50000:]
        run.status = 'completed' if return_code == 0 else 'failed'
        if return_code != 0:
            run.error_message = f'Update script exited with code {return_code}'
        run.completed_at = timezone.now()
        run.save(update_fields=['log_output', 'status', 'error_message', 'completed_at'])

        from .system_updater import check_for_updates, deployed_commit

        run.to_commit = check_for_updates(ref=run.git_ref).remote_commit or deployed_commit() or run.to_commit
        run.save(update_fields=['to_commit'])
        return f'Update run {run_id} {run.status}'
    except Exception as exc:
        run.status = 'failed'
        run.error_message = str(exc)
        run.completed_at = timezone.now()
        if log_path.is_file():
            run.log_output = log_path.read_text(encoding='utf-8', errors='replace')[-50000:]
        run.save(update_fields=['status', 'error_message', 'completed_at', 'log_output'])
        raise
