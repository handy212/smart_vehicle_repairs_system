"""Shared Celery queue names for default vs heavy/integration workloads."""

# Interactive / short background jobs (notifications, reminders, light reports).
DEFAULT_CELERY_QUEUE = 'celery'

# Long-running imports, wipes, backups, and heavy reporting.
HEAVY_CELERY_QUEUE = 'heavy'

# QuickBooks Online sync (inbound + outbound). Kept separate so QBO outages
# do not block import/backup work on the heavy worker.
QBO_CELERY_QUEUE = 'qbo'

# Queues consumed by the dedicated heavy worker container.
HEAVY_WORKER_QUEUES = (HEAVY_CELERY_QUEUE, QBO_CELERY_QUEUE)
