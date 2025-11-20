"""
Signals for billing app to integrate with Django Ledger
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from apps.billing.models import Invoice, Payment
from apps.billing.accounting_service import AccountingService


@receiver(post_save, sender=Invoice)
def invoice_post_save(sender, instance, created, **kwargs):
    """
    Create Django Ledger Invoice when our invoice is created
    
    This provides automatic AR posting and better invoice tracking.
    Falls back to manual journal entry if DL Invoice creation fails.
    """
    # Only process if invoice has a branch (work_order is optional)
    if instance.branch:
        try:
            # Sync Django Ledger invoice (creates or updates as needed)
            dl_invoice = AccountingService.create_dl_invoice(instance)
            
            # If DL Invoice creation fails, fall back to manual journal entry
            if not dl_invoice and instance.status != 'void':
                AccountingService.post_invoice_created(instance)
        except Exception as e:
            # Log error and fall back to manual journal entry
            import logging
            logger = logging.getLogger(__name__)
            logger.error(
                f"Failed to sync DL Invoice for {instance.invoice_number}: {e}",
                exc_info=True
            )
            # Fall back to manual journal entry
            try:
                if instance.status != 'void':
                    AccountingService.post_invoice_created(instance)
            except Exception:
                pass  # Logged above


@receiver(post_save, sender=Payment)
def payment_post_save(sender, instance, created, **kwargs):
    """
    Post accounting entries when payment is received
    
    Posts to Cash and Accounts Receivable when payment is completed.
    If invoice has a DL Invoice, payment will be recorded there automatically.
    Otherwise, we post manual journal entries.
    """
    if created and instance.status == 'completed':
        # Only post if payment has an invoice with branch
        if instance.invoice and instance.invoice.branch:
            try:
                # If invoice has DL Invoice, payment should be recorded via DL Receipt
                # For now, use manual journal entry (can enhance later to use DL ReceiptModel)
                AccountingService.post_payment_received(instance)
            except Exception as e:
                # Log error but don't fail payment creation
                import logging
                logger = logging.getLogger(__name__)
                logger.error(
                    f"Failed to post accounting entry for payment {instance.payment_number}: {e}",
                    exc_info=True
                )


# Import PurchaseOrder for signal registration
try:
    from apps.inventory.models import PurchaseOrder
    
    @receiver(post_save, sender=PurchaseOrder)
    def purchase_order_post_save(sender, instance, created, **kwargs):
        """
        Create Django Ledger Bill when PO is received
        
        This provides automatic AP posting and vendor payment tracking.
        """
        # Only create bill when PO status is 'received' and has branch
        if instance.status == 'received' and instance.branch:
            # Check if bill already created
            if not instance.ledger_bill:
                try:
                    AccountingService.create_dl_bill(instance)
                except Exception as e:
                    # Log error but don't fail PO update
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(
                        f"Failed to create DL Bill for PO {instance.po_number}: {e}",
                        exc_info=True
                    )
except ImportError:
    # PurchaseOrder might not be imported yet
    pass

