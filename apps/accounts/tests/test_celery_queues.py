from django.test import SimpleTestCase

from config.celery_queues import (
    DEFAULT_CELERY_QUEUE,
    HEAVY_CELERY_QUEUE,
    HEAVY_WORKER_QUEUES,
    QBO_CELERY_QUEUE,
)


class CeleryQueueRoutingTests(SimpleTestCase):
    def test_queue_constants(self):
        self.assertEqual(DEFAULT_CELERY_QUEUE, 'celery')
        self.assertEqual(HEAVY_CELERY_QUEUE, 'heavy')
        self.assertEqual(QBO_CELERY_QUEUE, 'qbo')
        self.assertEqual(HEAVY_WORKER_QUEUES, ('heavy', 'qbo'))

    def test_heavy_tasks_declare_heavy_queue(self):
        from apps.accounts.tasks import create_system_backup
        from apps.data_exchange.tasks import (
            run_import_commit_task,
            run_import_preview_task,
            run_wipe_task,
        )
        from apps.reporting.tasks import generate_weekly_reports

        self.assertEqual(create_system_backup.queue, HEAVY_CELERY_QUEUE)
        self.assertEqual(run_import_preview_task.queue, HEAVY_CELERY_QUEUE)
        self.assertEqual(run_import_commit_task.queue, HEAVY_CELERY_QUEUE)
        self.assertEqual(run_wipe_task.queue, HEAVY_CELERY_QUEUE)
        self.assertEqual(generate_weekly_reports.queue, HEAVY_CELERY_QUEUE)

    def test_qbo_outbound_helper_uses_qbo_queue(self):
        from apps.quickbooks_online.celery_queue import QBO_OUTBOUND_QUEUE

        self.assertEqual(QBO_OUTBOUND_QUEUE, QBO_CELERY_QUEUE)
