import logging

from celery import shared_task

from apps.inventory.services import InventoryService

logger = logging.getLogger(__name__)


@shared_task
def check_low_stock_items():
    """Scan inventory and create low-stock alerts (scheduled daily)."""
    alerts = InventoryService.check_and_create_stock_alerts()
    count = len(alerts)
    logger.info('Low stock check complete: %s new alert(s)', count)
    return f'Created {count} stock alert(s)'
