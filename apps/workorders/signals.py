"""
Signals for work orders app to handle automated workflow updates.

Note: ServiceTask.save() already calls check_auto_complete() when a task
is completed, so the signal here is redundant but kept for consistency
and future enhancements.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import WorkOrder, ServiceTask, WorkOrderPart


@receiver(post_save, sender=ServiceTask)
def task_status_changed(sender, instance, created, **kwargs):
    """
    Handle task status changes and check for auto-complete.
    
    Note: This is a backup check. The main auto-complete logic
    is in ServiceTask.save() method.
    """
    if not created and instance.status == 'completed':
        # Double-check auto-complete (redundant but safe)
        try:
            instance.work_order.check_auto_complete()
        except Exception:
            # Don't fail if auto-complete check fails
            pass


@receiver(post_save, sender=WorkOrderPart)
def part_status_changed(sender, instance, created, **kwargs):
    """Handle part status changes"""
    if not created:
        # Recalculate totals when part status changes
        # This ensures costs are always up-to-date
        try:
            instance.work_order.recalculate_totals()
        except Exception:
            # Don't fail if recalculation fails
            pass


# ==================== Job Costing GL Integration ====================
# from apps.billing.accounting_service import AccountingService
import logging

logger = logging.getLogger(__name__)


# @receiver(post_save, sender=WorkOrder)
# def post_job_costs_on_completion(sender, instance, created, **kwargs):
#     ...
