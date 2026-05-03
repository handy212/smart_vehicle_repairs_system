from django.db.models.signals import post_save
from django.dispatch import receiver
from apps.billing.models import Invoice
from .services import AccountingService

@receiver(post_save, sender=Invoice)
def post_invoice_to_ledger(sender, instance, created, **kwargs):
    """
    Automated posting when Invoice is issued or paid
    """
    if instance.status in AccountingService.FINALIZED_INVOICE_STATUSES:
        AccountingService.post_invoice(instance)
        # Also post COGS
        AccountingService.post_cogs(instance)

from apps.billing.models import Bill
from apps.hr.models import PayrollPeriod

@receiver(post_save, sender=PayrollPeriod)
def post_payroll_to_ledger(sender, instance, created, **kwargs):
    """
    Automated posting when Payroll is marked as Paid
    """
    if instance.status == 'paid':
        # Check if already posted? post_payroll service might handle it, but let's check here too or rely on service idempotency
        # The service checks `if not payroll_period.journal_entry` usually.
        # Let's trust the service or check if JE exists.
        AccountingService.post_payroll(instance)


@receiver(post_save, sender=Bill)
def post_bill_to_ledger(sender, instance, created, **kwargs):
    """
    Automated posting when Bill is finalized
    """
    if instance.status in ['open', 'paid']:
        AccountingService.post_bill(instance)

from apps.billing.models import Payment, BillPayment

@receiver(post_save, sender=Payment)
def post_payment_to_ledger(sender, instance, created, **kwargs):
    """
    Automated posting when Customer Payment is completed
    """
    if instance.status == 'completed':
        AccountingService.post_payment(instance)

@receiver(post_save, sender=BillPayment)
def post_bill_payment_to_ledger(sender, instance, created, **kwargs):
    """
    Automated posting when Vendor Bill Payment is created
    """
    # BillPayment is typically 'completed' upon creation usually, or has no status field yet
    # Assuming it's valid if created
    AccountingService.post_bill_payment(instance)

from django.db.models.signals import pre_save, pre_delete
from django.core.exceptions import ValidationError
from .models import JournalEntry, AccountingControl, AuditLog

@receiver([pre_save, pre_delete], sender=JournalEntry)
def validate_period_lock(sender, instance, **kwargs):
    """
    Prevent modification of Journal Entries in locked periods
    """
    # Get lock date
    settings = AccountingControl.get_settings()
    if not settings.period_lock_date:
        return

    # Check if instance date is within locked period
    if instance.date and instance.date <= settings.period_lock_date:
        # Check for a temporary bypass flag (used during branch hard deletions)
        if getattr(instance, '_bypass_period_lock', False):
            return
            
        raise ValidationError(f"Accounting period is locked up to {settings.period_lock_date}. Cannot modify entries dated {instance.date}.")

@receiver(post_save, sender=JournalEntry)
def log_journal_entry_change(sender, instance, created, **kwargs):
    """
    Log creation/update of Journal Entries
    """
    action = 'create' if created else 'update'
    
    # Try to get user from instance if available (custom attribute passed during save)
    user = getattr(instance, '_current_user', None)
    
    AuditLog.objects.create(
        user=user,
        action=action,
        resource_type='JournalEntry',
        resource_id=str(instance.id),
        details=f"Description: {instance.description}, Totals: {instance.transactions.count()} lines"
    )

@receiver(pre_delete, sender=JournalEntry)
def log_journal_entry_delete(sender, instance, **kwargs):
    """
    Log deletion of Journal Entries
    """
    user = getattr(instance, '_current_user', None)
    
    AuditLog.objects.create(
        user=user,
        action='delete',
        resource_type='JournalEntry',
        resource_id=str(instance.id),
        details=f"Deleted JE dated {instance.date}"
    )

# ========================================================================
# PHASE 7: OPERATIONAL INTEGRATION SIGNALS
# ========================================================================

from apps.inventory.models import InventoryTransaction, Transfer
from apps.billing.models import CreditNote, Refund

@receiver(post_save, sender=InventoryTransaction)
def post_inventory_transaction_to_ledger(sender, instance, created, **kwargs):
    """
    Auto-post GL entry for inventory adjustments (damage, count, adjustment)
    """
    if created and instance.transaction_type in ['adjustment', 'damage', 'count']:
        AccountingService.post_inventory_adjustment(instance)

@receiver(post_save, sender=CreditNote)
def post_credit_note_to_ledger(sender, instance, created, **kwargs):
    """
    Auto-post GL entry for Credit Notes (revenue reversal)
    """
    if instance.status == 'issued':
        AccountingService.post_credit_note(instance)

@receiver(post_save, sender=Refund)
def post_refund_to_ledger(sender, instance, created, **kwargs):
    """
    Auto-post GL entry for cash refunds
    """
    if instance.status == 'completed':
        AccountingService.post_refund(instance)

@receiver(post_save, sender=Transfer)
def post_transfer_to_ledger(sender, instance, created, **kwargs):
    """
    Auto-post GL entries for inter-branch transfers (Due To/Due From)
    """
    if instance.status == 'received':
        AccountingService.post_inter_branch_transfer(instance)

# ========================================================================
# PHASE 8: CASH & BANKING SIGNALS
# ========================================================================

from apps.billing.models import CashierTill
from apps.accounting.models import FundTransfer

@receiver(post_save, sender=CashierTill)
def post_till_to_ledger(sender, instance, created, **kwargs):
    """
    Auto-post GL entries for till open/close
    """
    if created and instance.status == 'open':
        AccountingService.post_till_open(instance)
    elif instance.status == 'closed' and instance.closing_balance:
        # Check if not already posted by looking for existing JE
        existing = JournalEntry.objects.filter(reference=f"TILL-{instance.id}-CLOSE").exists()
        if not existing:
            AccountingService.post_till_close(instance)

@receiver(post_save, sender=FundTransfer)
def post_fund_transfer_to_ledger(sender, instance, created, **kwargs):
    """
    Auto-post GL entries for completed fund transfers
    """
    if instance.status == 'completed' and not instance.journal_entry:
        AccountingService.post_fund_transfer(instance)
