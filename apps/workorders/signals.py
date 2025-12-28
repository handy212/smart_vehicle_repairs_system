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
from apps.billing.accounting_service import AccountingService
import logging

logger = logging.getLogger(__name__)


@receiver(post_save, sender=WorkOrder)
def post_job_costs_on_completion(sender, instance, created, **kwargs):
    """
    Post parts and labor costs to GL when work order status changes to 'completed'
    This enables automatic job costing integration with the accounting system.
    """
    # Only process if status is completed and not a new creation
    if not created and instance.status == 'completed':
        # Check if costs were already posted (to avoid duplicate postings)
        if hasattr(instance, '_costs_posted') and instance._costs_posted:
            logger.info(f"Costs already posted for WorkOrder {instance.work_order_number}")
            return
        
        # Check if status actually changed to completed (avoid reposting on every save)
        if not hasattr(instance, '_just_completed'):
            # Load previous state to check
            try:
                old_instance = WorkOrder.objects.get(pk=instance.pk)
                if old_instance.status == 'completed':
                    # Was already completed, skip posting
                    return
            except WorkOrder.DoesNotExist:
                return
        
        try:
            from django.db import transaction
            with transaction.atomic():
                # Post parts cost
                if instance.actual_parts_cost and instance.actual_parts_cost > 0:
                    je_parts = AccountingService.post_parts_cost(instance)
                    if je_parts:
                        logger.info(f"Posted parts cost for WO {instance.work_order_number}: ${instance.actual_parts_cost}")
                    else:
                        logger.warning(f"Failed to post parts cost for WO {instance.work_order_number}")
                else:
                    logger.debug(f"No parts cost to post for WO {instance.work_order_number}")
                
                # Post labor cost
                if instance.actual_labor_cost and instance.actual_labor_cost > 0:
                    je_labor = AccountingService.post_labor_cost(instance)
                    if je_labor:
                        logger.info(f"Posted labor cost for WO {instance.work_order_number}: ${instance.actual_labor_cost}")
                    else:
                        logger.warning(f"Failed to post labor cost for WO {instance.work_order_number}")
                else:
                    logger.debug(f"No labor cost to post for WO {instance.work_order_number}")
                
                # Mark as posted to prevent duplicate postings
                instance._costs_posted = True
                
        except Exception as e:
            logger.error(f"Error posting job costs for WO {instance.work_order_number}: {e}", exc_info=True)
