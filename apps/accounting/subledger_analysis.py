"""Per-document GL vs operational subledger analysis."""
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q, Sum

from apps.accounting.gl_posting_checks import bill_payment_has_posted_gl, payment_has_posted_gl
from apps.accounting.models import AccountingControl, JournalEntry, Transaction
from apps.accounting.services import ReportingService
from apps.accounting.subledger_reconciliation import reconcile_subledgers
from apps.billing.models import Bill, Invoice, Payment


def _money(value):
    return Decimal(str(value or 0)).quantize(Decimal('0.01'))


def _account_flow(journal_ids, account_id):
    if not journal_ids or not account_id:
        return Decimal('0'), Decimal('0')
    rows = Transaction.objects.filter(
        journal_entry_id__in=journal_ids,
        account_id=account_id,
    ).aggregate(
        debits=Sum('amount', filter=Q(transaction_type='debit')),
        credits=Sum('amount', filter=Q(transaction_type='credit')),
    )
    return _money(rows['debits']), _money(rows['credits'])


def _invoice_journal_ids(invoice):
    invoice_type = ContentType.objects.get_for_model(invoice)
    reference = invoice.invoice_number or f'INV-{invoice.id}'
    return list(
        JournalEntry.objects.filter(posted=True).filter(
            Q(content_type=invoice_type, object_id=invoice.id)
            | Q(reference=reference)
        ).values_list('id', flat=True)
    )


def _payment_journal_ids(payment):
    payment_type = ContentType.objects.get_for_model(payment)
    return list(
        JournalEntry.objects.filter(
            content_type=payment_type,
            object_id=payment.id,
            posted=True,
        ).values_list('id', flat=True)
    )


def _bill_journal_ids(bill):
    bill_type = ContentType.objects.get_for_model(bill)
    reference = bill.reference_number or bill.bill_number
    return list(
        JournalEntry.objects.filter(posted=True).filter(
            Q(content_type=bill_type, object_id=bill.id)
            | Q(reference=reference)
        ).values_list('id', flat=True)
    )


def _bill_payment_journal_ids(bill_payment):
    bill_payment_type = ContentType.objects.get_for_model(bill_payment)
    return list(
        JournalEntry.objects.filter(
            content_type=bill_payment_type,
            object_id=bill_payment.id,
            posted=True,
        ).values_list('id', flat=True)
    )


def payment_ar_credit_on_control(payment, ar_account):
    debits, credits = _account_flow(_payment_journal_ids(payment), ar_account.id if ar_account else None)
    return credits - debits


def bill_payment_ap_debit_on_control(bill_payment, ap_account):
    debits, credits = _account_flow(_bill_payment_journal_ids(bill_payment), ap_account.id if ap_account else None)
    return debits - credits


def analyze_invoice_ar(invoice, *, ar_account):
    invoice_jes = _invoice_journal_ids(invoice)
    payment_jes = []
    payments = Payment.objects.filter(
        Q(invoice=invoice) | Q(allocations__invoice=invoice),
        status='completed',
    ).distinct()
    for payment in payments:
        payment_jes.extend(_payment_journal_ids(payment))

    inv_debits, inv_credits = _account_flow(invoice_jes, ar_account.id)
    pay_debits, pay_credits = _account_flow(payment_jes, ar_account.id)

    gl_net_ar = (inv_debits + pay_debits - inv_credits - pay_credits).quantize(Decimal('0.01'))
    operational_due = _money(invoice.amount_due)
    drift = (gl_net_ar - operational_due).quantize(Decimal('0.01'))

    missing_ar_credit = []
    for payment in payments:
        ar_credit = payment_ar_credit_on_control(payment, ar_account)
        if ar_credit <= 0:
            missing_ar_credit.append({
                'payment_id': payment.id,
                'payment_number': payment.payment_number,
                'amount': float(payment.amount),
            })

    return {
        'invoice_id': invoice.id,
        'invoice_number': invoice.invoice_number,
        'status': invoice.status,
        'total': float(invoice.total),
        'amount_due': float(operational_due),
        'gl_net_ar': float(gl_net_ar),
        'drift': float(drift),
        'has_invoice_gl': bool(invoice_jes),
        'payments_missing_ar_credit': missing_ar_credit,
    }


def analyze_bill_ap(bill, *, ap_account):
    bill_jes = _bill_journal_ids(bill)
    payment_jes = []
    for bill_payment in bill.payments.all():
        payment_jes.extend(_bill_payment_journal_ids(bill_payment))

    bill_debits, bill_credits = _account_flow(bill_jes, ap_account.id)
    pay_debits, pay_credits = _account_flow(payment_jes, ap_account.id)

    gl_net_ap = (bill_credits + pay_credits - bill_debits - pay_debits).quantize(Decimal('0.01'))
    operational_due = _money(bill.amount_due)
    drift = (gl_net_ap - operational_due).quantize(Decimal('0.01'))

    missing_ap_debit = []
    for bill_payment in bill.payments.all():
        ap_debit = bill_payment_ap_debit_on_control(bill_payment, ap_account)
        if ap_debit <= 0:
            missing_ap_debit.append({
                'bill_payment_id': bill_payment.id,
                'payment_number': bill_payment.payment_number,
                'amount': float(bill_payment.amount),
            })

    return {
        'bill_id': bill.id,
        'bill_number': bill.bill_number,
        'status': bill.status,
        'total': float(bill.total),
        'amount_due': float(operational_due),
        'gl_net_ap': float(gl_net_ap),
        'drift': float(drift),
        'has_bill_gl': bool(bill_jes),
        'bill_payments_missing_ap_debit': missing_ap_debit,
    }


def analyze_subledger_gaps(*, branch_id=None, limit=20):
    controls = AccountingControl.get_settings()
    ar_account = controls.accounts_receivable_account
    ap_account = controls.accounts_payable_account
    reconciliation = reconcile_subledgers(branch_id=branch_id)

    invoice_rows = []
    invoices = Invoice.objects.exclude(status__in=['void', 'refunded', 'draft', 'proforma'])
    if branch_id:
        invoices = invoices.filter(branch_id=branch_id)

    all_invoice_net = Decimal('0')
    for invoice in invoices.iterator():
        if not ar_account:
            break
        row = analyze_invoice_ar(invoice, ar_account=ar_account)
        all_invoice_net += Decimal(str(row['gl_net_ar']))
        if abs(Decimal(str(row['drift']))) > Decimal('0.01'):
            invoice_rows.append(row)
    invoice_rows.sort(key=lambda row: abs(row['drift']), reverse=True)

    bill_rows = []
    bills = Bill.objects.exclude(status__in=['void', 'draft', 'pending_approval', 'rejected'])
    if branch_id:
        bills = bills.filter(branch_id=branch_id)

    all_bill_net = Decimal('0')
    for bill in bills.iterator():
        if not ap_account:
            break
        row = analyze_bill_ap(bill, ap_account=ap_account)
        all_bill_net += Decimal(str(row['gl_net_ap']))
        if abs(Decimal(str(row['drift']))) > Decimal('0.01'):
            bill_rows.append(row)
    bill_rows.sort(key=lambda row: abs(row['drift']), reverse=True)

    gl_ar = _money(ReportingService.get_account_balance(ar_account, branch_id=branch_id)) if ar_account else Decimal('0')
    gl_ap = _money(ReportingService.get_account_balance(ap_account, branch_id=branch_id)) if ap_account else Decimal('0')

    return {
        'reconciliation': reconciliation,
        'gl_ar_balance': float(gl_ar),
        'sum_invoice_gl_net_ar': float(_money(all_invoice_net)),
        'orphan_ar_gl': float((gl_ar - _money(all_invoice_net)).quantize(Decimal('0.01'))),
        'gl_ap_balance': float(gl_ap),
        'sum_bill_gl_net_ap': float(_money(all_bill_net)),
        'orphan_ap_gl': float((gl_ap - _money(all_bill_net)).quantize(Decimal('0.01'))),
        'invoice_drifts': invoice_rows[:limit],
        'bill_drifts': bill_rows[:limit],
        'invoice_drift_count': len(invoice_rows),
        'bill_drift_count': len(bill_rows),
    }
