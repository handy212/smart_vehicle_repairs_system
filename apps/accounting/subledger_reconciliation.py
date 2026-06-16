"""AR/AP subledger reconciliation against GL control accounts."""
from decimal import Decimal

from django.db.models import Sum

from apps.accounting.models import AccountingControl
from apps.accounting.services import ReportingService
from apps.billing.models import Bill, Invoice, VendorCredit


OPEN_INVOICE_STATUSES = ['sent', 'viewed', 'partial', 'overdue', 'open']
OPEN_BILL_STATUSES = ['open', 'partially_paid', 'overdue']


def _money(value):
    return Decimal(str(value or 0)).quantize(Decimal('0.01'))


def reconcile_subledgers(*, branch_id=None, as_of_date=None):
    """
    Compare GL control balances to operational AR/AP subledgers.

    AR subledger uses positive open invoice balances (amount_due).
    Customer prepayments are reported separately from AR.
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

    ar_difference = (ar_gl - ar_positive_subledger).quantize(Decimal('0.01'))
    ap_difference = (ap_gl - ap_subledger_net).quantize(Decimal('0.01'))

    return {
        'as_of_date': as_of_date.isoformat() if as_of_date else None,
        'branch_id': branch_id,
        'tolerance': float(tolerance),
        'accounts_receivable': {
            'gl_balance': float(ar_gl),
            'subledger_balance': float(ar_positive_subledger),
            'subledger_including_credits': float(ar_subledger),
            'difference': float(ar_difference),
            'in_balance': abs(ar_difference) <= tolerance,
            'open_invoice_count': invoices.filter(amount_due__gt=0).count(),
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
            'control_account_id': prepayment_account.id if prepayment_account else None,
            'control_account_code': prepayment_account.code if prepayment_account else None,
            'configured': prepayment_account is not None,
        },
        'overall_in_balance': (
            abs(ar_difference) <= tolerance and abs(ap_difference) <= tolerance
        ),
    }
