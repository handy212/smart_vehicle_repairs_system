export interface DashboardQuickAccessItem {
  id: string;
  label: string;
  href?: string;
  permission?: string;
  module?: string;
  enabled: boolean;
  badge?: string;
}

export interface DashboardQuickAccessGroup {
  id: string;
  title: string;
  items: DashboardQuickAccessItem[];
}

export interface DashboardHubCommandAction {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  permission?: string;
  module?: string;
}

export const DASHBOARD_QUICK_ACCESS_GROUPS: DashboardQuickAccessGroup[] = [
  {
    id: "customers-sales",
    title: "Customers & Sales",
    items: [
      { id: "customer-centre", label: "Customer Centre", href: "/customers", permission: "view_customers", module: "customers", enabled: true },
      { id: "sales-orders", label: "Sales Orders", href: "/billing/proformas", permission: "view_billing", module: "billing", enabled: true },
      { id: "create-invoices", label: "Create Invoices", href: "/billing/invoices/new", permission: "create_invoices", module: "billing", enabled: true },
      { id: "receive-payments", label: "Receive Payments", href: "/billing/payments", permission: "view_billing", module: "billing", enabled: true },
      { id: "credit-memos-refunds", label: "Create Credit Memos/Refunds", href: "/billing/credit-notes", permission: "view_billing", module: "billing", enabled: true },
      { id: "customer-statements", label: "Customer Statements", href: "/customers/statements", permission: "view_customers", module: "customers", enabled: true },
      { id: "sales-reports", label: "Sales Reports", href: "/reports/financial", permission: "view_reports", module: "reports", enabled: true },
    ],
  },
  {
    id: "vendors-purchases",
    title: "Vendors & Purchases",
    items: [
      { id: "vendor-centre", label: "Vendor Centre", href: "/inventory/suppliers", permission: "view_inventory", module: "inventory", enabled: true },
      { id: "create-purchase-orders", label: "Create Purchase Orders", href: "/inventory/purchase-orders/new", permission: "create_purchase_orders", module: "inventory", enabled: true },
      { id: "receive-inventory", label: "Receive Inventory", href: "/inventory/purchase-orders", permission: "view_inventory", module: "inventory", enabled: true },
      { id: "enter-bills", label: "Enter Bills", href: "/billing/bills", permission: "view_billing", module: "billing", enabled: true },
      { id: "pay-bills", label: "Pay Bills", href: "/billing/bills", permission: "view_billing", module: "billing", enabled: true },
      { id: "vendor-credits", label: "Vendor Credits", href: "/billing/vendor-credits", permission: "view_billing", module: "billing", enabled: true },
      { id: "purchase-reports", label: "Purchase Reports", href: "/inventory/reports/accounting", permission: "view_inventory", module: "inventory", enabled: true },
    ],
  },
  {
    id: "inventory-management",
    title: "Inventory Management",
    items: [
      { id: "item-list", label: "Item List", href: "/inventory", permission: "view_inventory", module: "inventory", enabled: true },
      { id: "inventory-adjustments", label: "Inventory Adjustments", href: "/inventory/physical-counts", permission: "view_inventory", module: "inventory", enabled: true },
      { id: "inventory-transfers", label: "Inventory Transfers", href: "/inventory/transfers", permission: "view_inventory", module: "inventory", enabled: true },
      { id: "stock-valuation", label: "Stock Valuation", href: "/inventory/reports/accounting", permission: "view_inventory", module: "inventory", enabled: true },
      { id: "reorder-reports", label: "Reorder Reports", href: "/inventory/reports/accounting", permission: "view_inventory", module: "inventory", enabled: true },
      { id: "inventory-reports", label: "Inventory Reports", href: "/reports/inventory", permission: "view_reports", module: "reports", enabled: true },
    ],
  },
  {
    id: "banking-cash",
    title: "Banking & Cash Management",
    items: [
      { id: "pay-cash-expense", label: "Pay Cash Expense", href: "/accounting/tills", permission: "view_accounting", module: "accounting", enabled: true },
      { id: "make-deposits", label: "Make Deposits", href: "/accounting/tills", permission: "view_accounting", module: "accounting", enabled: true },
      { id: "transfer-funds", label: "Transfer Funds", href: "/accounting/transfers", permission: "view_accounting", module: "accounting", enabled: true },
      { id: "bank-reconciliation", label: "Bank Reconciliation", href: "/accounting/banking/reconciliation", permission: "view_bank_statements", module: "accounting", enabled: true },
      { id: "cash-flow-reports", label: "Cash Flow Reports", href: "/accounting/reports/cash-flow", permission: "view_financial_reports", module: "accounting", enabled: true },
    ],
  },
  {
    id: "company-gl",
    title: "Company & General Ledger",
    items: [
      { id: "chart-of-accounts", label: "Chart of Accounts", href: "/accounting/accounts", permission: "view_accounting", module: "accounting", enabled: true },
      { id: "journal-entries", label: "Journal Entries", href: "/accounting/journal-entries", permission: "view_journal_entries", module: "accounting", enabled: true },
      { id: "account-register", label: "Account Register", href: "/accounting/reports/general-ledger", permission: "view_financial_reports", module: "accounting", enabled: true },
      { id: "budgeting", label: "Budgeting", href: "/accounting/budgets", permission: "view_budgets", module: "accounting", enabled: true },
      { id: "fiscal-year-setup", label: "Fiscal Year Setup", href: "/accounting/controls", permission: "manage_accounting_periods", module: "accounting", enabled: true },
      { id: "general-ledger-reports", label: "General Ledger Reports", href: "/accounting/reports/general-ledger", permission: "view_financial_reports", module: "accounting", enabled: true },
    ],
  },
  {
    id: "employees-payroll",
    title: "Employees & Payroll",
    items: [
      { id: "employee-centre", label: "Employee Centre", href: "/hr/staff", permission: "view_employees", module: "hr", enabled: true },
      { id: "payroll-processing", label: "Payroll Processing", href: "/hr/payroll", permission: "view_payroll", module: "hr", enabled: true },
      { id: "time-tracking", label: "Time Tracking", href: "/hr/attendance", permission: "view_attendance", module: "hr", enabled: true },
      { id: "leave-management", label: "Leave Management", href: "/hr/leave", permission: "view_leave", module: "hr", enabled: true },
      { id: "payroll-reports", label: "Payroll Reports", href: "/hr/payroll", permission: "view_payroll", module: "hr", enabled: true },
      { id: "statutory-deductions", label: "Statutory Deductions", href: "/hr/payroll/components", permission: "view_payroll", module: "hr", enabled: true },
    ],
  },
  {
    id: "fixed-assets",
    title: "Fixed Assets",
    items: [
      { id: "asset-register", label: "Asset Register", href: "/fixed-assets", permission: "view_assets", module: "fixed-assets", enabled: true },
      { id: "asset-acquisition", label: "Asset Acquisition", href: "/fixed-assets/acquisitions", permission: "view_assets", module: "fixed-assets", enabled: true },
      { id: "asset-disposal", label: "Asset Disposal", href: "/fixed-assets/disposals", permission: "edit_assets", module: "fixed-assets", enabled: true },
      { id: "asset-transfer", label: "Asset Transfer", href: "/fixed-assets/transfers", permission: "edit_assets", module: "fixed-assets", enabled: true },
      { id: "depreciation-processing", label: "Depreciation Processing", href: "/fixed-assets/reports/valuation", permission: "view_assets", module: "fixed-assets", enabled: true },
      { id: "fixed-asset-reports", label: "Fixed Asset Reports", href: "/fixed-assets/reports/valuation", permission: "view_assets", module: "fixed-assets", enabled: true },
    ],
  },
  {
    id: "accounts-receivable",
    title: "Accounts Receivable (A/R)",
    items: [
      { id: "customer-balances", label: "Customer Balances", href: "/accounting/reports/aging", permission: "view_financial_reports", module: "accounting", enabled: true },
      { id: "aged-receivables", label: "Aged Receivables", href: "/accounting/reports/aging", permission: "view_financial_reports", module: "accounting", enabled: true },
      { id: "collection-tracking", label: "Collection Tracking", href: "/accounting/reports/aging", permission: "view_financial_reports", module: "accounting", enabled: true },
      { id: "customer-payment-history", label: "Customer Payment History", href: "/billing/payments", permission: "view_billing", module: "billing", enabled: true },
      { id: "outstanding-invoices", label: "Outstanding Invoices", href: "/billing/invoices", permission: "view_billing", module: "billing", enabled: true },
    ],
  },
  {
    id: "accounts-payable",
    title: "Accounts Payable (A/P)",
    items: [
      { id: "vendor-balances", label: "Vendor Balances", href: "/accounting/reports/aging", permission: "view_financial_reports", module: "accounting", enabled: true },
      { id: "aged-payables", label: "Aged Payables", href: "/accounting/reports/aging", permission: "view_financial_reports", module: "accounting", enabled: true },
      { id: "outstanding-bills", label: "Outstanding Bills", href: "/billing/bills", permission: "view_billing", module: "billing", enabled: true },
      { id: "vendor-payment-history", label: "Vendor Payment History", href: "/billing/bills", permission: "view_billing", module: "billing", enabled: true },
      { id: "due-payment-monitoring", label: "Due Payment Monitoring", href: "/accounting/reports/aging", permission: "view_financial_reports", module: "accounting", enabled: true },
    ],
  },
  {
    id: "finance-reporting",
    title: "Finance & Reporting",
    items: [
      { id: "profit-loss", label: "Profit & Loss", href: "/accounting/reports/profit-loss", permission: "view_financial_reports", module: "accounting", enabled: true },
      { id: "balance-sheet", label: "Balance Sheet", href: "/accounting/reports/balance-sheet", permission: "view_financial_reports", module: "accounting", enabled: true },
      { id: "trial-balance", label: "Trial Balance", href: "/accounting/reports/trial-balance", permission: "view_financial_reports", module: "accounting", enabled: true },
      { id: "cash-flow-statement", label: "Cash Flow Statement", href: "/accounting/reports/cash-flow", permission: "view_financial_reports", module: "accounting", enabled: true },
      { id: "budget-vs-actual", label: "Budget vs Actual", href: "/accounting/reports/opex-variance", permission: "view_budgets", module: "accounting", enabled: true },
      { id: "management-reports", label: "Management Reports", href: "/accounting/reports/management", permission: "view_financial_reports", module: "accounting", enabled: true },
      { id: "financial-ratios", label: "Financial Ratios", href: "/accounting/reports/margin-analysis", permission: "view_financial_reports", module: "accounting", enabled: true },
      { id: "audit-reports", label: "Audit Reports", href: "/admin/audit-log", permission: "view_audit_logs", module: "dashboard", enabled: true },
    ],
  },
  {
    id: "tax-management",
    title: "Tax Management",
    items: [
      { id: "vat-setup", label: "VAT Setup", href: "/admin/settings?category=tax", permission: "manage_settings", module: "dashboard", enabled: true },
      { id: "vat-returns", label: "VAT Returns", href: "/accounting/reports/tax", permission: "view_financial_reports", module: "accounting", enabled: true },
      { id: "withholding-tax", label: "Withholding Tax", href: "/accounting/reports/tax", permission: "view_financial_reports", module: "accounting", enabled: true },
      { id: "tax-reports", label: "Tax Reports", href: "/accounting/reports/tax", permission: "view_financial_reports", module: "accounting", enabled: true },
      { id: "tax-reconciliation", label: "Tax Reconciliation", href: "/accounting/reports/tax", permission: "view_financial_reports", module: "accounting", enabled: true },
    ],
  },
];

export const DASHBOARD_HUB_COMMAND_ACTIONS: DashboardHubCommandAction[] = [
  {
    id: "hub-create-invoice",
    title: "Create Invoice",
    subtitle: "Open invoice creation",
    url: "/billing/invoices/new",
    permission: "create_invoices",
    module: "billing",
  },
  {
    id: "hub-vendor-centre",
    title: "Vendor Centre",
    subtitle: "Manage suppliers and vendors",
    url: "/inventory/suppliers",
    permission: "view_inventory",
    module: "inventory",
  },
  {
    id: "hub-customer-statements",
    title: "Customer Statements",
    subtitle: "Open customer statements workspace",
    url: "/customers/statements",
    permission: "view_customers",
    module: "customers",
  },
  {
    id: "hub-purchase-order",
    title: "Create Purchase Order",
    subtitle: "Start a new purchase order",
    url: "/inventory/purchase-orders/new",
    permission: "create_purchase_orders",
    module: "inventory",
  },
  {
    id: "hub-vendor-credits",
    title: "Vendor Credits",
    subtitle: "Review vendor credit actions and linked records",
    url: "/billing/vendor-credits",
    permission: "view_billing",
    module: "billing",
  },
  {
    id: "hub-chart-of-accounts",
    title: "Chart of Accounts",
    subtitle: "Review ledger account structure",
    url: "/accounting/accounts",
    permission: "view_accounting",
    module: "accounting",
  },
  {
    id: "hub-asset-transfer",
    title: "Asset Transfer",
    subtitle: "Move assets between branches or assignees",
    url: "/fixed-assets/transfers",
    permission: "edit_assets",
    module: "fixed-assets",
  },
  {
    id: "hub-bank-reconciliation",
    title: "Bank Reconciliation",
    subtitle: "Match bank activity and ledgers",
    url: "/accounting/banking/reconciliation",
    permission: "view_bank_statements",
    module: "accounting",
  },
  {
    id: "hub-payroll",
    title: "Payroll Processing",
    subtitle: "Open payroll workspace",
    url: "/hr/payroll",
    permission: "view_payroll",
    module: "hr",
  },
];
