"""
Shared helpers for recording gateway (Paystack, etc.) customer payments.
"""
from __future__ import annotations

import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.accounting.settlement_accounts import resolve_default_bank_settlement_account
from apps.billing.models import Payment

logger = logging.getLogger(__name__)


def parse_gateway_paid_at(paid_at_value):
    """Normalize gateway paid_at (string or datetime) to an aware datetime."""
    if paid_at_value is None:
        return timezone.now()

    if isinstance(paid_at_value, str):
        parsed = parse_datetime(paid_at_value)
        if parsed is None:
            return timezone.now()
        paid_at_value = parsed

    if hasattr(paid_at_value, 'year'):
        if timezone.is_naive(paid_at_value):
            return timezone.make_aware(paid_at_value, timezone.get_current_timezone())
        return paid_at_value

    return timezone.now()


def resolve_gateway_processed_by(invoice, customer=None):
    """Pick a non-null user for Payment.processed_by (required FK)."""
    customer = customer or getattr(invoice, 'customer', None)
    if customer is not None:
        user = getattr(customer, 'user', None)
        if user is not None:
            return user
    created_by = getattr(invoice, 'created_by', None)
    if created_by is not None:
        return created_by

    from django.contrib.auth import get_user_model

    User = get_user_model()
    fallback = (
        User.objects.filter(is_active=True, is_superuser=True).order_by('id').first()
        or User.objects.filter(is_active=True, is_staff=True).order_by('id').first()
        or User.objects.filter(is_active=True).order_by('id').first()
    )
    if fallback is None:
        raise ValueError(
            'Cannot record gateway payment: no user available for processed_by.'
        )
    return fallback


def ensure_payment_settlement_account(payment):
    """
    Ensure a completed non-cash payment has a settlement bank account.
    Also repairs invoice paid totals when a prior create failed mid-save
    after the payment row was inserted (ledger ValidationError path).
    Returns the account used, or None if none could be resolved.
    """
    if payment.payment_method == 'cash':
        return payment.till.till_account if payment.till_id else None

    account = None
    if payment.bank_account_id:
        account = payment.bank_account
        if not (
            account
            and account.is_active
            and account.account_type == 'asset'
            and account.account_subtype in {'bank', 'cash_equivalent'}
            and account.is_leaf
        ):
            account = None

    if account is None:
        bank_account = resolve_default_bank_settlement_account()
        if bank_account is None:
            return None
        if payment.bank_account_id != bank_account.id:
            payment.bank_account = bank_account
            payment.save(update_fields=['bank_account', 'updated_at'])
        account = bank_account

    if payment.status == 'completed' and payment.invoice_id:
        invoice = payment.invoice
        invoice.refresh_from_db()
        if invoice.amount_due > 0 or invoice.status != 'paid':
            # Mid-save failures can leave a completed payment without invoice update.
            invoice.recalculate_amount_paid_from_collections()

    return account


def record_gateway_payment(
    *,
    invoice,
    amount,
    payment_method,
    transaction_id,
    notes='',
    paid_at=None,
    processed_by=None,
    status='completed',
):
    """
    Create (or return existing) completed gateway payment with settlement account.

    Raises ValueError when AccountingControl.default_bank_account is not configured.
    """
    existing = Payment.objects.filter(transaction_id=transaction_id).first()
    if existing:
        if existing.status == 'completed':
            ensure_payment_settlement_account(existing)
        return existing, False

    bank_account = resolve_default_bank_settlement_account()
    if bank_account is None:
        raise ValueError(
            'AccountingControl.default_bank_account is not configured as an active '
            'leaf bank/cash-equivalent account. Configure it before accepting gateway payments.'
        )

    if processed_by is None:
        processed_by = resolve_gateway_processed_by(invoice)

    amount = Decimal(str(amount)).quantize(Decimal('0.01'))
    payment_date = parse_gateway_paid_at(paid_at)

    with transaction.atomic():
        payment = Payment(
            invoice=invoice,
            customer=invoice.customer,
            amount=amount,
            payment_method=payment_method,
            status=status,
            transaction_id=transaction_id,
            payment_date=payment_date,
            notes=notes or '',
            processed_by=processed_by,
            bank_account=bank_account,
        )
        payment._allow_paid_invoice_gateway_payment = True
        payment.save()
        invoice.recalculate_amount_paid_from_collections()

    return payment, True
