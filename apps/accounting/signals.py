from django.db.models.signals import post_save, pre_save, pre_delete
from django.dispatch import receiver
from django.core.exceptions import ValidationError
from apps.billing.models import Invoice, Bill, Payment, BillPayment, CreditNote, Refund, CashierTill
from apps.hr.models import PayrollPeriod
from apps.inventory.models import InventoryTransaction, Transfer
from .services import AccountingService
from .models import JournalEntry, AccountingControl, AuditLog, Transaction, FundTransfer

FINALIZED_INVOICE_STATUSES = ['sent', 'viewed', 'partial', 'paid', 'overdue']
FINALIZED_BILL_STATUSES = ['open', 'partial', 'paid', 'overdue']

@receiver(post_save, sender=Invoice)
def post_invoice_to_ledger(sender, instance, created, **kwargs):
    """
    Automated posting when Invoice is financially finalized
    """
    if instance.status in FINALIZED_INVOICE_STATUSES:
        AccountingService.post_invoice(instance)
        AccountingService.post_cogs(instance)

@receiver(post_save, sender=PayrollPeriod)
def post_payroll_to_ledger(sender, instance, created, **kwargs):
    if instance.status == 'paid':
        AccountingService.post_payroll(instance)

@receiver(post_save, sender=Bill)
def post_bill_to_ledger(sender, instance, created, **kwargs):
    if instance.status in FINALIZED_BILL_STATUSES:
        AccountingService.post_bill(instance)

@receiver(post_save, sender=Payment)
def post_payment_to_ledger(sender, instance, created, **kwargs):
    if instance.status == 'completed':
        AccountingService.post_payment(instance)

@receiver(post_save, sender=BillPayment)
def post_bill_payment_to_ledger(sender, instance, created, **kwargs):
    AccountingService.post_bill_payment(instance)

@receiver([pre_save, pre_delete], sender=JournalEntry)
def validate_period_lock(sender, instance, **kwargs):
    settings = AccountingControl.get_settings()
    if not settings.period_lock_date:
        return

    if instance.date and instance.date <= settings.period_lock_date:
        if getattr(instance, '_bypass_period_lock', False):
            return
        raise ValidationError(
            f"Accounting period is locked up to {settings.period_lock_date}. Cannot modify entries dated {instance.date}."
        )

@receiver([pre_save, pre_delete], sender=Transaction)
def validate_transaction_period_lock(sender, instance, **kwargs):
    settings = AccountingControl.get_settings()
    if not settings.period_lock_date:
        return

    if instance.journal_entry and instance.journal_entry.date <= settings.period_lock_date:
        if getattr(instance, '_bypass_period_lock', False):
            return
        raise ValidationError(
            f"Accounting period is locked up to {settings.period_lock_date}. Cannot modify transaction dated {instance.journal_entry.date}."
        )

@receiver(post_save, sender=JournalEntry)
def log_journal_entry_change(sender, instance, created, **kwargs):
    action = 'create' if created else 'update'
    user = getattr(instance, '_current_user', None)
    AuditLog.objects.create(
        user=user,
        action=action,
        resource_type='JournalEntry',
        resource_id=str(instance.id),
        details=f"Description: {instance.description}, Totals: {instance.transactions.count()} lines, Posted: {instance.posted}"
    )

@receiver(pre_delete, sender=JournalEntry)
def log_journal_entry_delete(sender, instance, **kwargs):
    user = getattr(instance, '_current_user', None)
    AuditLog.objects.create(
        user=user,
        action='delete',
        resource_type='JournalEntry',
        resource_id=str(instance.id),
        details=f"Deleted JE dated {instance.date}"
    )

@receiver(post_save, sender=InventoryTransaction)
def post_inventory_transaction_to_ledger(sender, instance, created, **kwargs):
    if created and instance.transaction_type in ['adjustment', 'damage', 'count']:
        AccountingService.post_inventory_adjustment(instance)

@receiver(post_save, sender=CreditNote)
def post_credit_note_to_ledger(sender, instance, created, **kwargs):
    if instance.status == 'issued':
        AccountingService.post_credit_note(instance)

@receiver(post_save, sender=Refund)
def post_refund_to_ledger(sender, instance, created, **kwargs):
    if instance.status == 'completed':
        AccountingService.post_refund(instance)

@receiver(post_save, sender=Transfer)
def post_transfer_to_ledger(sender, instance, created, **kwargs):
    if instance.status == 'received':
        AccountingService.post_inter_branch_transfer(instance)

@receiver(post_save, sender=CashierTill)
def post_till_to_ledger(sender, instance, created, **kwargs):
    if created and instance.status == 'open':
        AccountingService.post_till_open(instance)
    elif instance.status == 'closed' and instance.closing_balance:
        existing = JournalEntry.objects.filter(reference=f"TILL-{instance.id}-CLOSE").exists()
        if not existing:
            AccountingService.post_till_close(instance)

@receiver(post_save, sender=FundTransfer)
def post_fund_transfer_to_ledger(sender, instance, created, **kwargs):
    if instance.status == 'completed' and not instance.journal_entry:
        AccountingService.post_fund_transfer(instance)
