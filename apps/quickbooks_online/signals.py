from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from apps.customers.models import Customer
from apps.billing.models import Invoice, Payment, Estimate, CreditNote
from apps.inventory.models import Supplier, PurchaseOrder
from apps.branches.models import Branch
from .tasks import (
    task_sync_customer_to_qbo, 
    task_sync_invoice_to_qbo, 
    task_sync_payment_to_qbo,
    task_sync_supplier_to_qbo,
    task_sync_purchase_order_to_qbo,
    task_sync_branch_to_qbo,
    task_sync_estimate_to_qbo,
    task_sync_credit_note_to_qbo,
)
import logging

logger = logging.getLogger(__name__)


def _auto_sync_enabled():
    return getattr(settings, 'QUICKBOOKS_AUTO_SYNC_ENABLED', True)

@receiver(post_save, sender=Customer)
def sync_customer_on_save(sender, instance, created, **kwargs):
    """
    Trigger QBO sync when a Customer is saved.
    """
    if not _auto_sync_enabled():
        return
    # Avoid syncing if created by tests or fixtures without proper data
    if not instance.customer_number:
        return
        
    logger.info(f"Triggering QBO sync for Customer {instance.id}")
    task_sync_customer_to_qbo.delay(instance.id)


@receiver(post_save, sender=Invoice)
def sync_invoice_on_save(sender, instance, created, **kwargs):
    """
    Trigger QBO sync when an Invoice is saved.
    """
    if not _auto_sync_enabled():
        return
    logger.info(f"Triggering QBO sync for Invoice {instance.id}")
    task_sync_invoice_to_qbo.delay(instance.id)


@receiver(post_save, sender=Payment)
def sync_payment_on_save(sender, instance, created, **kwargs):
    """
    Trigger QBO sync when a Payment is saved.
    """
    if not _auto_sync_enabled():
        return
    logger.info(f"Triggering QBO sync for Payment {instance.id}")
    task_sync_payment_to_qbo.delay(instance.id)


@receiver(post_save, sender=Supplier)
def sync_supplier_on_save(sender, instance, created, **kwargs):
    """
    Trigger QBO sync when a Supplier is saved.
    """
    if not _auto_sync_enabled():
        return
    logger.info(f"Triggering QBO sync for Supplier {instance.id}")
    task_sync_supplier_to_qbo.delay(instance.id)


@receiver(post_save, sender=PurchaseOrder)
def sync_purchase_order_on_save(sender, instance, created, **kwargs):
    """
    Trigger QBO sync when a PurchaseOrder is saved.
    """
    if not _auto_sync_enabled():
        return
    logger.info(f"Triggering QBO sync for PurchaseOrder {instance.id}")
    task_sync_purchase_order_to_qbo.delay(instance.id)


@receiver(post_save, sender=Branch)
def sync_branch_on_save(sender, instance, created, **kwargs):
    """
    Trigger QBO sync when a Branch is created or updated.
    Branches map to QBO Departments (Locations).
    """
    if not _auto_sync_enabled():
        return
    logger.info(f"Triggering QBO sync for Branch {instance.id} ({instance.name})")
    task_sync_branch_to_qbo.delay(instance.id)


ESTIMATE_QBO_SYNC_STATUSES = {'sent', 'viewed', 'approved'}


@receiver(post_save, sender=Estimate)
def sync_estimate_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when an estimate is sent or approved."""
    if not _auto_sync_enabled():
        return
    if instance.status not in ESTIMATE_QBO_SYNC_STATUSES:
        return
    logger.info(f"Triggering QBO sync for Estimate {instance.id}")
    task_sync_estimate_to_qbo.delay(instance.id)


CREDIT_NOTE_QBO_SYNC_STATUSES = {'issued', 'applied', 'refunded'}


@receiver(post_save, sender=CreditNote)
def sync_credit_note_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when a credit note is issued."""
    if not _auto_sync_enabled():
        return
    if instance.status not in CREDIT_NOTE_QBO_SYNC_STATUSES:
        return
    logger.info(f"Triggering QBO sync for CreditNote {instance.id}")
    task_sync_credit_note_to_qbo.delay(instance.id)
