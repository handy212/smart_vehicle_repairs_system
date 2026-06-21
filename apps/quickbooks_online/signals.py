from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.conf import settings
from apps.customers.models import Customer
from apps.billing.models import Invoice, Payment, Estimate, CreditNote, Bill, VendorCredit
from apps.inventory.models import Supplier, PurchaseOrder, Part
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
    task_sync_vendor_bill_to_qbo,
    task_sync_vendor_credit_to_qbo,
    task_sync_part_to_qbo,
    task_resync_payments_for_invoice,
)
from .sync_policy import is_outbound_eligible, INVOICE_QBO_SYNC_STATUSES
from .payment_helpers import _is_proforma_numbered_invoice
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
    if not is_outbound_eligible('customer', instance):
        return
        
    logger.info(f"Triggering QBO sync for Customer {instance.id}")
    task_sync_customer_to_qbo.delay(instance.id)


@receiver(post_save, sender=Invoice)
def sync_invoice_on_save(sender, instance, created, **kwargs):
    """
    Trigger QBO sync when a finalized Invoice is saved.
    """
    if not _auto_sync_enabled():
        return
    if not is_outbound_eligible('invoice', instance):
        return
    logger.info(f"Triggering QBO sync for Invoice {instance.id}")
    task_sync_invoice_to_qbo.delay(instance.id)


@receiver(post_save, sender=Payment)
def sync_payment_on_save(sender, instance, created, **kwargs):
    """
    Trigger QBO sync when a completed Payment is saved.
    """
    if not _auto_sync_enabled():
        return
    if not is_outbound_eligible('payment', instance):
        return
    logger.info(f"Triggering QBO sync for Payment {instance.id}")
    task_sync_payment_to_qbo.delay(instance.id)


@receiver(pre_save, sender=Invoice)
def capture_invoice_status_before_save(sender, instance, **kwargs):
    if instance.pk:
        try:
            instance._qbo_prev_status = Invoice.objects.get(pk=instance.pk).status
        except Invoice.DoesNotExist:
            instance._qbo_prev_status = None
    else:
        instance._qbo_prev_status = None


# Issued invoice statuses — exclude ``partial`` (auto-set when a proforma receives a deposit).
PROFORMA_FINALIZED_STATUSES = INVOICE_QBO_SYNC_STATUSES - {'partial'}


@receiver(post_save, sender=Invoice)
def resync_payments_when_invoice_finalized(sender, instance, created, **kwargs):
    """Re-sync proforma deposits to apply against the issued QBO invoice."""
    if created:
        return
    prev = getattr(instance, '_qbo_prev_status', None)
    leaving_deposit_stage = (
        prev == 'proforma'
        or (prev == 'partial' and _is_proforma_numbered_invoice(instance))
    )
    if leaving_deposit_stage and instance.status in PROFORMA_FINALIZED_STATUSES:
        task_resync_payments_for_invoice.delay(instance.id)


@receiver(post_save, sender=Part)
def sync_part_on_save(sender, instance, created, **kwargs):
    """Push active parts catalog to QBO Items when auto-sync is enabled."""
    if not _auto_sync_enabled():
        return
    if not instance.is_active:
        return
    logger.info('Triggering QBO sync for Part %s', instance.id)
    task_sync_part_to_qbo.delay(instance.id)


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
    Trigger QBO sync when an approved PurchaseOrder is saved.
    """
    if not _auto_sync_enabled():
        return
    if not is_outbound_eligible('purchase_order', instance):
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


@receiver(post_save, sender=Estimate)
def sync_estimate_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when an estimate is sent or approved."""
    if not _auto_sync_enabled():
        return
    if not is_outbound_eligible('estimate', instance):
        return
    logger.info(f"Triggering QBO sync for Estimate {instance.id}")
    task_sync_estimate_to_qbo.delay(instance.id)


@receiver(post_save, sender=CreditNote)
def sync_credit_note_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when a credit note is issued."""
    if not _auto_sync_enabled():
        return
    if not is_outbound_eligible('credit_note', instance):
        return
    logger.info(f"Triggering QBO sync for CreditNote {instance.id}")
    task_sync_credit_note_to_qbo.delay(instance.id)


@receiver(post_save, sender=Bill)
def sync_vendor_bill_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when a vendor bill is open or paid."""
    if not _auto_sync_enabled():
        return
    if not is_outbound_eligible('vendor_bill', instance):
        return
    logger.info(f"Triggering QBO sync for Bill {instance.id}")
    task_sync_vendor_bill_to_qbo.delay(instance.id)


@receiver(post_save, sender=VendorCredit)
def sync_vendor_credit_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when a vendor credit is issued."""
    if not _auto_sync_enabled():
        return
    if not is_outbound_eligible('vendor_credit', instance):
        return
    logger.info(f"Triggering QBO sync for VendorCredit {instance.id}")
    task_sync_vendor_credit_to_qbo.delay(instance.id)
