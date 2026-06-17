"""VAT return filing workflow with GL payment posting."""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.accounting.models import VatReturn
from apps.accounting.services import AccountingService, ReportingService


class VatFilingService:
  @staticmethod
  def create_from_worksheet(period_start, period_end, branch=None, user=None, notes=''):
    worksheet_data = ReportingService.get_vat_return(
      period_start, period_end, branch_id=getattr(branch, 'id', None)
    )
    existing = VatReturn.objects.filter(
      period_start=period_start,
      period_end=period_end,
      branch=branch,
    ).first()
    if existing:
      raise ValidationError('A VAT return already exists for this period and branch.')

    return VatReturn.objects.create(
      period_start=period_start,
      period_end=period_end,
      branch=branch,
      worksheet=worksheet_data.get('worksheet', {}),
      status='draft',
      notes=notes,
      created_by=user,
    )

  @staticmethod
  def review(vat_return, user=None):
    if vat_return.status != 'draft':
      raise ValidationError('Only draft VAT returns can be reviewed.')
    vat_return.status = 'reviewed'
    vat_return.save(update_fields=['status', 'updated_at'])
    return vat_return

  @staticmethod
  def file_return(vat_return, filing_reference='', user=None):
    if vat_return.status not in ('draft', 'reviewed'):
      raise ValidationError('Only draft or reviewed VAT returns can be filed.')
    vat_return.status = 'filed'
    vat_return.filing_reference = filing_reference or vat_return.filing_reference
    vat_return.filed_at = timezone.now()
    vat_return.filed_by = user
    vat_return.save(update_fields=[
      'status', 'filing_reference', 'filed_at', 'filed_by', 'updated_at',
    ])
    return vat_return

  @staticmethod
  @transaction.atomic
  def record_payment(vat_return, payment_reference='', user=None, payment_date=None):
    if vat_return.status != 'filed':
      raise ValidationError('Only filed VAT returns can be marked as paid.')
    if vat_return.payment_journal_entry_id:
      raise ValidationError('Payment has already been recorded for this VAT return.')

    net_payable = Decimal(str(vat_return.worksheet.get('net_vat_payable', 0)))
    if net_payable <= 0:
      raise ValidationError('No VAT liability to pay for this return.')

    je = AccountingService.post_vat_payment(
      amount=net_payable,
      branch=vat_return.branch,
      user=user,
      payment_date=payment_date or timezone.now().date(),
      reference=payment_reference or f"VAT-{vat_return.period_end}",
      vat_return=vat_return,
    )
    vat_return.status = 'paid'
    vat_return.paid_at = timezone.now()
    vat_return.payment_reference = payment_reference
    vat_return.payment_journal_entry = je
    vat_return.save(update_fields=[
      'status', 'paid_at', 'payment_reference', 'payment_journal_entry', 'updated_at',
    ])
    return vat_return
