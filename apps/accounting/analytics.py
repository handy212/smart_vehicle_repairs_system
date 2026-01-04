from decimal import Decimal
from django.db.models import Sum, Q, F
from django.utils import timezone
from django.apps import apps
from .models import Transaction, Account, Budget
# Lazy import models to avoid circular dependencies and fix import paths
# WorkOrder = apps.get_model('workorders', 'WorkOrder')
# Invoice = apps.get_model('billing', 'Invoice')
# Bill = apps.get_model('billing', 'Bill')

from .services import ReportingService
import datetime

class AnalyticsService:
    @staticmethod
    def get_dashboard_snapshot(start_date, end_date, branch_id=None):
        """
        Returns a comprehensive payload for the unified dashboard.
        Aggregates financial health, trends, and operational insights.
        """
        # 1. Financial Health (Pulse)
        # ------------------------------------------------------------------
        # Cash on Hand (Sum of all Bank/Cash accounts)
        cash_code_prefix = ['1000', '1010', '1020']
        cash_balance = Decimal('0.00')
        for code in cash_code_prefix:
            accounts = Account.objects.filter(code__startswith=code)
            for acc in accounts:
                cash_balance += ReportingService.get_account_balance(acc, date=end_date, branch_id=branch_id)

        # Net Profit (Income - Expenses)
        pl = ReportingService.get_profit_loss(start_date, end_date, branch_id=branch_id)
        net_profit = pl['totals']['net_income']
        total_revenue = pl['totals']['income']
        total_expenses = pl['totals']['expenses']
        
        net_profit_margin = 0
        if total_revenue > 0:
            net_profit_margin = (net_profit / total_revenue) * 100

        # Monthly Burn Rate (Average monthly expenses over last 3 months)
        # Improving this by looking back 90 days irrespective of selected period for accurate burn
        burn_start = end_date - datetime.timedelta(days=90)
        burn_pl = ReportingService.get_profit_loss(burn_start, end_date, branch_id=branch_id)
        monthly_burn = burn_pl['totals']['expenses'] / 3 if burn_pl['totals']['expenses'] > 0 else Decimal('0')
        
        runway_months = 999 
        if monthly_burn > 0:
            runway_months = cash_balance / monthly_burn

        # 2. Trends (Daily/Weekly series for charts)
        # ------------------------------------------------------------------
        # We'll generate daily data points for the selected range for Revenue vs Expenses
        # This is expensive, so likely optimized in real-world with aggregation queries,
        # but iterating for robustness first.
        trends = []
        # Optimization: Single query for all transactions in range
        txs = Transaction.objects.filter(
            journal_entry__date__range=[start_date, end_date],
            journal_entry__posted=True
        ).select_related('account', 'journal_entry')
        
        if branch_id:
            txs = txs.filter(journal_entry__branch_id=branch_id)

        # Group by date
        daily_data = {}
        curr = start_date
        while curr <= end_date:
            daily_data[curr.isoformat()] = {'date': curr.isoformat(), 'revenue': 0, 'expense': 0, 'cash_flow': 0}
            curr += datetime.timedelta(days=1)

        # Aggregate efficiently
        for tx in txs:
            d_str = tx.journal_entry.date.isoformat()
            if d_str in daily_data:
                # Revenue: Credit is positive increase
                if tx.account.account_type == 'income':
                    if tx.transaction_type == 'credit':
                        daily_data[d_str]['revenue'] += float(tx.amount)
                    else:
                        daily_data[d_str]['revenue'] -= float(tx.amount)
                
                # Expense: Debit is positive increase
                elif tx.account.account_type == 'expense':
                    if tx.transaction_type == 'debit':
                        daily_data[d_str]['expense'] += float(tx.amount)
                    else:
                        daily_data[d_str]['expense'] -= float(tx.amount)

        # Cash Flow trend (simplification: Cash account Debits - Credits)
        # Re-using logic or separate query? Separate for clarity on account types.
        cash_txs = Transaction.objects.filter(
            journal_entry__date__range=[start_date, end_date],
            journal_entry__posted=True,
            account__code__startswith='10' # Cash/Bank
        ).values('journal_entry__date', 'transaction_type').annotate(total=Sum('amount'))
        
        # Apply cash flow to daily data
        for entry in cash_txs:
            d_str = entry['journal_entry__date'].isoformat()
            if d_str in daily_data:
                amount = float(entry['total'])
                if entry['transaction_type'] == 'debit': # Cash In
                    daily_data[d_str]['cash_flow'] += amount
                else: # Cash Out
                    daily_data[d_str]['cash_flow'] -= amount

        sorted_trends = sorted(daily_data.values(), key=lambda x: x['date'])

        # 3. Smart Insights / Alerts
        # ------------------------------------------------------------------
        insights = []
        
        # Alert: Low Runway
        if runway_months < 3 and monthly_burn > 0:
            insights.append({
                "type": "danger",
                "title": "Low Cash Runway",
                "message": f"Only {runway_months:.1f} months of runway remaining based on recent burn.",
                "action_link": "/accounting/reports/cash-flow"
            })
            
        # Alert: High Unpaid invoices (AR)
        ar_aging = ReportingService.get_aging_report('ar', end_date)
        overdue_90 = ar_aging['summary']['90+']
        if overdue_90 > 1000:
             insights.append({
                "type": "warning",
                "title": "Significant Overdue AR",
                "message": f"${overdue_90:,.2f} in invoices are overdue by 90+ days.",
                "action_link": "/accounting/reports/aging"
            })

        # Alert: Budget Overruns (if budget exists for this year)
        # Simplified check
        
        # 4. Top Operations
        # ------------------------------------------------------------------
        # Top 5 Profitable Jobs (from Job Profitability service)
        jp = ReportingService.get_job_profitability(start_date=start_date, end_date=end_date)
        top_jobs = sorted(jp['jobs'], key=lambda x: x['gross_profit'], reverse=True)[:5]

        return {
            "period": {
                "start": start_date,
                "end": end_date
            },
            "financial_health": {
                "cash_on_hand": float(cash_balance),
                "monthly_burn": float(monthly_burn),
                "runway_months": float(runway_months),
                "net_profit": float(net_profit),
                "net_profit_margin": float(net_profit_margin),
                "total_revenue": float(total_revenue),
                "total_expenses": float(total_expenses)
            },
            "trends": sorted_trends,
            "insights": insights,
            "top_jobs": top_jobs
        }
