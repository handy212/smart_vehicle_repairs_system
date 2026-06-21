"""
Billing signals — customer AR balance sync.

GL posting lives in apps.accounting.signals; this module keeps Customer.current_balance
in sync with open invoice amount_due totals.
"""
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.billing.customer_statement import schedule_customer_balance_sync
from apps.billing.models import CreditNoteApplication, Invoice, Payment


def _invoice_customer_id(invoice):
  return getattr(invoice, 'customer_id', None)


@receiver(post_save, sender=Invoice)
def sync_customer_balance_on_invoice_save(sender, instance, **kwargs):
  schedule_customer_balance_sync(_invoice_customer_id(instance))


@receiver(post_delete, sender=Invoice)
def sync_customer_balance_on_invoice_delete(sender, instance, **kwargs):
  schedule_customer_balance_sync(_invoice_customer_id(instance))


@receiver(post_save, sender=Payment)
def sync_customer_balance_on_payment_save(sender, instance, **kwargs):
  schedule_customer_balance_sync(getattr(instance, 'customer_id', None))


@receiver(post_save, sender=CreditNoteApplication)
def sync_customer_balance_on_credit_application_save(sender, instance, **kwargs):
  schedule_customer_balance_sync(getattr(instance.invoice, 'customer_id', None))


@receiver(post_delete, sender=CreditNoteApplication)
def sync_customer_balance_on_credit_application_delete(sender, instance, **kwargs):
  schedule_customer_balance_sync(getattr(instance.invoice, 'customer_id', None))
