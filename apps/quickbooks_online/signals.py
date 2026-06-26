from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver
from django.conf import settings
from apps.customers.models import Customer
from apps.billing.models import Invoice, Payment, Estimate, CreditNote, Bill, VendorCredit, PaymentAllocation
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
    task_sync_invoice_then_resync_payments,
)
from .sync_policy import is_outbound_eligible, INVOICE_QBO_SYNC_STATUSES
from .sync_context import outbound_signals_suppressed
from .payment_helpers import _is_proforma_numbered_invoice
from .task_dispatch import schedule_entity_sync, schedule_part_sync
from .status_sync import capture_status_before_save, status_became_eligible
import logging

logger = logging.getLogger(__name__)


def _auto_sync_enabled():
    return getattr(settings, 'QUICKBOOKS_AUTO_SYNC_ENABLED', True)


def _skip_signal():
    return not _auto_sync_enabled() or outbound_signals_suppressed()

@receiver(post_save, sender=Customer)
def sync_customer_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when a Customer is saved."""
    if _skip_signal():
        return
    if not is_outbound_eligible('customer', instance):
        return
    logger.info(f"Scheduling QBO sync for Customer {instance.id}")
    schedule_entity_sync('customer', instance.id, task=task_sync_customer_to_qbo)


@receiver(post_save, sender=Invoice)
def sync_invoice_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when a finalized Invoice is saved."""
    if _skip_signal():
        return
    if not is_outbound_eligible('invoice', instance):
        return

    prev = getattr(instance, '_qbo_prev_status', None)
    leaving_deposit_stage = (
        prev == 'proforma'
        or (prev == 'partial' and _is_proforma_numbered_invoice(instance))
    )
    if leaving_deposit_stage and instance.status in PROFORMA_FINALIZED_STATUSES:
        logger.info(
            'Scheduling chained QBO invoice + payment sync for finalized Invoice %s',
            instance.id,
        )
        schedule_entity_sync(
            'invoice_finalize',
            instance.id,
            task=task_sync_invoice_then_resync_payments,
        )
        return

    logger.info(f"Scheduling QBO sync for Invoice {instance.id}")
    schedule_entity_sync('invoice', instance.id, task=task_sync_invoice_to_qbo)


@receiver(post_save, sender=Payment)
def sync_payment_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when a completed Payment is saved."""
    if _skip_signal():
        return
    if not is_outbound_eligible('payment', instance):
        return
    if status_became_eligible('payment', instance):
        logger.info('Payment %s became eligible for QBO sync (status change)', instance.id)
    logger.info(f"Scheduling QBO sync for Payment {instance.id}")
    schedule_entity_sync('payment', instance.id, task=task_sync_payment_to_qbo)


@receiver(pre_save, sender=Invoice)
def capture_invoice_status_before_save(sender, instance, **kwargs):
    capture_status_before_save(instance, Invoice)


@receiver(pre_save, sender=Payment)
def capture_payment_status_before_save(sender, instance, **kwargs):
    capture_status_before_save(instance, Payment)


@receiver(pre_save, sender=Estimate)
def capture_estimate_status_before_save(sender, instance, **kwargs):
    capture_status_before_save(instance, Estimate)


@receiver(pre_save, sender=CreditNote)
def capture_credit_note_status_before_save(sender, instance, **kwargs):
    capture_status_before_save(instance, CreditNote)


@receiver(pre_save, sender=Bill)
def capture_vendor_bill_status_before_save(sender, instance, **kwargs):
    capture_status_before_save(instance, Bill)


@receiver(pre_save, sender=VendorCredit)
def capture_vendor_credit_status_before_save(sender, instance, **kwargs):
    capture_status_before_save(instance, VendorCredit)


# Issued invoice statuses — exclude ``partial`` (auto-set when a proforma receives a deposit).
PROFORMA_FINALIZED_STATUSES = INVOICE_QBO_SYNC_STATUSES - {'partial'}


def _schedule_payment_sync(payment):
    if _skip_signal() or not payment:
        return
    if is_outbound_eligible('payment', payment):
        schedule_entity_sync('payment', payment.id, task=task_sync_payment_to_qbo)


@receiver(post_save, sender=PaymentAllocation)
def sync_payment_on_allocation_save(sender, instance, **kwargs):
    """Re-push payment when allocation rows change."""
    _schedule_payment_sync(instance.payment)


@receiver(post_delete, sender=PaymentAllocation)
def sync_payment_on_allocation_delete(sender, instance, **kwargs):
    """Re-push payment when an allocation is removed."""
    _schedule_payment_sync(instance.payment)


@receiver(post_save, sender=Part)
def sync_part_on_save(sender, instance, created, **kwargs):
    """Push parts catalog to QBO Items (including deactivation as Active=False)."""
    if _skip_signal():
        return
    logger.info('Scheduling QBO sync for Part %s', instance.id)
    schedule_part_sync(instance.id)


@receiver(post_save, sender=Supplier)
def sync_supplier_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when a Supplier is saved."""
    if _skip_signal():
        return
    logger.info(f"Scheduling QBO sync for Supplier {instance.id}")
    schedule_entity_sync('supplier', instance.id, task=task_sync_supplier_to_qbo)


@receiver(post_save, sender=PurchaseOrder)
def sync_purchase_order_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when an approved PurchaseOrder is saved."""
    if _skip_signal():
        return
    if not is_outbound_eligible('purchase_order', instance):
        return
    logger.info(f"Scheduling QBO sync for PurchaseOrder {instance.id}")
    schedule_entity_sync('purchase_order', instance.id, task=task_sync_purchase_order_to_qbo)


@receiver(post_save, sender=Branch)
def sync_branch_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when a Branch is created or updated."""
    if _skip_signal():
        return
    logger.info(f"Scheduling QBO sync for Branch {instance.id} ({instance.name})")
    schedule_entity_sync('branch', instance.id, task=task_sync_branch_to_qbo)


@receiver(post_save, sender=Estimate)
def sync_estimate_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when an estimate is sent or approved."""
    if _skip_signal():
        return
    if not is_outbound_eligible('estimate', instance):
        return
    if status_became_eligible('estimate', instance):
        logger.info('Estimate %s became eligible for QBO sync (status change)', instance.id)
    logger.info(f"Scheduling QBO sync for Estimate {instance.id}")
    schedule_entity_sync('estimate', instance.id, task=task_sync_estimate_to_qbo)


@receiver(post_save, sender=CreditNote)
def sync_credit_note_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when a credit note is issued."""
    if _skip_signal():
        return
    if not is_outbound_eligible('credit_note', instance):
        return
    if status_became_eligible('credit_note', instance):
        logger.info('CreditNote %s became eligible for QBO sync (status change)', instance.id)
    logger.info(f"Scheduling QBO sync for CreditNote {instance.id}")
    schedule_entity_sync('credit_note', instance.id, task=task_sync_credit_note_to_qbo)


@receiver(post_save, sender=Bill)
def sync_vendor_bill_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when a vendor bill is open or paid."""
    if _skip_signal():
        return
    if not is_outbound_eligible('vendor_bill', instance):
        return
    if status_became_eligible('vendor_bill', instance):
        logger.info('Bill %s became eligible for QBO sync (status change)', instance.id)
    logger.info(f"Scheduling QBO sync for Bill {instance.id}")
    schedule_entity_sync('vendor_bill', instance.id, task=task_sync_vendor_bill_to_qbo)


@receiver(post_save, sender=VendorCredit)
def sync_vendor_credit_on_save(sender, instance, created, **kwargs):
    """Trigger QBO sync when a vendor credit is issued."""
    if _skip_signal():
        return
    if not is_outbound_eligible('vendor_credit', instance):
        return
    if status_became_eligible('vendor_credit', instance):
        logger.info('VendorCredit %s became eligible for QBO sync (status change)', instance.id)
    logger.info(f"Scheduling QBO sync for VendorCredit {instance.id}")
    schedule_entity_sync('vendor_credit', instance.id, task=task_sync_vendor_credit_to_qbo)
