from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# Router for ViewSets
router = DefaultRouter()
router.register(r'bank-statements', views.BankStatementViewSet, basename='bankstatement')
router.register(r'bank-statement-lines', views.BankStatementLineViewSet, basename='bankstatementline')
router.register(r'fund-transfers', views.FundTransferViewSet, basename='fundtransfer')
router.register(r'budgets', views.BudgetViewSet, basename='budget')
router.register(r'budget-lines', views.BudgetLineViewSet, basename='budgetline')
router.register(r'accruals', views.AccrualViewSet, basename='accrual')

urlpatterns = [
    # Financial Reports
    path('reports/balance-sheet/', views.BalanceSheetView.as_view(), name='balance-sheet'),
    path('reports/profit-loss/', views.ProfitLossView.as_view(), name='profit-loss'),
    path('reports/trial-balance/', views.TrialBalanceView.as_view(), name='trial-balance'),
    path('reports/general-ledger/', views.GeneralLedgerView.as_view(), name='general-ledger'),
    path('reports/aging/', views.AgingReportView.as_view(), name='aging-report'),
    path('reports/cash-flow/', views.CashFlowView.as_view(), name='cash-flow'),
    path('reports/tax/', views.TaxReportView.as_view(), name='tax-report'),
    path('reports/job-profitability/', views.JobProfitabilityView.as_view(), name='job-profitability'),
    path('reports/expense-breakdown/', views.ExpenseBreakdownView.as_view(), name='expense-breakdown'),
    path('reports/budget-vs-actual/', views.BudgetVsActualView.as_view(), name='budget-vs-actual'),
    path('reports/management-dashboard/', views.ManagementDashboardView.as_view(), name='management-dashboard'),
    path('analytics/dashboard/', views.AnalyticsDashboardView.as_view(), name='analytics-dashboard'),
    
    # Journal Entries
    path('journal-entries/', views.JournalEntryListView.as_view(), name='journal-entries'),
    path('journal-entries/create/', views.JournalEntryCreateView.as_view(), name='journal-entry-create'),
    path('journal-entries/<int:pk>/reverse/', views.JournalEntryReverseView.as_view(), name='journal-entry-reverse'),
    path('journal-entries/<int:pk>/', views.JournalEntryDetailView.as_view(), name='journal-entry-detail'),
    path('period-close/', views.PeriodCloseView.as_view(), name='period-close'),
    
    # Chart of Accounts
    path('accounts/', views.AccountListView.as_view(), name='accounts'),
    path('accounts/<int:pk>/', views.AccountDetailView.as_view(), name='account-detail'),
    
    # Controls & Compliance
    path('control/settings/', views.AccountingControlView.as_view(), name='accounting-settings'),
    path('control/audit-log/', views.AuditLogView.as_view(), name='audit-log'),
    
    # Phase 8: Cash & Banking (ViewSets via router)
    path('transactions/unreconciled/', views.UnreconciledTransactionsView.as_view(), name='unreconciled-transactions'),
    path('', include(router.urls)),
]
