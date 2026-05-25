#!/usr/bin/env python3
"""Verify every Celery Beat schedule entry resolves to an importable task."""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.testing')

import django

django.setup()

from config.celery import app as celery_app

# Ensure task modules are loaded (beat validation runs without a worker process).
celery_app.loader.import_default_modules()


def main() -> int:
    schedule = celery_app.conf.beat_schedule or {}
    errors: list[str] = []

    for name, entry in schedule.items():
        task_name = entry.get('task')
        if not task_name:
            errors.append(f'{name}: missing task key')
            continue
        try:
            celery_app.tasks[task_name]
        except KeyError:
            errors.append(f'{name}: task not registered: {task_name}')

    if errors:
        print('Celery beat schedule validation failed:', file=sys.stderr)
        for err in errors:
            print(f'  - {err}', file=sys.stderr)
        return 1

    print(f'OK: {len(schedule)} beat schedule entries validated.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
