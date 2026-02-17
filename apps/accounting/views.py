from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from rest_framework.generics import ListAPIView, CreateAPIView, RetrieveUpdateAPIView, ListCreateAPIView
from rest_framework.parsers import MultiPartParser, FormParser
from django.utils.dateparse import parse_date
import csv
import io
from decimal import Decimal
from django.utils import timezone
from datetime import datetime
from .services import ReportingService, DashboardService, ExportService
from .models import JournalEntry, Account, AccountingControl, AuditLog
from .serializers import JournalEntrySerializer, JournalEntryCreateSerializer, AccountSimpleSerializer, AccountingControlSerializer, AuditLogSerializer

from django.http import HttpResponse
from apps.accounts.permissions import HasPermission
from apps.branches.utils import resolve_branch

def get_report_branch_id(request):
    """
    Get branch ID for reports.
    Superusers can see global data (None) if no branch specified.
    Regular users are forced to a branch context.
    """
    if request.user.is_superuser and not request.query_params.get('branch') and not request.query_params.get('branch_id'):
        return None
    branch = resolve_branch(request)
    return branch.id if branch else None

class BalanceSheetView(APIView):
    permission_classes = [IsAuthenticated, HasPermission('view_financial_reports')]

    def get(self, request):
        date_str = request.query_params.get('date')
        date = parse_date(date_str) if date_str else timezone.now().date()
        
        branch_id = get_report_branch_id(request)
        report = ReportingService.get_balance_sheet(date, branch_id=branch_id)
        return Response(report)

class ProfitLossView(APIView):
    permission_classes = [IsAuthenticated, HasPermission('view_financial_reports')]

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

class TrialBalanceView(APIView):
    permission_classes = [IsAuthenticated, HasPermission('view_financial_reports')]

    def get(self, request):
        date_str = request.query_params.get('date')
        date = parse_date(date_str) if date_str else timezone.now().date()
        
        branch_id = get_report_branch_id(request)
        report = ReportingService.get_trial_balance(date, branch_id=branch_id)
        return Response(report)

class AgingReportView(APIView):
    permission_classes = [IsAuthenticated, HasPermission('view_financial_reports')]

    def get(self, request):
        report_type = request.query_params.get('type', 'ar') # 'ar' or 'ap'
        date_str = request.query_params.get('date')
        date = parse_date(date_str) if date_str else timezone.now().date()
        
        branch_id = get_report_branch_id(request)
        report = ReportingService.get_aging_report(report_type, date, branch_id=branch_id)
        return Response(report)

class CashFlowView(APIView):
    permission_classes = [IsAuthenticated, HasPermission('view_financial_reports')]

    def get(self, request):
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        
        start_date = parse_date(start_date_str) if start_date_str else None
        end_date = parse_date(end_date_str) if end_date_str else timezone.now().date()
        
        branch_id = get_report_branch_id(request)
        report = ReportingService.get_cash_flow_statement(start_date, end_date, branch_id=branch_id)
        return Response(report)

class TaxReportView(APIView):
    permission_classes = [IsAuthenticated, HasPermission('view_financial_reports')]
    
    def get(self, request):
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        
        start_date = parse_date(start_date_str) if start_date_str else None
        end_date = parse_date(end_date_str) if end_date_str else None
            
        branch_id = get_report_branch_id(request)
        report = ReportingService.get_tax_report(start_date, end_date, branch_id=branch_id)
        return Response(report)


# ============================================================================
# PHASE 8: CASH & BANKING VIEWS
# ============================================================================

from rest_framework import viewsets, status
from rest_framework.decorators import action
from .models import BankStatement, BankStatementLine, FundTransfer, Transaction
from .serializers import BankStatementSerializer, BankStatementLineSerializer, FundTransferSerializer, TransactionSerializer

class BankStatementViewSet(viewsets.ModelViewSet):
    """ViewSet for bank statements"""
    queryset = BankStatement.objects.all()
    serializer_class = BankStatementSerializer
    permission_classes = [IsAuthenticated]
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def reconcile(self, request, pk=None):
        """Mark statement as reconciled"""
        statement = self.get_object()
        statement.reconciled = True
        statement.reconciled_by = request.user
        statement.reconciled_at = timezone.now()
        statement.save()
        return Response({'status': 'reconciled'})

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload(self, request, pk=None):
        """Upload and parse bank statement CSV"""
        statement = self.get_object()
        
        if 'statement_file' not in request.FILES:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
            
        file_obj = request.FILES['statement_file']
        statement.statement_file = file_obj
        statement.save()
        
        # Parse CSV
        try:
            decoded_file = file_obj.read().decode('utf-8')
            io_string = io.StringIO(decoded_file)
            reader = csv.DictReader(io_string)
            
            lines_created = 0
            
            for row in reader:
                # Expected headers: Date, Description, Amount
                # normalize keys to lowercase
                row = {k.lower(): v for k, v in row.items()}
                
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
            return Response({'error': f"Failed to parse CSV: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


class BankStatementLineViewSet(viewsets.ModelViewSet):
    """ViewSet for bank statement lines"""
    queryset = BankStatementLine.objects.all()
    serializer_class = BankStatementLineSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['bank_statement', 'matched']
    
    @action(detail=True, methods=['post'])
    def match(self, request, pk=None):
        """Match a bank line to a GL transaction"""
        line = self.get_object()
        transaction_id = request.data.get('transaction_id')
        
        if not transaction_id:
            return Response({'error': 'transaction_id required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            transaction = Transaction.objects.get(id=transaction_id)
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
        line.save()
        
        return Response({'status': 'unmatched'})


class UnreconciledTransactionsView(ListAPIView):
    """Fetch transactions for a bank account that are not yet matched"""
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionSerializer # This now includes date
    
    def get_queryset(self):
        account_id = self.request.query_params.get('account_id')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        
        if not account_id:
            return Transaction.objects.none()
            
        qs = Transaction.objects.filter(
            account_id=account_id,
            matched_bank_lines__isnull=True # Not matched to any bank line
        ).select_related('journal_entry', 'account')
        
        if start_date:
            qs = qs.filter(journal_entry__date__gte=start_date)
        if end_date:
            qs = qs.filter(journal_entry__date__lte=end_date)
            
        return qs.order_by('journal_entry__date')


class FundTransferViewSet(viewsets.ModelViewSet):
    """ViewSet for fund transfers"""
    queryset = FundTransfer.objects.all()
    serializer_class = FundTransferSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status', 'from_account', 'to_account']
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a fund transfer"""
        transfer = self.get_object()
        
        if transfer.status != 'pending':
            return Response({'error': 'Transfer must be pending'}, status=status.HTTP_400_BAD_REQUEST)
        
        transfer.status = 'approved'
        transfer.approved_by = request.user
        transfer.approved_at = timezone.now()
        transfer.save()
        return Response({'status': 'approved'})
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Complete a fund transfer (triggers GL posting)"""
        transfer = self.get_object()
        
        if transfer.status not in ['draft', 'approved']:
            return Response({'error': f'Transfer must be draft or approved (current status: {transfer.status})'}, status=status.HTTP_400_BAD_REQUEST)
        
        transfer.status = 'completed'
        transfer.save()  # Signal will auto-post GL entry
        return Response({'status': 'completed', 'journal_entry_id': transfer.journal_entry.id if transfer.journal_entry else None})

# ============================================================================
# PHASE 9: JOB PROFITABILITY & BRANCH REPORTS
# ============================================================================

class JobProfitabilityView(APIView):
    """Job profitability analysis"""
    permission_classes = [IsAuthenticated]
    
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
    permission_classes = [IsAuthenticated]
    filterset_fields = ['fiscal_year', 'status', 'branch']
    
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
    permission_classes = [IsAuthenticated]
    filterset_fields = ['budget', 'account', 'period']


class BudgetVsActualView(APIView):
    """Budget vs Actual variance analysis"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        budget_id = request.query_params.get('budget_id')
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        
        if not budget_id:
            return Response({'error': 'budget_id required'}, status=status.HTTP_400_BAD_REQUEST)
        
        start_date = parse_date(start_date_str) if start_date_str else None
        end_date = parse_date(end_date_str) if end_date_str else None
        
        report = ReportingService.get_budget_vs_actual(budget_id, start_date, end_date)
        return Response(report)


class AccountingControlView(RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AccountingControlSerializer
    
    def get_object(self):
        return AccountingControl.get_settings()
        
    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

class AuditLogView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AuditLogSerializer
    queryset = AuditLog.objects.all()
    filterset_fields = ['action', 'resource_type', 'user']



class JournalEntryListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = JournalEntrySerializer
    queryset = JournalEntry.objects.all().order_by('-date', '-created_at')
    # pagination_class = StandardResultsSetPagination # Assuming default pagination is set in settings

    def get_queryset(self):
        qs = super().get_queryset()
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

        return qs

class JournalEntryDetailView(RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = JournalEntrySerializer
    queryset = JournalEntry.objects.all()


class JournalEntryCreateView(CreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = JournalEntryCreateSerializer
    queryset = JournalEntry.objects.all()


class AccountListView(ListCreateAPIView):
    permission_classes = [IsAuthenticated]
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
        return queryset

class AccountDetailView(RetrieveUpdateAPIView):
    """View for retrieving, updating, and deleting individual accounts"""
    permission_classes = [IsAuthenticated]
    queryset = Account.objects.all()
    
    def get_serializer_class(self):
        from .serializers import AccountSerializer
        return AccountSerializer
    
    def delete(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ============================================================================
# PHASE 12: MANAGEMENT DASHBOARD
# ============================================================================

class ManagementDashboardView(APIView):
    """Executive Management Dashboard Metrics"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        
        # Default to current month-to-date
        end_date = parse_date(end_date_str) if end_date_str else timezone.now().date()
        start_date = parse_date(start_date_str) if start_date_str else end_date.replace(day=1)
        
        report = DashboardService.get_management_metrics(start_date, end_date)
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
            
            pdf_buffer = ExportService.generate_board_pack(start_date, end_date)
            
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
    permission_classes = [IsAuthenticated]
    filterset_fields = ['status', 'accrual_type']
    
    @action(detail=False, methods=['get'])
    def candidates(self, request):
        """
        Get potential accrual candidates (uninvoiced WOs, unbilled POs).
        """
        cutoff_date = request.query_params.get('cutoff_date')
        if cutoff_date:
            cutoff_date = parse_date(cutoff_date)
            
        candidates = AccrualService.identify_accruals(cutoff_date)
        
        # Flatten and serialize
        # The service returns {'revenue': [], 'expense': []}
        # We need to flatten to a list for the serializer
        
        flat_list = []
        for item in candidates['revenue']:
            flat_list.append({
                'type': 'revenue',
                'source_model': 'WorkOrder',
                'source_id': item['source'].id,
                'source_reference': item['source'].work_order_number,
                'amount': item['amount'],
                'date': item['date'],
                'description': item['description']
            })
        for item in candidates['expense']:
            flat_list.append({
                'type': 'expense',
                'source_model': 'PurchaseOrder',
                'source_id': item['source'].id,
                'source_reference': item['source'].po_number,
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
            accrual = AccrualService.reverse_accrual(pk, request.user)
            if not accrual:
                return Response({'error': 'Accrual already reversed or not found'}, status=status.HTTP_400_BAD_REQUEST)
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
                reversal_date=parse_date(data.get('reversal_date')) if data.get('reversal_date') else None
            )
            serializer = self.get_serializer(accrual)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AnalyticsDashboardView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        branch_id = request.query_params.get('branch')
        
        # Default to current month if dates not provided
        today = timezone.now().date()
        if not start_date_str:
            start_date = today.replace(day=1)
        else:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            
        if not end_date_str:
            end_date = today
        else:
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
            
        from .analytics import AnalyticsService
        data = AnalyticsService.get_dashboard_snapshot(start_date, end_date, branch_id)
        return Response(data)
