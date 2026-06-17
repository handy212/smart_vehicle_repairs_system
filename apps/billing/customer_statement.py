"""Customer account statement with running balance."""
from datetime import date
from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone

from apps.billing.models import CreditNote, Invoice, Payment, Refund


class CustomerStatementService:
  EXCLUDED_INVOICE_STATUSES = {'void', 'cancelled', 'draft'}
  EXCLUDED_PAYMENT_STATUSES = {'failed', 'void', 'cancelled'}
  EXCLUDED_CREDIT_NOTE_STATUSES = {'void', 'draft'}
  EXCLUDED_REFUND_STATUSES = {'rejected', 'cancelled', 'pending'}

  @classmethod
  def _invoice_queryset(cls, customer_id, branch_id=None):
    qs = Invoice.objects.filter(customer_id=customer_id).exclude(
      status__in=cls.EXCLUDED_INVOICE_STATUSES
    )
    if branch_id:
      qs = qs.filter(branch_id=branch_id)
    return qs

  @classmethod
  def _payment_queryset(cls, customer_id, branch_id=None):
    qs = Payment.objects.filter(customer_id=customer_id).exclude(
      status__in=cls.EXCLUDED_PAYMENT_STATUSES
    )
    if branch_id:
      qs = qs.filter(invoice__branch_id=branch_id)
    return qs

  @classmethod
  def _credit_note_queryset(cls, customer_id, branch_id=None):
    qs = CreditNote.objects.filter(customer_id=customer_id).exclude(
      status__in=cls.EXCLUDED_CREDIT_NOTE_STATUSES
    )
    if branch_id:
      qs = qs.filter(branch_id=branch_id)
    return qs

  @classmethod
  def _refund_queryset(cls, customer_id, branch_id=None):
    qs = Refund.objects.filter(customer_id=customer_id).exclude(
      status__in=cls.EXCLUDED_REFUND_STATUSES
    )
    if branch_id:
      qs = qs.filter(invoice__branch_id=branch_id)
    return qs

  @classmethod
  def _refund_entry_date(cls, refund):
    dt = refund.processed_at or refund.approved_at or refund.requested_at
    return dt.date() if dt else timezone.now().date()

  @classmethod
  def _collect_entries(cls, customer_id, branch_id=None, before=None, on_or_after=None, on_or_before=None):
    entries = []

    invoice_qs = cls._invoice_queryset(customer_id, branch_id)
    if before:
      invoice_qs = invoice_qs.filter(invoice_date__lt=before)
    if on_or_after:
      invoice_qs = invoice_qs.filter(invoice_date__gte=on_or_after)
    if on_or_before:
      invoice_qs = invoice_qs.filter(invoice_date__lte=on_or_before)
    for inv in invoice_qs.only('id', 'invoice_number', 'invoice_date', 'total', 'status'):
      entries.append({
        'date': inv.invoice_date,
        'type': 'invoice',
        'reference': inv.invoice_number,
        'description': f'Invoice {inv.invoice_number}',
        'debit': Decimal(str(inv.total)),
        'credit': Decimal('0'),
        'status': inv.status,
        'source_id': inv.id,
      })

    payment_qs = cls._payment_queryset(customer_id, branch_id)
    if before:
      payment_qs = payment_qs.filter(payment_date__lt=before)
    if on_or_after:
      payment_qs = payment_qs.filter(payment_date__gte=on_or_after)
    if on_or_before:
      payment_qs = payment_qs.filter(payment_date__lte=on_or_before)
    for pay in payment_qs.select_related('invoice').only(
      'id', 'payment_number', 'payment_date', 'amount', 'status', 'invoice__invoice_number'
    ):
      entries.append({
        'date': pay.payment_date,
        'type': 'payment',
        'reference': pay.payment_number,
        'description': f'Payment {pay.payment_number}',
        'debit': Decimal('0'),
        'credit': Decimal(str(pay.amount)),
        'status': pay.status,
        'source_id': pay.id,
      })

    credit_qs = cls._credit_note_queryset(customer_id, branch_id)
    if before:
      credit_qs = credit_qs.filter(credit_date__lt=before)
    if on_or_after:
      credit_qs = credit_qs.filter(credit_date__gte=on_or_after)
    if on_or_before:
      credit_qs = credit_qs.filter(credit_date__lte=on_or_before)
    for cn in credit_qs.only('id', 'credit_note_number', 'credit_date', 'total', 'status'):
      entries.append({
        'date': cn.credit_date,
        'type': 'credit_note',
        'reference': cn.credit_note_number,
        'description': f'Credit Note {cn.credit_note_number}',
        'debit': Decimal('0'),
        'credit': Decimal(str(cn.total)),
        'status': cn.status,
        'source_id': cn.id,
      })

    refund_qs = cls._refund_queryset(customer_id, branch_id)
    if before:
      refund_qs = refund_qs.filter(requested_at__date__lt=before)
    if on_or_after:
      refund_qs = refund_qs.filter(requested_at__date__gte=on_or_after)
    if on_or_before:
      refund_qs = refund_qs.filter(requested_at__date__lte=on_or_before)
    for refund in refund_qs.only(
      'id', 'refund_number', 'requested_at', 'processed_at', 'approved_at', 'amount', 'status'
    ):
      entries.append({
        'date': cls._refund_entry_date(refund),
        'type': 'refund',
        'reference': refund.refund_number,
        'description': f'Refund {refund.refund_number}',
        'debit': Decimal(str(refund.amount)),
        'credit': Decimal('0'),
        'status': refund.status,
        'source_id': refund.id,
      })

    return entries

  @classmethod
  def _balance_from_entries(cls, entries):
    total = Decimal('0')
    for entry in entries:
      total += entry['debit'] - entry['credit']
    return total.quantize(Decimal('0.01'))

  @classmethod
  def get_statement(cls, customer_id, start_date=None, end_date=None, branch_id=None):
    today = timezone.now().date()
    period_start = start_date or date(today.year, 1, 1)
    period_end = end_date or today

    opening_entries = cls._collect_entries(
      customer_id, branch_id=branch_id, before=period_start
    )
    opening_balance = cls._balance_from_entries(opening_entries)

    period_entries = cls._collect_entries(
      customer_id,
      branch_id=branch_id,
      on_or_after=period_start,
      on_or_before=period_end,
    )
    period_entries.sort(key=lambda e: (e['date'], e['type'], e['reference']))

    running = opening_balance
    transactions = []
    period_debits = Decimal('0')
    period_credits = Decimal('0')
    for entry in period_entries:
      period_debits += entry['debit']
      period_credits += entry['credit']
      running += entry['debit'] - entry['credit']
      transactions.append({
        'date': entry['date'].isoformat(),
        'type': entry['type'],
        'reference': entry['reference'],
        'description': entry['description'],
        'debit': float(entry['debit']),
        'credit': float(entry['credit']),
        'running_balance': float(running.quantize(Decimal('0.01'))),
        'status': entry['status'],
        'source_id': entry['source_id'],
      })

    closing_balance = running.quantize(Decimal('0.01'))

    return {
      'customer_id': customer_id,
      'period': {'start': period_start.isoformat(), 'end': period_end.isoformat()},
      'opening_balance': float(opening_balance),
      'closing_balance': float(closing_balance),
      'period_debits': float(period_debits.quantize(Decimal('0.01'))),
      'period_credits': float(period_credits.quantize(Decimal('0.01'))),
      'transactions': transactions,
    }

  @classmethod
  def sync_customer_balance(cls, customer):
    """Recalculate stored current_balance from open invoice amounts due."""
    from apps.customers.models import Customer

    outstanding = cls._invoice_queryset(customer.id).exclude(
      status='paid'
    ).aggregate(total=Sum('amount_due'))['total'] or Decimal('0')
    Customer.objects.filter(pk=customer.pk).update(
      current_balance=outstanding.quantize(Decimal('0.01'))
    )
    return outstanding
