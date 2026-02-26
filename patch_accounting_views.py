import re

source_file = 'apps/accounting/views.py'

with open(source_file, 'r') as f:
    lines = f.readlines()

mapping = {
    # Reports are already handled securely with [IsAuthenticated, HasPermission('view_financial_reports')]
    
    # Banking
    'BankStatementViewSet': ('view_banking', 'manage_banking'),
    'BankStatementLineViewSet': ('view_banking', 'manage_banking'),
    'UnreconciledTransactionsView': ('view_banking', 'manage_banking'),
    'FundTransferViewSet': ('view_banking', 'manage_banking'),
    
    # Budgets
    'BudgetViewSet': ('view_budgets', 'manage_budgets'),
    'BudgetLineViewSet': ('view_budgets', 'manage_budgets'),
    'BudgetVsActualView': ('view_budgets', 'manage_budgets'),
    
    # Accounting Core
    'AccountingControlView': ('view_accounting', 'manage_accounting'),
    'AuditLogView': ('view_accounting', 'manage_accounting'),
    'JournalEntryListView': ('view_accounting', 'manage_accounting'),
    'JournalEntryDetailView': ('view_accounting', 'manage_accounting'),
    'JournalEntryCreateView': ('view_accounting', 'manage_accounting'),
    'AccountListView': ('view_accounting', 'manage_accounting'),
    'AccountDetailView': ('view_accounting', 'manage_accounting'),
    'ManagementDashboardView': ('view_financial_reports', 'manage_accounting'),
    'AccrualViewSet': ('view_accounting', 'manage_accounting'),
    'AnalyticsDashboardView': ('view_financial_reports', 'manage_accounting'),
    'JobProfitabilityView': ('view_financial_reports', 'manage_accounting'),
}

in_class = None
out_lines = []

for line in lines:
    class_match = re.match(r"^class (\w+)\(.*?:\s*", line)
    if class_match:
        in_class = class_match.group(1)
        out_lines.append(line)
        continue
    
    # Basic exit from class logic 
    if line.startswith("class ") or line.startswith("def "):
        if line.startswith("def ") and not line.startswith("    def "):
            pass # Module level function
            
    if in_class and "permission_classes = [IsAuthenticated]" in line and in_class in mapping:
        vp, mp = mapping[in_class]
        out_lines.append(f"    def get_permissions(self):\n")
        out_lines.append(f"        permission_classes = [IsAuthenticated]\n")
        
        # Determine the read action types vs write actions
        # standard DRF viewset
        out_lines.append(f"        if hasattr(self, 'action') and getattr(self, 'action') in ['list', 'retrieve', 'candidates', 'my_requests', 'my_slips', 'my_summary']:\n")
        out_lines.append(f"            permission_classes.append(HasPermission('{vp}'))\n")
        out_lines.append(f"        elif hasattr(self, 'request') and getattr(self.request, 'method') in ['GET', 'HEAD', 'OPTIONS']:\n")
        out_lines.append(f"            permission_classes.append(HasPermission('{vp}'))\n")
        out_lines.append(f"        else:\n")
        out_lines.append(f"            permission_classes.append(HasPermission('{mp}'))\n")
        out_lines.append(f"        return [permission() for permission in permission_classes]\n")
        
        in_class = None # Prevent replacing multiple times if it had two definitions
        continue
        
    out_lines.append(line)

with open(source_file, 'w') as f:
    f.writelines(out_lines)

print("Accounting permissions patched.")
