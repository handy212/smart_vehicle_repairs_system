# Celery lanes

The system uses three Redis queues so long-running work cannot starve interactive jobs.

| Queue | Consumer | Workload |
|-------|----------|----------|
| `celery` | `celery` container | Notifications, reminders, light scheduled jobs |
| `heavy` | `celery-heavy` container | Imports, wipes, system backups, weekly reports |
| `qbo` | `celery-heavy` container | QuickBooks inbound/outbound sync |

Queue names live in [`config/celery_queues.py`](../config/celery_queues.py). Catch-all routes are also declared in `CELERY_TASK_ROUTES` ([`config/settings/base.py`](../config/settings/base.py)).

## Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d celery celery-heavy celerybeat
```

## Local development

`scripts/dev-server.sh` starts a single worker that listens to all three queues:

```bash
celery -A config worker -l info -Q celery,heavy,qbo
```
