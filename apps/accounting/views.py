from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from rest_framework.generics import ListAPIView, CreateAPIView, RetrieveAPIView, RetrieveUpdateAPIView, ListCreateAPIView
from rest_framework.parsers import MultiPartParser, FormParser
from django.utils.dateparse import parse_date
from django.core.exceptions import ValidationError as DjangoValidationError
import openpyxl
from decimal import Decimal
from django.utils import timezone
from django.db.models import Q
from datetime import datetime
from apps.accounts.permissions import IsModuleEnabled
from .services import AccountingService, ReportingService, DashboardService, ExportService
from .models import JournalEntry, Account, AccountingControl, AuditLog, Transaction
from .serializers import (
    JournalEntrySerializer,
    JournalEntryCreateSerializer,
    JournalEntryReverseSerializer,
    PeriodCloseSerializer,
    AccountSimpleSerializer,
    AccountingControlSerializer,
    AuditLogSerializer,
    GeneralLedgerLineSerializer,
)

from django.http import HttpResponse
from apps.accounts.permissions import HasPermission, IsModuleEnabled
from apps.branches.utils import resolve_branch
from drf_spectacular.utils import extend_schema
from drf_spectacular.types import OpenApiTypes

def request_has_branch_hint(request):
    if request.query_params.get('branch') or request.query_params.get('branch_id'):
        return True
    if (
        request.headers.get('X-Branch-ID')
        or request.META.get('HTTP_X_BRANCH_ID')
        or request.headers.get('X_BRANCH_ID')
    ):
        return True
    session = getattr(request, 'session', None)
    return bool(session and session.get('active_branch_id'))


def get_accounting_branch_id(request):
    """Return the active branch for branch-scoped accounting endpoints."""
    is_global_user = request.user.is_superuser or getattr(request.user, 'role', None) == 'super-admin'
    if is_global_user and not request_has_branch_hint(request):
        return None
    branch = resolve_branch(request)
    return branch.id if branch else None


def scope_journal_entries(queryset, request):
    branch_id = get_accounting_branch_id(request)
    if branch_id is None:
        return queryset
    return queryset.filter(branch_id=branch_id)


def scope_budgets(queryset, request):
    branch_id = get_accounting_branch_id(request)
    if branch_id is None:
        return queryset
    return queryset.filter(Q(branch_id=branch_id) | Q(branch__isnull=True))


def scope_budget_lines(queryset, request):
    branch_id = get_accounting_branch_id(request)
    if branch_id is None:
        return queryset
    return queryset.filter(Q(budget__branch_id=branch_id) | Q(budget__branch__isnull=True))


def scope_accruals(queryset, request):
    branch_id = get_accounting_branch_id(request)
    if branch_id is None:
        return queryset
    return queryset.filter(Q(branch_id=branch_id) | Q(branch__isnull=True))


def get_report_branch_id(request):
    """
    Get branch ID for reports.
    Superusers can see global data (None) if no branch specified.
    Regular users are forced to a branch context.
    """
    return get_accounting_branch_id(request)


def get_accessible_branch_ids(request):
    """Branch IDs the current user may include in consolidated management reports."""
    from apps.branches.models import Branch

    scoped_id = get_report_branch_id(request)
    if scoped_id is not None:
        return [scoped_id]

    user = request.user
    role = getattr(user, 'role', None)
    if user.is_superuser or role in ('super-admin', 'admin'):
        return list(Branch.objects.filter(is_active=True).order_by('id').values_list('id', flat=True))
    if role == 'manager':
        return list(user.managed_branches.filter(is_active=True).order_by('id').values_list('id', flat=True))
    if user.branch_id:
        return [user.branch_id]
    return []


def compute_bank_statement_reconciled_balance(statement):
    """Opening balance plus net matched line movement (debits minus credits)."""
    movement = Decimal('0')
    for line in statement.lines.filter(matched=True):
        movement += (line.debit_amount or Decimal('0')) - (line.credit_amount or Decimal('0'))
    return (statement.opening_balance or Decimal('0')) + movement

class BalanceSheetView(APIView):
    permission_classes = [IsAuthenticated, IsModuleEnabled('accounting'), HasPermission('view_financial_reports')]

    @extend_schema(
        summary="Balance Sheet Report",
        description="Generates a Balance Sheet for the specified date.",
        responses={200: OpenApiTypes.OBJECT}
    )
    def get(self, request):
        date_str = request.query_params.get('date')
        date = parse_date(date_str) if date_str else timezone.now().date()
        
        branch_id = get_report_branch_id(request)
        report = ReportingService.get_balance_sheet(date, branch_id=branch_id)
        return Response(report)

class ProfitLossView(APIView):
    permission_classes = [IsAuthenticated, IsModuleEnabled('accounting'), HasPermission('view_financial_reports')]

    @extend_schema(
        summary="Profit & Loss Report",
        description="Generates a P&L report for the specified date range.",
        responses={200: OpenApiTypes.OBJECT}
    )
    def get(self, request):
        start_str = request.query_params.get('start_date')
        end_str = request.query_params.get('end_date')
        
        if not start_str or not end_str:
            # Default to current month
            today = timezone.now().date()
            start_date = today.replace(day=1)
            end_date = today
        else:
            start_date = parse_date(start_str)
            end_date = parse_date(end_str)
            
        if not start_date or not end_date:
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD."}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        branch_id = get_report_branch_id(request)
        report = ReportingService.get_profit_loss(start_date, end_date, branch_id=branch_id)
        return Response(report)

class GeneralLedgerView(ListAPIView):
    """Posted transaction lines with optional account and date filters (general ledger detail)."""

    permission_classes = [
        IsAuthenticated,
        IsModuleEnabled('accounting'),
        HasPermission('view_accounting'),
    ]
    serializer_class = GeneralLedgerLineSerializer

    def get_queryset(self):
        qs = (
            Transaction.objects.filter(journal_entry__posted=True)
            .select_related('journal_entry', 'account')
            .order_by('-journal_entry__date', '-journal_entry_id', 'id')
        )
        account_id = self.request.query_params.get('account_id')
        branch_id = get_accounting_branch_id(self.request)
        reference = (self.request.query_params.get('reference') or '').strip()

        start_raw = self.request.query_params.get('start_date')
        end_raw = self.request.query_params.get('end_date')
        start_date = parse_date(start_raw) if start_raw else None
        end_date = parse_date(end_raw) if end_raw else None

        if account_id:
            qs = qs.filter(account_id=account_id)
        if branch_id is not None:
            qs = qs.filter(journal_entry__branch_id=branch_id)
        if start_date:
            qs = qs.filter(journal_entry__date__gte=start_date)
        if end_date:
            qs = qs.filter(journal_entry__date__lte=end_date)
        if reference:
            qs = qs.filter(journal_entry__reference__icontains=reference)

        return qs


class TrialBalanceView(APIView):
    permission_classes = [IsAuthenticated, IsModuleEnabled('accounting'), HasPermission('view_financial_reports')]

    @extend_schema(
        summary="Trial Balance Report",
        description="Generates a Trial Balance for the specified date.",
        responses={200: OpenApiTypes.OBJECT}
    )
    def get(self, request):
        date_str = request.query_params.get('date')
        date = parse_date(date_str) if date_str else timezone.now().date()
        
        branch_id = get_report_branch_id(request)
        report = ReportingService.get_trial_balance(date, branch_id=branch_id)
        return Response(report)

class AgingReportView(APIView):
    permission_classes = [IsAuthenticated, IsModuleEnabled('accounting'), HasPermission('view_financial_reports')]

    @extend_schema(
        summary="Aging Report (AR/AP)",
        description="Generates an Accounts Receivable or Accounts Payable aging report.",
        responses={200: OpenApiTypes.OBJECT}
    )
    def get(self, request):
        report_type = request.query_params.get('type', 'ar') # 'ar' or 'ap'
        date_str = request.query_params.get('date')
        date = parse_date(date_str) if date_str else timezone.now().date()
        
        branch_id = get_report_branch_id(request)
        report = ReportingService.get_aging_report(report_type, date, branch_id=branch_id)
        return Response(report)

class CashFlowView(APIView):
    permission_classes = [IsAuthenticated, IsModuleEnabled('accounting'), HasPermission('view_financial_reports')]

    @extend_schema(
        summary="Cash Flow Statement",
        description="Generates a Cash Flow statement for the specified date range.",
        responses={200: OpenApiTypes.OBJECT}
    )
    def get(self, request):
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        
        start_date = parse_date(start_date_str) if start_date_str else None
        end_date = parse_date(end_date_str) if end_date_str else timezone.now().date()
        
        branch_id = get_report_branch_id(request)
        report = ReportingService.get_cash_flow_statement(start_date, end_date, branch_id=branch_id)
        return Response(report)

class TaxReportView(APIView):
    permission_classes = [IsAuthenticated, IsModuleEnabled('accounting'), HasPermission('view_financial_reports')]

    @extend_schema(
        summary="Tax Liability Report",
        description="Generates a report of tax liabilities for the specified date range.",
        responses={200: OpenApiTypes.OBJECT}
    )
    def get(self, request):
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')

        start_date = parse_date(start_date_str) if start_date_str else None
        end_date = parse_date(end_date_str) if end_date_str else None

        branch_id = get_report_branch_id(request)
        report = ReportingService.get_tax_report(start_date, end_date, branch_id=branch_id)
        return Response(report)


class ExpenseBreakdownView(APIView):
    """
    Expense dashboard broken down by category: parts, labor, and overhead.
    Query params: start_date, end_date (YYYY-MM-DD), branch (optional)
    """
    permission_classes = [IsAuthenticated, IsModuleEnabled('accounting'), HasPermission('view_financial_reports')]

    @extend_schema(
        summary="Expense Breakdown by Category",
        description="Returns expenses split into parts, direct labor, and overhead for the given period.",
        responses={200: OpenApiTypes.OBJECT}
    )
    def get(self, request):
        start_str = request.query_params.get('start_date')
        end_str = request.query_params.get('end_date')

        if not start_str or not end_str:
            today = timezone.now().date()
            start_date = today.replace(day=1)
            end_date = today
        else:
            start_date = parse_date(start_str)
            end_date = parse_date(end_str)

        if not start_date or not end_date:
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST
            )

        branch_id = get_report_branch_id(request)
        report = ReportingService.get_expense_breakdown(start_date, end_date, branch_id=branch_id)
        return Response(report)


# ============================================================================
# PHASE 8: CASH & BANKING VIEWS
# ============================================================================

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from .models import BankStatement, BankStatementLine, FundTransfer
from .serializers import BankStatementSerializer, BankStatementLineSerializer, FundTransferSerializer, TransactionSerializer
from apps.billing.models import CashierTill
from apps.billing.serializers import CashierTillSerializer
from apps.billing.views import TillViewSet as BillingTillViewSet


class AccountingTillViewSet(BillingTillViewSet):
    """Accounting-facing Cash & Bank till sessions."""

    module_slug = 'accounting'
    read_permission = 'view_accounting'
    write_permission = 'create_journal_entries'
    manage_permission = 'manage_accounting_periods'


class SubledgerReconciliationView(APIView):
    permission_classes = [IsAuthenticated, IsModuleEnabled('accounting'), HasPermission('view_financial_reports')]

    def get(self, request):
        from .subledger_reconciliation import reconcile_subledgers

        date_str = request.query_params.get('date')
        as_of_date = parse_date(date_str) if date_str else timezone.now().date()
        branch_id = get_report_branch_id(request)
        report = reconcile_subledgers(branch_id=branch_id, as_of_date=as_of_date)
        return Response(report)


class TillReconciliationReportView(APIView):
    permission_classes = [IsAuthenticated, IsModuleEnabled('accounting'), HasPermission('view_accounting')]

    def get(self, request):
        date_str = request.query_params.get('date')
        start_str = request.query_params.get('start_date')
        end_str = request.query_params.get('end_date')
        account_id = request.query_params.get('account') or request.query_params.get('till_account')
        status_filter = request.query_params.get('status')
        cashier_id = request.query_params.get('user') or request.query_params.get('cashier')

        if date_str:
            start_date = end_date = parse_date(date_str)
        else:
            start_date = parse_date(start_str) if start_str else timezone.now().date()
            end_date = parse_date(end_str) if end_str else start_date

        if not start_date or not end_date:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        qs = CashierTill.objects.select_related('branch', 'cashier', 'closed_by', 'till_account').filter(
            opened_at__date__gte=start_date,
            opened_at__date__lte=end_date,
        )
        branch_id = get_accounting_branch_id(request)
        if branch_id is not None:
            qs = qs.filter(branch_id=branch_id)
        if account_id:
            qs = qs.filter(till_account_id=account_id)
        if status_filter:
            qs = qs.filter(status=status_filter)
        if cashier_id:
            qs = qs.filter(cashier_id=cashier_id)

        rows = []
        totals = {
            'opening_balance': Decimal('0'),
            'cash_received': Decimal('0'),
            'cash_paid_out': Decimal('0'),
            'net_movements': Decimal('0'),
            'expected_balance': Decimal('0'),
            'actual_counted_balance': Decimal('0'),
            'shortage': Decimal('0'),
            'excess': Decimal('0'),
        }

        for till in qs.order_by('-opened_at', '-id'):
            cash_received = till.cash_payments_total()
            cash_refunds = till.cash_refunds_total()
            cash_bill_payments = till.cash_bill_payments_total()
            cash_paid_out = (cash_refunds + cash_bill_payments).quantize(Decimal('0.01'))
            net_movements = till.till_cash_movements_net()
            expected = till.expected_balance if till.status == 'closed' and till.expected_balance is not None else till.calculate_expected_balance()
            actual = till.closing_balance if till.closing_balance is not None else Decimal('0')
            variance = till.variance if till.variance is not None else (actual - expected if till.status == 'closed' else Decimal('0'))
            shortage = abs(variance) if variance < 0 else Decimal('0')
            excess = variance if variance > 0 else Decimal('0')

            row = {
                'id': till.id,
                'branch_id': till.branch_id,
                'branch_name': till.branch.name if till.branch_id else '',
                'till_account_id': till.till_account_id,
                'till_account_code': till.till_account.code if till.till_account_id else '',
                'till_account_name': till.till_account.name if till.till_account_id else '',
                'status': till.status,
                'opened_at': till.opened_at,
                'closed_at': till.closed_at,
                'opened_by': till.cashier.get_full_name() or till.cashier.username,
                'closed_by': (till.closed_by.get_full_name() or till.closed_by.username) if till.closed_by_id else '',
                'opening_balance': str(till.opening_balance),
                'cash_received': str(cash_received),
                'cash_paid_out': str(cash_paid_out),
                'cash_refunds': str(cash_refunds),
                'cash_bill_payments': str(cash_bill_payments),
                'net_movements': str(net_movements),
                'expected_balance': str(expected),
                'actual_counted_balance': str(actual) if till.status == 'closed' else '',
                'variance': str(variance) if till.status == 'closed' else '',
                'shortage': str(shortage) if till.status == 'closed' else '',
                'excess': str(excess) if till.status == 'closed' else '',
                'variance_reason': till.notes,
                'variance_approval_status': till.variance_approval_status,
            }
            rows.append(row)

            totals['opening_balance'] += till.opening_balance
            totals['cash_received'] += cash_received
            totals['cash_paid_out'] += cash_paid_out
            totals['net_movements'] += net_movements
            totals['expected_balance'] += expected
            if till.status == 'closed':
                totals['actual_counted_balance'] += actual
                totals['shortage'] += shortage
                totals['excess'] += excess

        return Response({
            'period': {'start': str(start_date), 'end': str(end_date)},
            'results': rows,
            'totals': {key: str(value.quantize(Decimal('0.01'))) for key, value in totals.items()},
        })

class BankStatementViewSet(viewsets.ModelViewSet):
    """ViewSet for bank statements"""
    queryset = BankStatement.objects.all()
    serializer_class = BankStatementSerializer

    def get_serializer_class(self):
        if self.action == 'retrieve':
            from .serializers import BankStatementDetailSerializer
            return BankStatementDetailSerializer
        return BankStatementSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == 'retrieve':
            qs = qs.prefetch_related('lines')
        branch_id = get_accounting_branch_id(self.request)
        if branch_id is not None:
            qs = qs.filter(
                Q(lines__matched_transaction__journal_entry__branch_id=branch_id)
                | Q(created_by__branch_id=branch_id)
            ).distinct()
        return qs

    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_bank_statements'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_bank_statements'))
        else:
            permission_classes.append(HasPermission('reconcile_bank_statements'))
        return [permission() for permission in permission_classes]
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def reconcile(self, request, pk=None):
        """Mark statement as reconciled"""
        statement = self.get_object()
        if statement.reconciled:
            return Response({'error': 'Statement is already reconciled'}, status=status.HTTP_400_BAD_REQUEST)

        if not statement.lines.exists():
            return Response({'error': 'Cannot reconcile a statement with no lines'}, status=status.HTTP_400_BAD_REQUEST)

        unmatched_count = statement.lines.filter(Q(matched=False) | Q(matched_transaction__isnull=True)).count()
        if unmatched_count:
            return Response(
                {'error': f'Cannot reconcile statement with {unmatched_count} unmatched line(s).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reconciled_balance = compute_bank_statement_reconciled_balance(statement)
        closing_balance = statement.closing_balance or Decimal('0')
        difference = reconciled_balance - closing_balance
        if abs(difference) > Decimal('0.01'):
            return Response(
                {
                    'error': (
                        f'Cannot reconcile statement with a balance difference of {difference:.2f}. '
                        f'Reconciled balance {reconciled_balance:.2f} must equal closing balance {closing_balance:.2f}.'
                    ),
                    'reconciled_balance': str(reconciled_balance.quantize(Decimal('0.01'))),
                    'closing_balance': str(closing_balance.quantize(Decimal('0.01'))),
                    'difference': str(difference.quantize(Decimal('0.01'))),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        statement.reconciled = True
        statement.reconciled_by = request.user
        statement.reconciled_at = timezone.now()
        statement.save()
        return Response({'status': 'reconciled'})

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload(self, request, pk=None):
        """Upload and parse bank statement Excel workbook."""
        statement = self.get_object()

        if statement.reconciled:
            return Response({'error': 'Cannot upload lines to a reconciled statement'}, status=status.HTTP_400_BAD_REQUEST)
        
        if 'statement_file' not in request.FILES:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
            
        file_obj = request.FILES['statement_file']
        statement.statement_file = file_obj
        statement.save()
        
        if not file_obj.name.lower().endswith('.xlsx'):
            return Response({
                'error': 'Bank statement upload requires a proper Excel workbook (.xlsx).'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Parse Excel workbook
        try:
            workbook = openpyxl.load_workbook(file_obj, read_only=True, data_only=True)
            worksheet = workbook.active
            rows = worksheet.iter_rows(values_only=True)
            raw_headers = next(rows, None)
            if not raw_headers:
                return Response({'error': 'Excel file is empty'}, status=status.HTTP_400_BAD_REQUEST)

            headers = [str(header or '').strip().lower() for header in raw_headers]
            required_headers = ['date', 'description', 'amount']
            if not all(header in headers for header in required_headers):
                return Response({
                    'error': f'Excel file must contain these columns: {", ".join(required_headers)}'
                }, status=status.HTTP_400_BAD_REQUEST)

            lines_created = 0

            for values in rows:
                row = {
                    headers[index]: '' if value is None else str(value).strip()
                    for index, value in enumerate(values)
                    if index < len(headers) and headers[index]
                }
                if not any(row.values()):
                    continue

                date_str = row.get('date')
                desc = row.get('description', '')
                amount_str = row.get('amount', '0')
                
                if not date_str:
                    continue
                    
                # Parse date (assume simple YYYY-MM-DD or attempt parse)
                try:
                    tx_date = parse_date(date_str)
                    if not tx_date:
                        # try other formats if needed, e.g. DD/MM/YYYY
                        tx_date = datetime.strptime(date_str, '%d/%m/%Y').date()
                except:
                    continue # Skip invalid dates
                
                try:
                    amount = Decimal(amount_str)
                except:
                    continue
                
                # Determine Debit/Credit
                # For Bank Account: Positive = Debit (In), Negative = Credit (Out)
                debit = amount if amount > 0 else Decimal('0')
                credit = abs(amount) if amount < 0 else Decimal('0')
                
                BankStatementLine.objects.create(
                    bank_statement=statement,
                    transaction_date=tx_date,
                    description=desc,
                    debit_amount=debit,
                    credit_amount=credit,
                    balance=0 # Optional running balance
                )
                lines_created += 1
                
            return Response({
                'status': 'uploaded', 
                'lines_processed': lines_created,
                'file_url': statement.statement_file.url if statement.statement_file else None
            })
            
        except Exception as e:
            return Response({'error': f"Failed to parse Excel file: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


class BankStatementLineViewSet(viewsets.ModelViewSet):
    """ViewSet for bank statement lines"""
    queryset = BankStatementLine.objects.all()
    serializer_class = BankStatementLineSerializer
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_bank_statements'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_bank_statements'))
        else:
            permission_classes.append(HasPermission('reconcile_bank_statements'))
        return [permission() for permission in permission_classes]
    filterset_fields = ['bank_statement', 'matched']
    
    @action(detail=True, methods=['post'])
    def match(self, request, pk=None):
        """Match a bank line to a GL transaction"""
        line = self.get_object()
        transaction_id = request.data.get('transaction_id')
        
        if not transaction_id:
            return Response({'error': 'transaction_id required'}, status=status.HTTP_400_BAD_REQUEST)

        if line.bank_statement.reconciled:
            return Response({'error': 'Cannot match lines in a reconciled statement'}, status=status.HTTP_400_BAD_REQUEST)

        if line.matched or line.matched_transaction_id:
            return Response({'error': 'Line is already matched'}, status=status.HTTP_400_BAD_REQUEST)

        if (line.debit_amount > 0 and line.credit_amount > 0) or (line.debit_amount == 0 and line.credit_amount == 0):
            return Response({'error': 'Statement line must have exactly one debit or credit amount'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            transaction_qs = Transaction.objects.select_related('journal_entry', 'account')
            branch_id = get_accounting_branch_id(request)
            if branch_id is not None:
                transaction_qs = transaction_qs.filter(journal_entry__branch_id=branch_id)
            transaction = transaction_qs.get(id=transaction_id)
            if transaction.matched_bank_lines.exists():
                return Response({'error': 'Transaction is already matched to a bank line'}, status=status.HTTP_400_BAD_REQUEST)

            if transaction.account_id != line.bank_statement.bank_account_id:
                return Response({'error': 'Transaction account does not match the statement bank account'}, status=status.HTTP_400_BAD_REQUEST)

            if not transaction.journal_entry.posted:
                return Response({'error': 'Only posted transactions can be matched'}, status=status.HTTP_400_BAD_REQUEST)

            if transaction.journal_entry.date > line.bank_statement.statement_date:
                return Response({'error': 'Transaction date is after the statement date'}, status=status.HTTP_400_BAD_REQUEST)

            expected_type = 'debit' if line.debit_amount > 0 else 'credit'
            expected_amount = line.debit_amount if line.debit_amount > 0 else line.credit_amount
            if transaction.transaction_type != expected_type or transaction.amount != expected_amount:
                return Response({'error': 'Transaction amount or debit/credit side does not match the statement line'}, status=status.HTTP_400_BAD_REQUEST)

            line.matched = True
            line.matched_transaction = transaction
            line.matched_by = request.user
            line.matched_at = timezone.now()
            line.save()
            return Response({'status': 'matched'})
        except Transaction.DoesNotExist:
            return Response({'error': 'Transaction not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def unmatch(self, request, pk=None):
        """Unmatch a bank statement line from a transaction"""
        line = self.get_object()
        
        if not line.matched_transaction:
            return Response({'error': 'Line is not matched'}, status=status.HTTP_400_BAD_REQUEST)
            
        if line.bank_statement.reconciled:
             return Response({'error': 'Cannot unmatch lines in a reconciled statement'}, status=status.HTTP_400_BAD_REQUEST)

        line.matched_transaction = None
        line.matched = False
        line.matched_by = None
        line.matched_at = None
        line.save()
        
        return Response({'status': 'unmatched'})


class UnreconciledTransactionsView(ListAPIView):
    """Fetch transactions for a bank account that are not yet matched"""
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_bank_statements'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_bank_statements'))
        else:
            permission_classes.append(HasPermission('reconcile_bank_statements'))
        return [permission() for permission in permission_classes]
    serializer_class = TransactionSerializer # This now includes date
    
    def get_queryset(self):
        account_id = self.request.query_params.get('account_id')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        
        if not account_id:
            return Transaction.objects.none()
            
        qs = Transaction.objects.filter(
            account_id=account_id,
            journal_entry__posted=True,
            matched_bank_lines__isnull=True # Not matched to any bank line
        ).select_related('journal_entry', 'account')

        branch_id = get_accounting_branch_id(self.request)
        if branch_id is not None:
            qs = qs.filter(journal_entry__branch_id=branch_id)
        
        if start_date:
            qs = qs.filter(journal_entry__date__gte=start_date)
        if end_date:
            qs = qs.filter(journal_entry__date__lte=end_date)
            
        return qs.order_by('journal_entry__date')


class FundTransferViewSet(viewsets.ModelViewSet):
    """ViewSet for fund transfers"""
    queryset = FundTransfer.objects.all()
    serializer_class = FundTransferSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        branch_id = get_accounting_branch_id(self.request)
        if branch_id is not None:
            qs = qs.filter(
                Q(journal_entry__branch_id=branch_id) | Q(journal_entry__isnull=True)
            )
        return qs

    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_transfer_requests'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_transfer_requests'))
        else:
            permission_classes.append(HasPermission('manage_transfers'))
        return [permission() for permission in permission_classes]
    filterset_fields = ['status', 'from_account', 'to_account']
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    ordering_fields = [
        'transfer_number', 'transfer_date', 'amount', 'status', 'created_at',
        'from_account__name', 'to_account__name',
    ]
    ordering = ['-transfer_date']
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit a draft transfer for approval"""
        transfer = self.get_object()
        if transfer.status != 'draft':
            return Response({'error': 'Only draft transfers can be submitted'}, status=status.HTTP_400_BAD_REQUEST)
        transfer.status = 'pending'
        transfer.save(update_fields=['status', 'updated_at'])
        return Response({'status': 'pending'})
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a fund transfer"""
        transfer = self.get_object()
        
        if transfer.status != 'pending':
            return Response({'error': 'Transfer must be pending'}, status=status.HTTP_400_BAD_REQUEST)

        if transfer.created_by_id == request.user.id:
            return Response(
                {'error': 'Fund transfers must be approved by someone other than the creator.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        transfer.status = 'approved'
        transfer.approved_by = request.user
        transfer.approved_at = timezone.now()
        transfer.save()
        return Response({'status': 'approved'})
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Complete a fund transfer (triggers GL posting)"""
        transfer = self.get_object()
        
        if transfer.status != 'approved':
            return Response({'error': f'Transfer must be approved (current status: {transfer.status})'}, status=status.HTTP_400_BAD_REQUEST)
        
        transfer.status = 'completed'
        transfer.save()  # Signal will auto-post GL entry
        return Response({'status': 'completed', 'journal_entry_id': transfer.journal_entry.id if transfer.journal_entry else None})

# ============================================================================
# PHASE 9: JOB PROFITABILITY & BRANCH REPORTS
# ============================================================================

class JobProfitabilityView(APIView):
    """Job profitability analysis"""
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_financial_reports'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_financial_reports'))
        else:
            permission_classes.append(HasPermission('view_financial_reports'))
        return [permission() for permission in permission_classes]
    
    def get(self, request):
        work_order_id = request.query_params.get('work_order_id')
        branch_id = get_report_branch_id(request)
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        
        start_date = parse_date(start_date_str) if start_date_str else None
        end_date = parse_date(end_date_str) if end_date_str else None
        
        report = ReportingService.get_job_profitability(
            work_order_id=work_order_id,
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id
        )
        return Response(report)


# ============================================================================
# PHASE 10: BUDGETING & CONTROLS
# ============================================================================

from .models import Budget, BudgetLine
from .serializers import BudgetSerializer, BudgetLineSerializer

class BudgetViewSet(viewsets.ModelViewSet):
    """ViewSet for budgets"""
    queryset = Budget.objects.all()
    serializer_class = BudgetSerializer
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_budgets'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_budgets'))
        else:
            permission_classes.append(HasPermission('manage_budgets'))
        return [permission() for permission in permission_classes]
    filterset_fields = ['fiscal_year', 'status', 'branch']
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    ordering_fields = ['name', 'fiscal_year', 'start_date', 'end_date', 'status', 'branch__name', 'created_at']
    ordering = ['-fiscal_year', '-start_date']

    def get_queryset(self):
        return scope_budgets(super().get_queryset(), self.request)
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a budget"""
        budget = self.get_object()
        
        if budget.status != 'draft':
            return Response({'error': 'Budget must be in draft status'}, status=status.HTTP_400_BAD_REQUEST)
        
        budget.status = 'approved'
        budget.approved_by = request.user
        budget.approved_at = timezone.now()
        budget.save()
        return Response({'status': 'approved'})
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Activate an approved budget"""
        budget = self.get_object()
        
        if budget.status != 'approved':
            return Response({'error': 'Budget must be approved first'}, status=status.HTTP_400_BAD_REQUEST)
        
        budget.status = 'active'
        budget.save()
        return Response({'status': 'active'})


class BudgetLineViewSet(viewsets.ModelViewSet):
    """ViewSet for budget lines"""
    queryset = BudgetLine.objects.all()
    serializer_class = BudgetLineSerializer
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_budgets'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_budgets'))
        else:
            permission_classes.append(HasPermission('manage_budgets'))
        return [permission() for permission in permission_classes]
    filterset_fields = ['budget', 'account', 'period']

    def get_queryset(self):
        return scope_budget_lines(super().get_queryset(), self.request)


class BudgetVsActualView(APIView):
    """Budget vs Actual variance analysis"""
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_budgets'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_budgets'))
        else:
            permission_classes.append(HasPermission('manage_budgets'))
        return [permission() for permission in permission_classes]
    
    def get(self, request):
        budget_id = request.query_params.get('budget_id')
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        
        if not budget_id:
            return Response({'error': 'budget_id required'}, status=status.HTTP_400_BAD_REQUEST)
        if not scope_budgets(Budget.objects.filter(id=budget_id), request).exists():
            return Response({'error': 'Budget not found'}, status=status.HTTP_404_NOT_FOUND)
        
        start_date = parse_date(start_date_str) if start_date_str else None
        end_date = parse_date(end_date_str) if end_date_str else None
        
        report = ReportingService.get_budget_vs_actual(budget_id, start_date, end_date)
        return Response(report)


class AccountingControlView(RetrieveUpdateAPIView):
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_accounting'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_accounting'))
        else:
            permission_classes.append(HasPermission('manage_accounting_periods'))
        return [permission() for permission in permission_classes]
    serializer_class = AccountingControlSerializer
    
    def get_object(self):
        return AccountingControl.get_settings()
        
    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

class AuditLogView(ListAPIView):
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_accounting'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_accounting'))
        else:
            permission_classes.append(HasPermission('manage_accounting_periods'))
        return [permission() for permission in permission_classes]
    serializer_class = AuditLogSerializer
    queryset = AuditLog.objects.all()
    filterset_fields = ['action', 'resource_type', 'user']



class JournalEntryListView(ListAPIView):
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_journal_entries'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_journal_entries'))
        else:
            permission_classes.append(HasPermission('create_journal_entries'))
        return [permission() for permission in permission_classes]
    serializer_class = JournalEntrySerializer
    queryset = JournalEntry.objects.all().order_by('-date', '-created_at')
    # pagination_class = StandardResultsSetPagination # Assuming default pagination is set in settings

    def get_queryset(self):
        qs = scope_journal_entries(super().get_queryset(), self.request)
        posted = self.request.query_params.get('posted')
        if posted is not None:
             qs = qs.filter(posted=posted.lower() == 'true')
        
        # Filter by date range if needed
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)

        ordering = self.request.query_params.get('ordering')
        allowed = {
            'date', '-date', 'id', '-id', 'description', '-description',
            'reference', '-reference', 'posted', '-posted', 'created_at', '-created_at',
        }
        if ordering in allowed:
            return qs.order_by(ordering)

        return qs

class JournalEntryDetailView(RetrieveAPIView):
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_journal_entries'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_journal_entries'))
        else:
            permission_classes.append(HasPermission('create_journal_entries'))
        return [permission() for permission in permission_classes]
    serializer_class = JournalEntrySerializer
    queryset = JournalEntry.objects.all()

    def get_queryset(self):
        return scope_journal_entries(super().get_queryset(), self.request)


class JournalEntryCreateView(CreateAPIView):
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_accounting'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_accounting'))
        else:
            permission_classes.append(HasPermission('create_journal_entries'))
        return [permission() for permission in permission_classes]
    serializer_class = JournalEntryCreateSerializer
    queryset = JournalEntry.objects.all()


class JournalEntryReverseView(APIView):
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting'), HasPermission('create_journal_entries')]
        return [permission() for permission in permission_classes]

    def post(self, request, pk):
        serializer = JournalEntryReverseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            journal_entry = scope_journal_entries(
                JournalEntry.objects.all(),
                request,
            ).get(pk=pk)
            reversal = AccountingService.reverse_journal_entry(
                journal_entry=journal_entry,
                user=request.user,
                date=serializer.validated_data.get('date'),
                reason=serializer.validated_data.get('reason', ''),
            )
        except JournalEntry.DoesNotExist:
            return Response({'error': 'Journal entry not found'}, status=status.HTTP_404_NOT_FOUND)
        except DjangoValidationError as exc:
            message = exc.messages[0] if hasattr(exc, 'messages') and exc.messages else str(exc)
            return Response({'error': message}, status=status.HTTP_400_BAD_REQUEST)

        return Response(JournalEntrySerializer(reversal).data, status=status.HTTP_201_CREATED)


class PeriodCloseView(APIView):
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting'), HasPermission('manage_accounting_periods')]
        return [permission() for permission in permission_classes]

    def post(self, request):
        serializer = PeriodCloseSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        try:
            closing_entry = AccountingService.close_income_statement_period(
                user=request.user,
                start_date=serializer.validated_data['start_date'],
                end_date=serializer.validated_data['end_date'],
                branch=serializer.validated_data.get('branch'),
            )
        except DjangoValidationError as exc:
            message = exc.messages[0] if hasattr(exc, 'messages') and exc.messages else str(exc)
            return Response({'error': message}, status=status.HTTP_400_BAD_REQUEST)

        return Response(JournalEntrySerializer(closing_entry).data, status=status.HTTP_200_OK)


class AccountListView(ListCreateAPIView):
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_accounting'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_accounting'))
        else:
            permission_classes.append(HasPermission('manage_chart_of_accounts'))
        return [permission() for permission in permission_classes]
    queryset = Account.objects.all().order_by('code')
    pagination_class = None
    
    def get_serializer_class(self):
        """Use AccountSerializer for create, AccountSimpleSerializer for list"""
        if self.request.method == 'POST':
            from .serializers import AccountSerializer
            return AccountSerializer
        return AccountSimpleSerializer
    
    def get_queryset(self):
        """Filter by is_active if specified in query params"""
        queryset = super().get_queryset()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        parent = self.request.query_params.get('parent')
        if parent == 'null':
            queryset = queryset.filter(parent__isnull=True)
        elif parent:
            queryset = queryset.filter(parent_id=parent)
        account_type = self.request.query_params.get('account_type')
        if account_type:
            queryset = queryset.filter(account_type=account_type)
        account_subtype = self.request.query_params.get('account_subtype')
        if account_subtype:
            queryset = queryset.filter(account_subtype=account_subtype)
        till_enabled = self.request.query_params.get('is_till_enabled')
        if till_enabled is not None:
            queryset = queryset.filter(is_till_enabled=till_enabled.lower() == 'true')
        ordering = self.request.query_params.get('ordering')
        allowed = {
            'code', '-code', 'name', '-name', 'account_type', '-account_type',
            'account_subtype', '-account_subtype', 'is_active', '-is_active',
        }
        if ordering in allowed:
            return queryset.order_by(ordering)
        return queryset

    def perform_create(self, serializer):
        account = serializer.save()
        AuditLog.objects.create(
            user=self.request.user,
            action='create',
            resource_type='Account',
            resource_id=str(account.id),
            details=(
                f"Created account {account.code} - {account.name}; "
                f"Parent: {account.parent_id}; Subtype: {account.account_subtype}; "
                f"Till enabled: {account.is_till_enabled}"
            )
        )

class AccountDetailView(RetrieveUpdateAPIView):
    """View for retrieving and updating individual accounts"""
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_accounting'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_accounting'))
        else:
            permission_classes.append(HasPermission('manage_chart_of_accounts'))
        return [permission() for permission in permission_classes]
    queryset = Account.objects.all()
    
    def get_serializer_class(self):
        from .serializers import AccountSerializer
        return AccountSerializer

    def perform_update(self, serializer):
        account = serializer.save()
        AuditLog.objects.create(
            user=self.request.user,
            action='update',
            resource_type='Account',
            resource_id=str(account.id),
            details=(
                f"Updated account {account.code} - {account.name}; "
                f"Parent: {account.parent_id}; Subtype: {account.account_subtype}; "
                f"Till enabled: {account.is_till_enabled}; Active: {account.is_active}"
            )
        )
    
    def delete(self, request, *args, **kwargs):
        return Response(
            {'error': 'Accounts cannot be deleted. Deactivate the account instead.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


# ============================================================================
# PHASE 12: MANAGEMENT DASHBOARD
# ============================================================================

class ManagementDashboardView(APIView):
    """Executive Management Dashboard Metrics"""
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_financial_reports'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_financial_reports'))
        else:
            permission_classes.append(HasPermission('export_reports'))
        return [permission() for permission in permission_classes]
    
    def get(self, request):
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        
        # Default to current month-to-date
        end_date = parse_date(end_date_str) if end_date_str else timezone.now().date()
        start_date = parse_date(start_date_str) if start_date_str else end_date.replace(day=1)
        
        branch_id = get_report_branch_id(request)
        report = DashboardService.get_management_metrics(start_date, end_date, branch_id=branch_id)
        return Response(report)

    def post(self, request):
        """Export Board Pack PDF"""
        action = request.data.get('action')
        if action == 'export_pdf':
            start_date_str = request.data.get('start_date')
            end_date_str = request.data.get('end_date')
            
            # Default to current month-to-date
            end_date = parse_date(end_date_str) if end_date_str else timezone.now().date()
            start_date = parse_date(start_date_str) if start_date_str else end_date.replace(day=1)
            branch_id = get_report_branch_id(request)
            
            pdf_buffer = ExportService.generate_board_pack(start_date, end_date, branch_id=branch_id)
            
            response = HttpResponse(pdf_buffer, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="board_pack_{end_date}.pdf"'
            return response
            
        return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)


# ============================================================================
# PHASE 13: ACCRUALS VIEWSETS
# ============================================================================

from .models import Accrual
from .serializers import AccrualSerializer, AccrualCandidateSerializer
from .accruals import AccrualService

class AccrualViewSet(viewsets.ModelViewSet):
    queryset = Accrual.objects.all().select_related('account', 'created_by')
    serializer_class = AccrualSerializer
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_accounting'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_accounting'))
        else:
            permission_classes.append(HasPermission('create_journal_entries'))
        return [permission() for permission in permission_classes]
    filterset_fields = ['status', 'accrual_type']

    def get_queryset(self):
        return scope_accruals(super().get_queryset(), self.request)
    
    @action(detail=False, methods=['get'])
    def candidates(self, request):
        """
        Get potential accrual candidates (uninvoiced WOs, unbilled POs).
        """
        cutoff_date = request.query_params.get('cutoff_date')
        if cutoff_date:
            cutoff_date = parse_date(cutoff_date)
            
        branch_id = get_accounting_branch_id(request)
        candidates = AccrualService.identify_accruals(cutoff_date, branch_id=branch_id)
        
        # Flatten and serialize
        # The service returns {'revenue': [], 'expense': []}
        # We need to flatten to a list for the serializer
        
        flat_list = []
        for item in candidates['revenue']:
            flat_list.append({
                'type': 'revenue',
                'source_model': item['source_model'],
                'source_id': item['source_id'],
                'source_reference': item['source_reference'],
                'amount': item['amount'],
                'date': item['date'],
                'description': item['description']
            })
        for item in candidates['expense']:
            flat_list.append({
                'type': 'expense',
                'source_model': item['source_model'],
                'source_id': item['source_id'],
                'source_reference': item['source_reference'],
                'amount': item['amount'],
                'date': item['date'],
                'description': item['description']
            })
            
        serializer = AccrualCandidateSerializer(flat_list, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def reverse(self, request, pk=None):
        """
        Reverse an existing accrual.
        """
        try:
            accrual = self.get_object()
            reversal = AccrualService.reverse_accrual(request.user, accrual)
            if not reversal:
                return Response({'error': 'Accrual already reversed or not found'}, status=status.HTTP_400_BAD_REQUEST)
            accrual.refresh_from_db()
            serializer = self.get_serializer(accrual)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    def perform_create(self, serializer):
        # We override perform_create to use the Service which handles GL posting
        # But ModelViewSet calls serializer.save().
        # We should probably use a custom create method or override create.
        pass
        
    def create(self, request, *args, **kwargs):
        """
        Custom create to use AccrualService
        """
        # Validate serialized data first?
        # AccrualSerializer expects model fields.
        # But we need account_id, amount, etc.
        
        data = request.data
        try:
            accrual = AccrualService.create_accrual(
                user=request.user,
                account_id=data.get('account'),
                amount=Decimal(str(data.get('amount'))),
                date=parse_date(data.get('accrual_date')),
                description=data.get('description'),
                accrual_type=data.get('accrual_type'),
                reversal_date=parse_date(data.get('reversal_date')) if data.get('reversal_date') else None,
                source_model=data.get('source_model', ''),
                source_id=data.get('source_id'),
                source_reference=data.get('source_reference', ''),
                branch_id=get_accounting_branch_id(request),
            )
            serializer = self.get_serializer(accrual)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AnalyticsDashboardView(APIView):
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:
            permission_classes.append(HasPermission('view_financial_reports'))
        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:
            permission_classes.append(HasPermission('view_financial_reports'))
        else:
            permission_classes.append(HasPermission('view_financial_reports'))
        return [permission() for permission in permission_classes]
    
    def get(self, request):
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        branch_id = get_report_branch_id(request)
        
        today = timezone.now().date()
        if not start_date_str:
            start_date = today.replace(day=1)
        else:
            start_date = parse_date(start_date_str)
            if not start_date:
                return Response({'detail': 'Invalid start_date'}, status=status.HTTP_400_BAD_REQUEST)
            
        if not end_date_str:
            end_date = today
        else:
            end_date = parse_date(end_date_str)
            if not end_date:
                return Response({'detail': 'Invalid end_date'}, status=status.HTTP_400_BAD_REQUEST)
            
        from .analytics import AnalyticsService
        data = AnalyticsService.get_dashboard_snapshot(start_date, end_date, branch_id)
        return Response(data)


class AccountingCommandCenterView(APIView):
    permission_classes = [IsAuthenticated, IsModuleEnabled('accounting'), HasPermission('view_financial_reports')]

    def get(self, request):
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        today = timezone.now().date()

        start_date = parse_date(start_date_str) if start_date_str else today.replace(day=1)
        end_date = parse_date(end_date_str) if end_date_str else today

        if not start_date or not end_date:
            return Response({'detail': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        branch_id = get_report_branch_id(request)
        data = DashboardService.get_command_center_snapshot(
            start_date=start_date,
            end_date=end_date,
            branch_id=branch_id,
            user=request.user,
        )
        return Response(data)
