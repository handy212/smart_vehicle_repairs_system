#!/usr/bin/env python3
"""
Validate Celery beat schedule entries resolve to registered tasks.

Used by CI release gate and deploy workflows before migrations/tests run.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> int:
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

    import django

    django.setup()

    from config.celery import app

    # Ensure all Django app task modules are loaded (first autodiscover can run too early).
    app.autodiscover_tasks(force=True)

    schedule = app.conf.beat_schedule or {}
    if not schedule:
        print('ERROR: Celery beat_schedule is empty', file=sys.stderr)
        return 1

    registered = set(app.tasks.keys())
    errors: list[str] = []

    for name, entry in schedule.items():
        if not isinstance(entry, dict):
            errors.append(f'{name}: schedule entry must be a dict')
            continue

        task_name = entry.get('task')
        if not task_name:
            errors.append(f'{name}: missing required "task" key')
            continue

        if entry.get('schedule') is None:
            errors.append(f'{name}: missing required "schedule" key')
            continue

        if task_name not in registered:
            errors.append(
                f'{name}: task "{task_name}" is not registered '
                f'(available: {len(registered)} tasks)'
            )

    if errors:
        print('Celery beat schedule validation failed:', file=sys.stderr)
        for error in errors:
            print(f'  - {error}', file=sys.stderr)
        return 1

    print(f'OK: validated {len(schedule)} Celery beat schedule entries')
    for name, entry in sorted(schedule.items()):
        print(f'  - {name}: {entry["task"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
