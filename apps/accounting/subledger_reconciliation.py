"""AR/AP subledger reconciliation against GL control accounts."""
from decimal import Decimal

from django.db.models import Q, Sum

from apps.accounting.models import AccountingControl
from apps.accounting.services import ReportingService
from apps.billing.models import Bill, CreditNote, Invoice, Payment, VendorCredit


OPEN_INVOICE_STATUSES = ['sent', 'viewed', 'partial', 'overdue', 'open']
OPEN_BILL_STATUSES = ['open', 'partially_paid', 'overdue']


def _money(value):
    return Decimal(str(value or 0)).quantize(Decimal('0.01'))


def _payment_prepayment_excess(payment):
    """Operational unapplied customer prepayment for a completed payment."""
    net = Decimal(str(payment.amount or 0)) - Decimal(str(payment.refund_amount or 0))
    net = net.quantize(Decimal('0.01'))
    allocated = sum(
        Decimal(str(alloc.amount or 0)) for alloc in payment.allocations.all()
    ) or Decimal('0')
    if allocated:
        return max(Decimal('0'), (net - allocated).quantize(Decimal('0.01')))
    if payment.invoice_id:
        invoice_total = Decimal(str(payment.invoice.total or 0))
        return max(Decimal('0'), (net - invoice_total).quantize(Decimal('0.01')))
    return net if net > 0 else Decimal('0')


def compute_operational_customer_prepayments(*, branch_id=None):
    """Sum unapplied customer prepayment amounts from completed payments."""
    payments = Payment.objects.filter(status='completed').prefetch_related(
        'allocations', 'invoice'
    )
    if branch_id:
        payments = payments.filter(
            Q(invoice__branch_id=branch_id)
            | Q(allocations__invoice__branch_id=branch_id)
        ).distinct()

    total = Decimal('0')
    for payment in payments:
        total += _payment_prepayment_excess(payment)
    return _money(total)


def reconcile_subledgers(*, branch_id=None, as_of_date=None):
    """
    Compare GL control balances to operational AR/AP subledgers.

    AR uses net customer receivable:
      (AR GL - customer prepayment GL) vs (open invoice due - unapplied CN - operational prepayments)

    This matches docs/ACCOUNTING-POSTING-STANDARD.md section 14.
    """
    controls = AccountingControl.get_settings()
    tolerance = Decimal('0.01')

    ar_account = controls.accounts_receivable_account
    ap_account = controls.accounts_payable_account
    prepayment_account = controls.customer_prepayment_account

    invoices = Invoice.objects.exclude(
        status__in=['void', 'refunded', 'draft', 'proforma', 'paid']
    ).filter(status__in=OPEN_INVOICE_STATUSES)
    if branch_id:
        invoices = invoices.filter(branch_id=branch_id)

    ar_subledger = _money(
        invoices.aggregate(total=Sum('amount_due'))['total']
    )
    ar_positive_subledger = _money(
        invoices.filter(amount_due__gt=0).aggregate(total=Sum('amount_due'))['total']
    )

    credit_notes = CreditNote.objects.filter(status='issued')
    if branch_id:
        credit_notes = credit_notes.filter(branch_id=branch_id)
    unapplied_customer_credit_notes = _money(
        credit_notes.filter(unused_amount__gt=0).aggregate(total=Sum('unused_amount'))['total']
    )
    ar_subledger_net = (ar_positive_subledger - unapplied_customer_credit_notes).quantize(Decimal('0.01'))

    operational_customer_prepayments = compute_operational_customer_prepayments(branch_id=branch_id)
    ar_subledger_net_of_prepayments = (
        ar_subledger_net - operational_customer_prepayments
    ).quantize(Decimal('0.01'))

    bills = Bill.objects.filter(status__in=OPEN_BILL_STATUSES)
    if branch_id:
        bills = bills.filter(branch_id=branch_id)
    ap_subledger = _money(
        bills.filter(amount_due__gt=0).aggregate(total=Sum('amount_due'))['total']
    )

    vendor_credits = VendorCredit.objects.filter(status='issued')
    if branch_id:
        vendor_credits = vendor_credits.filter(branch_id=branch_id)
    unapplied_vendor_credits = _money(
        vendor_credits.filter(unused_amount__gt=0).aggregate(total=Sum('unused_amount'))['total']
    )
    ap_subledger_net = (ap_subledger - unapplied_vendor_credits).quantize(Decimal('0.01'))

    ar_gl = _money(
        ReportingService.get_account_balance(ar_account, date=as_of_date, branch_id=branch_id)
        if ar_account else 0
    )
    ap_gl = _money(
        ReportingService.get_account_balance(ap_account, date=as_of_date, branch_id=branch_id)
        if ap_account else 0
    )
    prepayment_gl = _money(
        ReportingService.get_account_balance(
            prepayment_account, date=as_of_date, branch_id=branch_id
        )
        if prepayment_account else 0
    )

    ar_net_gl = (ar_gl - prepayment_gl).quantize(Decimal('0.01'))
    ar_difference = (ar_net_gl - ar_subledger_net_of_prepayments).quantize(Decimal('0.01'))
    ap_difference = (ap_gl - ap_subledger_net).quantize(Decimal('0.01'))

    return {
        'as_of_date': as_of_date.isoformat() if as_of_date else None,
        'branch_id': branch_id,
        'tolerance': float(tolerance),
        'accounts_receivable': {
            'gl_balance': float(ar_gl),
            'prepayment_gl_balance': float(prepayment_gl),
            'net_gl_balance': float(ar_net_gl),
            'operational_prepayments': float(operational_customer_prepayments),
            'subledger_balance': float(ar_positive_subledger),
            'unapplied_customer_credit_notes': float(unapplied_customer_credit_notes),
            'subledger_net_of_credits': float(ar_subledger_net),
            'subledger_net_of_credits_and_prepayments': float(ar_subledger_net_of_prepayments),
            'subledger_including_credits': float(ar_subledger),
            'difference': float(ar_difference),
            'in_balance': abs(ar_difference) <= tolerance,
            'open_invoice_count': invoices.filter(amount_due__gt=0).count(),
            'open_credit_note_count': credit_notes.filter(unused_amount__gt=0).count(),
            'control_account_id': ar_account.id if ar_account else None,
            'control_account_code': ar_account.code if ar_account else None,
        },
        'accounts_payable': {
            'gl_balance': float(ap_gl),
            'subledger_balance': float(ap_subledger),
            'unapplied_vendor_credits': float(unapplied_vendor_credits),
            'subledger_net_of_credits': float(ap_subledger_net),
            'difference': float(ap_difference),
            'in_balance': abs(ap_difference) <= tolerance,
            'open_bill_count': bills.filter(amount_due__gt=0).count(),
            'open_vendor_credit_count': vendor_credits.filter(unused_amount__gt=0).count(),
            'control_account_id': ap_account.id if ap_account else None,
            'control_account_code': ap_account.code if ap_account else None,
        },
        'customer_prepayments': {
            'gl_balance': float(prepayment_gl),
            'operational_balance': float(operational_customer_prepayments),
            'control_account_id': prepayment_account.id if prepayment_account else None,
            'control_account_code': prepayment_account.code if prepayment_account else None,
            'configured': prepayment_account is not None,
        },
        'overall_in_balance': (
            abs(ar_difference) <= tolerance and abs(ap_difference) <= tolerance
        ),
    }
