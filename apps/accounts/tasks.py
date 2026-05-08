import io
import json
import os
import zipfile
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.core.management import call_command
from django.utils import timezone
from django.utils.text import slugify

from .admin_models import SystemBackup, SystemSettings


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
