from collections import Counter
from datetime import timedelta
from decimal import Decimal
import json

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounting.models import Account, AccountingControl, JournalEntry, Transaction
from apps.accounting.subledger_reconciliation import reconcile_subledgers
from apps.billing.models import BillPayment, CashierTill, Payment, Refund


BANK_SETTLEMENT_PAYMENT_METHODS = {
    'check', 'cheque', 'ach', 'wire', 'bank_transfer',
    'credit_card', 'debit_card', 'pos',
    'paypal', 'venmo', 'zelle',
    'mtn_momo', 'vodafone_cash', 'airteltigo_money', 'mobile_money',
    'hubtel_card', 'paystack', 'other',
}


class Command(BaseCommand):
    help = (
        "Validate production accounting data for control accounts, till setup, "
        "settlement accounts, balanced journals, parent postings, and stale tills."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--json',
            action='store_true',
            help='Print machine-readable JSON output.',
        )
        parser.add_argument(
            '--no-fail',
            action='store_true',
            help='Always exit with status 0, even when issues are found.',
        )
        parser.add_argument(
            '--open-till-hours',
            type=int,
            default=24,
            help='Flag open tills older than this many hours. Defaults to 24.',
        )

    def handle(self, *args, **options):
        issues = []
        self._check_control_accounts(issues)
        self._check_till_enabled_accounts(issues)
        self._check_customer_payments(issues)
        self._check_refunds(issues)
        self._check_vendor_payments(issues)
        self._check_journal_integrity(issues)
        self._check_subledger_reconciliation(issues)
        self._check_tills(issues, options['open_till_hours'])

        counts = Counter(issue['severity'] for issue in issues)
        payload = {
            'status': 'fail' if issues else 'pass',
            'summary': {
                'total': len(issues),
                'critical': counts['critical'],
                'high': counts['high'],
                'medium': counts['medium'],
                'low': counts['low'],
            },
            'issues': issues,
        }

        if options['json']:
            self.stdout.write(json.dumps(payload, indent=2, default=str))
        else:
            self._write_text_report(payload)

        if issues and not options['no_fail']:
            raise CommandError(
                f"Accounting integrity validation failed with {len(issues)} issue(s)."
            )

    def _add_issue(self, issues, code, severity, message, **context):
        issues.append({
            'code': code,
            'severity': severity,
            'message': message,
            'context': context,
        })

    def _is_leaf_account(self, account):
        return account and not account.children.exists()

    def _is_valid_bank_account(self, account):
        return (
            account is not None
            and account.is_active
            and account.account_type == 'asset'
            and account.account_subtype in {'bank', 'cash_equivalent'}
            and self._is_leaf_account(account)
        )

    def _check_control_accounts(self, issues):
        control = AccountingControl.get_settings()
        for field_name in AccountingControl.ACCOUNT_FIELD_NAMES:
            account = getattr(control, field_name, None)
            if account is None:
                self._add_issue(
                    issues,
                    'missing_control_account',
                    'critical',
                    f"Accounting control account is not configured: {field_name}.",
                    field=field_name,
                )
                continue
            if not account.is_active:
                self._add_issue(
                    issues,
                    'inactive_control_account',
                    'high',
                    f"Accounting control account is inactive: {field_name}.",
                    field=field_name,
                    account_id=account.id,
                    account_code=account.code,
                )
            if not self._is_leaf_account(account):
                self._add_issue(
                    issues,
                    'parent_control_account',
                    'critical',
                    f"Accounting control account points to a parent/category account: {field_name}.",
                    field=field_name,
                    account_id=account.id,
                    account_code=account.code,
                )

        bank_account = control.default_bank_account
        if bank_account and not self._is_valid_bank_account(bank_account):
            self._add_issue(
                issues,
                'invalid_default_bank_account',
                'high',
                "Default bank account must be an active leaf Asset account classified as Bank or Cash Equivalent.",
                account_id=bank_account.id,
                account_code=bank_account.code,
            )

    def _check_till_enabled_accounts(self, issues):
        for account in Account.objects.filter(is_till_enabled=True).iterator():
            if not account.can_enable_till:
                self._add_issue(
                    issues,
                    'invalid_till_enabled_account',
                    'critical',
                    "Till-enabled account is not an active leaf Asset account classified as Cash, Bank, or Cash Equivalent.",
                    account_id=account.id,
                    account_code=account.code,
                    account_type=account.account_type,
                    account_subtype=account.account_subtype,
                    is_active=account.is_active,
                )

    def _check_customer_payments(self, issues):
        qs = Payment.objects.select_related(
            'invoice', 'invoice__branch', 'till', 'till__branch', 'till__till_account', 'bank_account'
        ).filter(status='completed')
        for payment in qs.iterator():
            branch_id = payment.invoice.branch_id if payment.invoice_id else None
            if payment.payment_method == 'cash':
                if not payment.till_id:
                    self._add_issue(
                        issues,
                        'cash_payment_missing_till',
                        'high',
                        "Completed cash customer payment is not linked to a till.",
                        payment_id=payment.id,
                        payment_number=payment.payment_number,
                    )
                    continue
                if payment.till.branch_id != branch_id:
                    self._add_issue(
                        issues,
                        'cash_payment_branch_mismatch',
                        'high',
                        "Customer payment till branch does not match invoice branch.",
                        payment_id=payment.id,
                        payment_number=payment.payment_number,
                        till_branch_id=payment.till.branch_id,
                        invoice_branch_id=branch_id,
                    )
                if not payment.till.till_account_id or not payment.till.till_account.can_enable_till:
                    self._add_issue(
                        issues,
                        'cash_payment_invalid_till_account',
                        'high',
                        "Customer payment till is missing a valid till-enabled cash account.",
                        payment_id=payment.id,
                        payment_number=payment.payment_number,
                        till_id=payment.till_id,
                    )
            elif payment.payment_method in BANK_SETTLEMENT_PAYMENT_METHODS:
                if not self._is_valid_bank_account(payment.bank_account):
                    self._add_issue(
                        issues,
                        'bank_payment_missing_account',
                        'high',
                        "Completed non-cash customer payment is missing a valid settlement bank/cash-equivalent account.",
                        payment_id=payment.id,
                        payment_number=payment.payment_number,
                        method=payment.payment_method,
                    )

    def _check_refunds(self, issues):
        qs = Refund.objects.select_related(
            'invoice', 'invoice__branch', 'original_payment', 'till', 'till__branch',
            'till__till_account', 'bank_account'
        ).filter(status='completed')
        for refund in qs.iterator():
            branch_id = refund.invoice.branch_id if refund.invoice_id else None
            is_cash = refund.refund_method == 'cash' or (
                refund.refund_method == 'original_method'
                and refund.original_payment_id
                and refund.original_payment.payment_method == 'cash'
            )
            if is_cash:
                if not refund.till_id:
                    self._add_issue(
                        issues,
                        'cash_refund_missing_till',
                        'high',
                        "Completed cash refund is not linked to a till.",
                        refund_id=refund.id,
                        refund_number=refund.refund_number,
                    )
                    continue
                if refund.till.branch_id != branch_id:
                    self._add_issue(
                        issues,
                        'cash_refund_branch_mismatch',
                        'high',
                        "Refund till branch does not match invoice branch.",
                        refund_id=refund.id,
                        refund_number=refund.refund_number,
                        till_branch_id=refund.till.branch_id,
                        invoice_branch_id=branch_id,
                    )
                if not refund.till.till_account_id or not refund.till.till_account.can_enable_till:
                    self._add_issue(
                        issues,
                        'cash_refund_invalid_till_account',
                        'high',
                        "Refund till is missing a valid till-enabled cash account.",
                        refund_id=refund.id,
                        refund_number=refund.refund_number,
                        till_id=refund.till_id,
                    )
            elif not self._is_valid_bank_account(refund.bank_account):
                self._add_issue(
                    issues,
                    'bank_refund_missing_account',
                    'high',
                    "Completed non-cash refund is missing a valid settlement bank/cash-equivalent account.",
                    refund_id=refund.id,
                    refund_number=refund.refund_number,
                    method=refund.refund_method,
                )

    def _check_vendor_payments(self, issues):
        qs = BillPayment.objects.select_related(
            'bill', 'bill__branch', 'till', 'till__branch', 'till__till_account', 'bank_account'
        )
        for payment in qs.iterator():
            branch_id = payment.bill.branch_id if payment.bill_id else None
            if payment.payment_method == 'cash':
                if not payment.till_id:
                    self._add_issue(
                        issues,
                        'cash_vendor_payment_missing_till',
                        'high',
                        "Cash vendor payment is not linked to a till.",
                        payment_id=payment.id,
                        payment_number=payment.payment_number,
                    )
                    continue
                if payment.till.branch_id != branch_id:
                    self._add_issue(
                        issues,
                        'cash_vendor_payment_branch_mismatch',
                        'high',
                        "Vendor payment till branch does not match bill branch.",
                        payment_id=payment.id,
                        payment_number=payment.payment_number,
                        till_branch_id=payment.till.branch_id,
                        bill_branch_id=branch_id,
                    )
                if not payment.till.till_account_id or not payment.till.till_account.can_enable_till:
                    self._add_issue(
                        issues,
                        'cash_vendor_payment_invalid_till_account',
                        'high',
                        "Vendor payment till is missing a valid till-enabled cash account.",
                        payment_id=payment.id,
                        payment_number=payment.payment_number,
                        till_id=payment.till_id,
                    )
            elif payment.payment_method in BANK_SETTLEMENT_PAYMENT_METHODS:
                if not self._is_valid_bank_account(payment.bank_account):
                    self._add_issue(
                        issues,
                        'bank_vendor_payment_missing_account',
                        'high',
                        "Non-cash vendor payment is missing a valid settlement bank/cash-equivalent account.",
                        payment_id=payment.id,
                        payment_number=payment.payment_number,
                        method=payment.payment_method,
                    )

    def _check_journal_integrity(self, issues):
        for entry in JournalEntry.objects.filter(posted=True).iterator():
            debits = Decimal('0')
            credits = Decimal('0')
            for line in entry.transactions.all():
                if line.transaction_type == 'debit':
                    debits += line.amount
                elif line.transaction_type == 'credit':
                    credits += line.amount
            if debits.quantize(Decimal('0.01')) != credits.quantize(Decimal('0.01')):
                self._add_issue(
                    issues,
                    'unbalanced_journal_entry',
                    'critical',
                    "Posted journal entry is not balanced.",
                    journal_entry_id=entry.id,
                    reference=entry.reference,
                    debits=str(debits),
                    credits=str(credits),
                )

        parent_lines = Transaction.objects.filter(
            journal_entry__posted=True,
            account__children__isnull=False,
        ).select_related('journal_entry', 'account').distinct()
        for line in parent_lines.iterator():
            self._add_issue(
                issues,
                'journal_line_parent_account',
                'critical',
                "Posted journal line uses a parent/category account.",
                transaction_id=line.id,
                journal_entry_id=line.journal_entry_id,
                account_id=line.account_id,
                account_code=line.account.code,
            )

        inactive_lines = Transaction.objects.filter(
            journal_entry__posted=True,
            account__is_active=False,
        ).select_related('journal_entry', 'account')
        for line in inactive_lines.iterator():
            self._add_issue(
                issues,
                'journal_line_inactive_account',
                'critical',
                "Posted journal line uses an inactive account.",
                transaction_id=line.id,
                journal_entry_id=line.journal_entry_id,
                account_id=line.account_id,
                account_code=line.account.code,
            )

    def _check_subledger_reconciliation(self, issues):
        report = reconcile_subledgers()
        tolerance = Decimal(str(report.get('tolerance', '0.01')))

        ar = report.get('accounts_receivable', {})
        if ar.get('control_account_id') and not ar.get('in_balance'):
            difference = Decimal(str(ar.get('difference', 0)))
            if abs(difference) > tolerance:
                self._add_issue(
                    issues,
                    'ar_subledger_out_of_balance',
                    'high',
                    "AR control account balance does not reconcile to the operational subledger.",
                    gl_balance=ar.get('gl_balance'),
                    subledger_net_of_credits=ar.get('subledger_net_of_credits'),
                    difference=ar.get('difference'),
                )

        ap = report.get('accounts_payable', {})
        if ap.get('control_account_id') and not ap.get('in_balance'):
            difference = Decimal(str(ap.get('difference', 0)))
            if abs(difference) > tolerance:
                self._add_issue(
                    issues,
                    'ap_subledger_out_of_balance',
                    'high',
                    "AP control account balance does not reconcile to the operational subledger.",
                    gl_balance=ap.get('gl_balance'),
                    subledger_net_of_credits=ap.get('subledger_net_of_credits'),
                    difference=ap.get('difference'),
                )

    def _check_tills(self, issues, open_till_hours):
        stale_cutoff = timezone.now() - timedelta(hours=open_till_hours)
        stale_tills = CashierTill.objects.filter(status='open', opened_at__lt=stale_cutoff)
        for till in stale_tills.select_related('branch', 'till_account').iterator():
            self._add_issue(
                issues,
                'till_open_too_long',
                'medium',
                f"Till has been open longer than {open_till_hours} hours.",
                till_id=till.id,
                branch_id=till.branch_id,
                till_account_id=till.till_account_id,
                opened_at=till.opened_at,
            )

        pending_variance = CashierTill.objects.filter(
            status='closed',
            variance_approval_status='supervisor_required',
        )
        for till in pending_variance.select_related('branch', 'till_account').iterator():
            self._add_issue(
                issues,
                'variance_pending_approval',
                'medium',
                "Closed till variance requires supervisor approval.",
                till_id=till.id,
                branch_id=till.branch_id,
                till_account_id=till.till_account_id,
                variance=str(till.variance),
                closed_at=till.closed_at,
            )

    def _write_text_report(self, payload):
        summary = payload['summary']
        self.stdout.write(f"Status: {payload['status'].upper()}")
        self.stdout.write(
            "Issues: {total} total, {critical} critical, {high} high, "
            "{medium} medium, {low} low".format(**summary)
        )
        for issue in payload['issues']:
            self.stdout.write(
                f"[{issue['severity'].upper()}] {issue['code']}: {issue['message']}"
            )
            if issue['context']:
                self.stdout.write(f"  Context: {issue['context']}")
