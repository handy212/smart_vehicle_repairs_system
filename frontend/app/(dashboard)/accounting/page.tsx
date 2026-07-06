"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { endOfYear, format, parseISO, startOfMonth, startOfYear } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  CreditCard,
  FileBarChart2,
  FilePlus2,
  HandCoins,
  Landmark,
  Receipt,
  RefreshCw,
  Scale,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "@/components/ui/chart-container";
import { accountingApi, type AccountingCommandCenterSnapshot } from "@/lib/api/accounting";
import { reportingApi } from "@/lib/api/reporting";
import { branchesApi, type Branch } from "@/lib/api/branches";
import { useAuthStore } from "@/store/authStore";
import { useBranchStore } from "@/store/branchStore";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import { exportToCSV, exportToPDF } from "@/lib/utils/export";
import { cn } from "@/lib/utils";
import {
  buildAgingBuckets,
  getAccountingDashboardAudience,
  toNumber,
  type DashboardAlert,
} from "@/lib/accounting/dashboard";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import type { Branch as StoreBranch } from "@/lib/api/admin";

type RevenueTrendData = {
  summary?: { total_paid?: number };
  revenue_by_period?: Array<{ period: string; revenue: number; invoice_count: number }>;
};

const CHART_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];

const PERFEX_CARD = "rounded-md border border-border bg-card shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)] hover:shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]";
const PERFEX_CARD_INTERACTIVE = `${PERFEX_CARD} transition-colors hover:border-primary/30 hover:bg-muted/20`;
const COMPACT_CARD_HEADER = "border-b border-border/60 px-3 py-2";
const COMPACT_CARD_TITLE = "text-sm font-semibold leading-none";

function toStoreBranch(branch: Branch): StoreBranch {
  return branch as unknown as StoreBranch;
}

function MetricListCard({
  title,
  icon: Icon,
  accent = "text-primary",
  items,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
  items: Array<{ label: string; value: string; tone?: "default" | "positive" | "negative" }>;
}) {
  return (
    <Card className={cn("h-full", PERFEX_CARD)}>
      <CardHeader className={COMPACT_CARD_HEADER}>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span className={cn("flex h-7 w-7 items-center justify-center rounded bg-muted", accent)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <span
              className={cn(
                "text-xs font-semibold",
                item.tone === "positive" && "text-emerald-600",
                item.tone === "negative" && "text-rose-600"
              )}
            >
              {item.value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: DashboardAlert["severity"] }) {
  const styles =
    severity === "critical"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : severity === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-sky-200 bg-sky-50 text-sky-700";

  return <Badge className={cn("border font-medium", styles)}>{severity}</Badge>;
}

function DashboardTooltip({
  active,
  payload,
  label,
  formatCurrency,
}: {
  active?: boolean;
  payload?: Array<{ color?: string; name?: string; value?: number | string }>;
  label?: string;
  formatCurrency: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border bg-background p-3 shadow-sm">
      {label ? <p className="mb-2 text-xs font-medium text-foreground">{label}</p> : null}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={`${entry.name}-${entry.value}`} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="font-medium text-foreground">{formatCurrency(toNumber(entry.value))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleCallout({
  audience,
  selectedBranchLabel,
  approvalCount,
}: {
  audience: "accountant" | "finance_manager" | "branch_manager" | "executive";
  selectedBranchLabel: string;
  approvalCount: number;
}) {
  if (audience === "executive") {
    return null;
  }

  const content = {
    accountant: {
      title: "Accountant Workspace",
      text: "Full accounting operations view with journals, aging, till control, tax position, and reconciliation follow-up.",
    },
    finance_manager: {
      title: "Finance Manager Workspace",
      text: `Full accounting view plus approval pressure points. ${approvalCount} supplier approvals currently need attention.`,
    },
    branch_manager: {
      title: "Branch Manager Workspace",
      text: `Branch-scoped view focused on ${selectedBranchLabel}, cash position, customer balances, supplier commitments, and branch profitability.`,
    },
  }[audience];

  return (
    <div className={cn("rounded-md border border-border bg-card p-3", "shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]")}>
      <div className="text-sm font-semibold text-foreground">{content.title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{content.text}</div>
    </div>
  );
}

export default function AccountingDashboardPage() {
  const user = useAuthStore((state) => state.user);
  const permissions = useMemo(() => user?.permissions ?? [], [user?.permissions]);
  const { formatCurrency } = useCurrency();
  const { success, error: showError } = useToast();
  const { activeBranchId, setBranch, clearBranch } = useBranchStore();

  const today = new Date();
  const [startDate, setStartDate] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(today, "yyyy-MM-dd"));
  const [fiscalYear, setFiscalYear] = useState(String(today.getFullYear()));
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [revenueGranularity, setRevenueGranularity] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");

  const audience = useMemo(
    () => getAccountingDashboardAudience(user?.role, permissions),
    [permissions, user?.role]
  );
  const showBranchComparison = audience === "executive" || audience === "finance_manager";
  const showApprovalsPriority = audience === "finance_manager";
  const showOperationalSections = audience !== "executive";
  const showQuickActions = audience !== "executive";
  const hasDashboardPermission = (permission: string | string[]) => {
    if (user?.role === "super-admin" || user?.role === "admin") return true;
    const allowed = Array.isArray(permission) ? permission : [permission];
    return allowed.some((item) => permissions.includes(item));
  };

  const { data: branchOptions = [] } = useQuery({
    queryKey: ["branches", "accessible", audience],
    queryFn: () => branchesApi.getAccessible(),
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (!activeBranchId && branchOptions.length === 1 && audience !== "executive") {
      setBranch(toStoreBranch(branchOptions[0]));
    }
  }, [activeBranchId, audience, branchOptions, setBranch]);

  const trendRange = useMemo(() => {
    if (revenueGranularity !== "yearly") {
      return { start: startDate, end: endDate, period: revenueGranularity as "daily" | "weekly" | "monthly" };
    }

    const year = Number.parseInt(fiscalYear, 10);
    const fyStart = format(startOfYear(new Date(year, 0, 1)), "yyyy-MM-dd");
    const fyEnd = format(endOfYear(new Date(year, 0, 1)), "yyyy-MM-dd");
    return { start: fyStart, end: fyEnd, period: "monthly" as const };
  }, [endDate, fiscalYear, revenueGranularity, startDate]);

  const dashboardQuery = useQuery<AccountingCommandCenterSnapshot>({
    queryKey: [
      "accounting",
      "dashboard",
      "command-center",
      startDate,
      endDate,
      fiscalYear,
      activeBranchId,
      selectedAccount,
    ],
    queryFn: () =>
      accountingApi.getCommandCenterSnapshot({
        start_date: startDate,
        end_date: endDate,
        fiscal_year: fiscalYear,
        branch_id: activeBranchId ? String(activeBranchId) : "",
        account_id: selectedAccount !== "all" ? selectedAccount : "",
      }),
    staleTime: 60 * 1000,
  });

  const revenueTrendQuery = useQuery<RevenueTrendData>({
    queryKey: ["accounting", "dashboard", "revenue-trend", trendRange.start, trendRange.end, trendRange.period, activeBranchId],
    queryFn: () =>
      reportingApi.revenue({
        start_date: trendRange.start,
        end_date: trendRange.end,
        period: trendRange.period,
      }) as Promise<RevenueTrendData>,
    staleTime: 60 * 1000,
  });
  const isLoading = dashboardQuery.isLoading || revenueTrendQuery.isLoading;

  const branchesLookup = useMemo(() => {
    const map = new Map<number, Branch>();
    for (const branch of branchOptions) map.set(branch.id, branch);
    return map;
  }, [branchOptions]);

  const selectedBranchLabel = activeBranchId ? branchesLookup.get(activeBranchId)?.name ?? "Branch" : "All Branches";
  const snapshot = dashboardQuery.data;

  const assets = toNumber(snapshot?.financial_position.total_assets);
  const liabilities = toNumber(snapshot?.financial_position.total_liabilities);
  const equity = toNumber(snapshot?.financial_position.equity);
  const netProfit = toNumber(snapshot?.financial_position.current_profit_loss);
  const revenue = toNumber(snapshot?.statements.profit_loss.revenue);
  const expenses = toNumber(snapshot?.statements.profit_loss.expenses);
  const cashOnHand = toNumber(snapshot?.cash_position.cash_on_hand);
  const bankBalance = toNumber(snapshot?.cash_position.bank_balance);
  const tillBalance = toNumber(snapshot?.cash_position.till_balances);
  const totalCash = toNumber(snapshot?.cash_position.total_available_cash);
  const arOutstanding = toNumber(snapshot?.working_capital.accounts_receivable);
  const apOutstanding = toNumber(snapshot?.working_capital.accounts_payable);
  const netWorth = toNumber(snapshot?.financial_position.net_worth);
  const inventoryGlValue = toNumber(snapshot?.financial_position.inventory_gl_value);
  const inventoryOperationalValue = toNumber(snapshot?.financial_position.inventory_operational_value);
  const grossProfit = toNumber(snapshot?.revenue_expenses.gross_profit);
  const totalTaxCollected = toNumber(snapshot?.tax.output_vat);
  const taxDue = toNumber(snapshot?.tax.tax_due);
  const revenueTrend = revenueTrendQuery.data?.revenue_by_period ?? snapshot?.revenue_analytics.trend ?? [];
  const topCustomers = snapshot?.revenue_analytics.top_customers ?? [];
  const upcomingPayments = snapshot?.payables.upcoming_payments ?? [];
  const arBuckets = buildAgingBuckets(snapshot?.receivables.aging_buckets);
  const apBuckets = buildAgingBuckets(snapshot?.payables.aging_buckets);
  const topDebtors = snapshot?.receivables.top_debtors ?? [];
  const topCreditors = snapshot?.payables.top_creditors ?? [];
  const bankSnapshot = snapshot?.cash_bank.bank_accounts ?? [];
  const tillAccounts = snapshot?.cash_bank.till_accounts ?? [];
  const openTills = snapshot?.till_management.open_tills ?? [];
  const tillTotals = snapshot?.till_management.totals ?? {
    shortages: 0,
    excesses: 0,
    pay_ins: 0,
    pay_outs: 0,
    cash_receipts: 0,
    cash_refunds: 0,
    net_movement: 0,
    pending_variance_approvals: 0,
  };
  const pendingSupervisorActions = snapshot?.till_management.pending_supervisor_actions ?? [];
  const financialHealth = Object.values(snapshot?.financial_health ?? {});
  const alerts = (snapshot?.alerts ?? []).map((alert, index) => ({ id: `alert-${index}`, ...alert }));
  const criticalAlerts = alerts.filter((alert) => alert.severity === "critical");
  const warningAlerts = alerts.filter((alert) => alert.severity === "warning");
  const infoAlerts = alerts.filter((alert) => alert.severity === "info");
  const monitoringGroups = snapshot?.monitoring ?? [];
  const highPriorityMonitoringCount = monitoringGroups
    .filter((group) => group.severity !== "info")
    .reduce((total, group) => total + group.items.reduce((groupTotal, item) => groupTotal + toNumber(item.count), 0), 0);
  const overdueReceivableAmount = (snapshot?.receivables.overdue_invoices ?? []).reduce(
    (sum, invoice) => sum + toNumber(invoice.amount_due),
    0
  );

  const expenseCategoryChart = useMemo(
    () => (snapshot?.expense_analytics.categories ?? []).map((entry) => ({ name: entry.name, value: toNumber(entry.value) })),
    [snapshot?.expense_analytics.categories]
  );

  const expenseTrend = useMemo(
    () => (snapshot?.expense_analytics.trend ?? []).map((point) => ({ label: format(parseISO(point.date), "MMM d"), expense: toNumber(point.expense) })),
    [snapshot?.expense_analytics.trend]
  );
  const topExpenseCategories = snapshot?.expense_analytics.top_categories ?? [];
  const hasExpenseCategoryData = expenseCategoryChart.some((entry) => entry.value > 0);

  const statementSnapshot = [
    { label: "Revenue", value: toNumber(snapshot?.statements.profit_loss.revenue) },
    { label: "Cost of Sales / Expenses", value: toNumber(snapshot?.statements.profit_loss.expenses) },
    { label: "Gross Profit", value: toNumber(snapshot?.statements.profit_loss.gross_profit) },
    { label: "Net Profit", value: toNumber(snapshot?.statements.profit_loss.net_profit) },
  ];

  const cashFlowSnapshot = [
    { label: "Operating", value: toNumber(snapshot?.statements.cash_flow.operating_cash_flow) },
    { label: "Investing", value: toNumber(snapshot?.statements.cash_flow.investing_cash_flow) },
    { label: "Financing", value: toNumber(snapshot?.statements.cash_flow.financing_cash_flow) },
  ];
  const recentEntries = snapshot?.recent_activity.journal_entries ?? [];

  const quickActions = [
    { label: "New Journal Entry", href: "/accounting/journal-entries/new", icon: FilePlus2, permission: "create_journal_entries" },
    { label: "Customer Payment", href: "/billing/payments", icon: HandCoins, permission: ["create_payments", "process_payments", "manage_billing"] },
    { label: "Supplier Payment", href: "/billing/bills", icon: Receipt, permission: "edit_bills" },
    { label: "Refund", href: "/billing/refunds", icon: CircleDollarSign, permission: ["create_payments", "process_payments", "manage_billing"] },
    { label: "Credit Note", href: "/billing/credit-notes", icon: BadgeDollarSign, permission: ["create_payments", "process_payments", "manage_billing"] },
    { label: "Open Till", href: "/accounting/tills", icon: Wallet, permission: ["manage_billing", "process_payments", "view_accounting"] },
    { label: "Close Till", href: "/accounting/tills", icon: ClipboardCheck, permission: ["manage_billing", "process_payments", "view_accounting"] },
    { label: "Approve Variance", href: "/accounting/tills", icon: CheckCircle2, permission: "manage_billing" },
    { label: "Reconcile Bank", href: "/accounting/banking/reconciliation", icon: Landmark, permission: "reconcile_bank_statements" },
    { label: "Generate Report", href: "/accounting/reports", icon: FileBarChart2, permission: "view_financial_reports" },
  ].filter((action) => hasDashboardPermission(action.permission));

  const handleRefresh = async () => {
    await Promise.all([
      dashboardQuery.refetch(),
      revenueTrendQuery.refetch(),
    ]);
    success("Accounting dashboard refreshed.");
  };

  const handleExportExcel = async () => {
    await exportToCSV(
      alerts.map((alert) => ({
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
      })),
      "accounting_dashboard_alerts",
      [
        { key: "severity", label: "Severity" },
        { key: "title", label: "Alert" },
        { key: "message", label: "Message" },
      ]
    );
    success("Excel export generated.");
  };

  const handleExportPdf = async () => {
    await exportToPDF(
      statementSnapshot.map((row) => ({
        metric: row.label,
        value: formatCurrency(row.value),
      })),
      "accounting_dashboard_snapshot",
      [
        { key: "metric", label: "Metric" },
        { key: "value", label: "Value" },
      ],
      "Accounting Dashboard Snapshot"
    );
    success("PDF export generated.");
  };

  const handleBoardPackExport = async () => {
    try {
      const blob = await accountingApi.exportBoardPack(startDate, endDate);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `board_pack_${endDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      success("Board pack downloaded.");
    } catch {
      showError("Unable to export board pack right now.");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-3 md:p-4">
        <div className="h-10 w-80 animate-pulse rounded bg-muted" />
        <div className="grid gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-36 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="h-72 animate-pulse rounded-md bg-muted" />
          <div className="h-72 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 md:p-4">
      <PageHeader
        className="mb-4 space-y-3"
        title="Accounting Dashboard"
        breadcrumbs={[
          { label: "Accounting", href: "/accounting" },
          { label: "Dashboard" },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel}>
              <FileBarChart2 className="mr-2 h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPdf}>
              <Receipt className="mr-2 h-4 w-4" />
              PDF
            </Button>
            <Button size="sm" onClick={handleBoardPackExport}>
              <FileBarChart2 className="mr-2 h-4 w-4" />
              Board Pack
            </Button>
          </>
        }
      >
        <div className="grid gap-3 rounded-md border border-border bg-card p-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            label="Date Range"
            className="min-w-0"
          />
          <FilterSelect
            label="Branch"
            value={activeBranchId ? String(activeBranchId) : "all"}
            onValueChange={(value) => {
              if (value === "all") {
                clearBranch();
                return;
              }
              const branch = branchOptions.find((item) => String(item.id) === value);
              if (branch) setBranch(toStoreBranch(branch));
            }}
            options={[
              { value: "all", label: "All Branches" },
              ...branchOptions.map((branch) => ({ value: String(branch.id), label: branch.name })),
            ]}
          />
          <FilterSelect
            label="Budget Year"
            value={fiscalYear}
            onValueChange={(value) => {
              setFiscalYear(value);
              const year = Number.parseInt(value, 10);
              setStartDate(format(startOfYear(new Date(year, 0, 1)), "yyyy-MM-dd"));
              setEndDate(
                year === today.getFullYear()
                  ? format(today, "yyyy-MM-dd")
                  : format(endOfYear(new Date(year, 0, 1)), "yyyy-MM-dd")
              );
            }}
            options={[
              { value: String(today.getFullYear()), label: String(today.getFullYear()) },
              { value: String(today.getFullYear() - 1), label: String(today.getFullYear() - 1) },
              { value: String(today.getFullYear() - 2), label: String(today.getFullYear() - 2) },
            ]}
          />
          <FilterSelect
            label="Account"
            value={selectedAccount}
            onValueChange={setSelectedAccount}
            options={[
              { value: "all", label: "All Accounts" },
              ...tillAccounts.map((account) => ({ value: String(account.id), label: account.name })),
            ]}
          />
        </div>
        <RoleCallout
          audience={audience}
          selectedBranchLabel={selectedBranchLabel}
          approvalCount={snapshot?.payables.pending_approvals ?? 0}
        />
      </PageHeader>

      <section className="space-y-3">
        <SectionTitle
          title="Executive KPIs"
          subtitle="Core metrics for position, liquidity, working capital, and profit."
        />
        <div className="grid gap-3 xl:grid-cols-4">
          <MetricListCard
            title="Financial Position"
            icon={Scale}
            accent="text-sky-600"
            items={[
              { label: "Total Assets", value: formatCurrency(assets) },
              { label: "Total Liabilities", value: formatCurrency(liabilities) },
              { label: "Equity", value: formatCurrency(equity) },
              { label: "Current Profit/Loss", value: formatCurrency(netProfit), tone: netProfit >= 0 ? "positive" : "negative" },
              { label: "Net Worth", value: formatCurrency(netWorth), tone: netWorth >= 0 ? "positive" : "negative" },
              { label: "Inventory (GL)", value: formatCurrency(inventoryGlValue) },
              { label: "Inventory (Operational)", value: formatCurrency(inventoryOperationalValue) },
            ]}
          />
          <MetricListCard
            title="Revenue & Expenses"
            icon={BadgeDollarSign}
            accent="text-emerald-600"
            items={[
              { label: "Revenue Today", value: formatCurrency(revenueTrend.at(-1)?.revenue ?? 0) },
              { label: "Revenue This Period", value: formatCurrency(revenue) },
              { label: "Expenses This Period", value: formatCurrency(expenses) },
              { label: "Gross Profit", value: formatCurrency(grossProfit), tone: grossProfit >= 0 ? "positive" : "negative" },
              { label: "Net Profit", value: formatCurrency(netProfit), tone: netProfit >= 0 ? "positive" : "negative" },
            ]}
          />
          <MetricListCard
            title="Cash Position"
            icon={Wallet}
            accent="text-violet-600"
            items={[
              { label: "Cash On Hand", value: formatCurrency(cashOnHand) },
              { label: "Bank Balance", value: formatCurrency(bankBalance) },
              { label: "Till Balances", value: formatCurrency(tillBalance) },
              { label: "Total Available Cash", value: formatCurrency(totalCash), tone: totalCash >= 0 ? "positive" : "negative" },
              { label: "Runway", value: `${toNumber(snapshot?.cash_position.runway_months).toFixed(1)} months` },
            ]}
          />
          <MetricListCard
            title="Working Capital"
            icon={HandCoins}
            accent="text-amber-600"
            items={[
              { label: "Accounts Receivable", value: formatCurrency(arOutstanding) },
              { label: "Accounts Payable", value: formatCurrency(apOutstanding) },
              { label: "Net Working Capital", value: formatCurrency(arOutstanding - apOutstanding), tone: arOutstanding - apOutstanding >= 0 ? "positive" : "negative" },
            ]}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle
          title="Financial Health"
          subtitle="Status across cash, receivables, payables, tills, and controls."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {financialHealth.map((item) => (
            <Link
              key={item.label}
              href={
                item.label.includes("Cash")
                  ? "/accounting/reports/cash-flow"
                  : item.label.includes("Receivable")
                    ? "/accounting/reports/aging"
                    : item.label.includes("Payable")
                      ? "/billing/bills"
                      : item.label.includes("Till")
                        ? "/accounting/tills"
                        : "/accounting/controls"
              }
              className={cn(PERFEX_CARD_INTERACTIVE, "p-3")}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-foreground">{item.label}</span>
                <HealthDot status={item.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{item.message}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle
          title="Revenue Analytics"
          subtitle="Trend, branch mix, service mix, and top customers."
          action={
            <Tabs value={revenueGranularity} onValueChange={(value) => setRevenueGranularity(value as typeof revenueGranularity)}>
              <TabsList className="grid h-9 grid-cols-4">
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="yearly">Yearly</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        />
        <div className={cn("grid gap-3", showBranchComparison ? "xl:grid-cols-[1.6fr_1fr]" : "xl:grid-cols-1")}>
          <Card className={PERFEX_CARD}>
            <CardHeader className={COMPACT_CARD_HEADER}>
              <CardTitle className={COMPACT_CARD_TITLE}>Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent className="h-[260px] p-3 pt-2">
              <ChartContainer className="h-full">
                <AreaChart data={revenueTrend.map((point) => ({
                  label: format(parseISO(point.period), revenueGranularity === "daily" ? "MMM d" : revenueGranularity === "weekly" ? "MMM d" : "MMM yyyy"),
                  revenue: toNumber(point.revenue),
                }))}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(value) => formatCurrency(value)} hide />
                  <Tooltip content={<DashboardTooltip formatCurrency={formatCurrency} />} />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#revenueFill)" strokeWidth={2.5} />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {showBranchComparison ? (
            <Card className={PERFEX_CARD}>
              <CardHeader className={COMPACT_CARD_HEADER}>
                <CardTitle className={COMPACT_CARD_TITLE}>Revenue By Branch</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px] p-3 pt-2">
                <ChartContainer className="h-full">
                  <BarChart data={snapshot?.revenue_analytics.by_branch ?? []} layout="vertical" margin={{ left: 12, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="branch_name" width={100} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip content={<DashboardTooltip formatCurrency={formatCurrency} />} />
                    <Bar dataKey="invoiced" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
          <Card className={PERFEX_CARD}>
            <CardHeader className={COMPACT_CARD_HEADER}>
              <CardTitle className={COMPACT_CARD_TITLE}>Revenue By Service Type</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 p-3 lg:grid-cols-[170px_1fr]">
              <div className="h-[160px] min-w-0">
                <ChartContainer className="h-full">
                  <PieChart>
                    <Pie
                      data={(snapshot?.revenue_analytics.by_service_type ?? []).map((entry) => ({
                        name: entry.label,
                        value: toNumber(entry.collected),
                      }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={36}
                      outerRadius={66}
                      paddingAngle={2}
                    >
                      {(snapshot?.revenue_analytics.by_service_type ?? []).map((entry, index) => (
                        <Cell key={entry.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<DashboardTooltip formatCurrency={formatCurrency} />} />
                  </PieChart>
                </ChartContainer>
              </div>
              <div className="space-y-3">
                {(snapshot?.revenue_analytics.by_service_type ?? []).map((entry, index) => (
                  <div key={entry.label} className="flex items-center justify-between rounded border border-border/60 p-2">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                      <span className="text-xs text-foreground">{entry.label}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold">{formatCurrency(toNumber(entry.collected))}</div>
                      <div className="text-xs text-muted-foreground">Invoiced {formatCurrency(toNumber(entry.invoiced))}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className={PERFEX_CARD}>
            <CardHeader className={COMPACT_CARD_HEADER}>
              <CardTitle className={COMPACT_CARD_TITLE}>Top Customers By Revenue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-3">
              {topCustomers.map((customer, index) => (
                <div key={customer.customer} className="flex items-center justify-between rounded border border-border/60 p-2">
                  <div>
                    <div className="text-xs font-medium text-foreground">{index + 1}. {customer.customer}</div>
                    <div className="text-xs text-muted-foreground">
                      {customer.invoice_count} invoices • Last invoice {customer.last_invoice_date ? format(parseISO(customer.last_invoice_date), "MMM d, yyyy") : "N/A"}
                    </div>
                  </div>
                  <div className="text-xs font-semibold">{formatCurrency(customer.revenue)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid items-start gap-3 xl:grid-cols-[3fr_1fr]">
        <div className="space-y-3">
          <Card className={PERFEX_CARD}>
            <CardHeader className={COMPACT_CARD_HEADER}>
              <CardTitle className={COMPACT_CARD_TITLE}>Expense Analytics</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 p-3 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="h-[250px] min-w-0">
                <ChartContainer className="h-full">
                  <AreaChart data={expenseTrend}>
                    <defs>
                      <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis hide />
                    <Tooltip content={<DashboardTooltip formatCurrency={formatCurrency} />} />
                    <Area type="monotone" dataKey="expense" stroke="#ef4444" fill="url(#expenseFill)" strokeWidth={2.25} />
                  </AreaChart>
                </ChartContainer>
              </div>
              <div className="space-y-3">
                {hasExpenseCategoryData ? (
                  <>
                    <div className="h-[130px] min-w-0">
                      <ChartContainer className="h-full">
                        <PieChart>
                          <Pie data={expenseCategoryChart} dataKey="value" nameKey="name" innerRadius={34} outerRadius={60}>
                            {expenseCategoryChart.map((entry, index) => (
                              <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<DashboardTooltip formatCurrency={formatCurrency} />} />
                        </PieChart>
                      </ChartContainer>
                    </div>
                    <div className="space-y-2">
                      {topExpenseCategories.slice(0, 5).map((expense) => (
                        <div key={expense.name} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{expense.name}</span>
                          <span className="font-medium text-foreground">{formatCurrency(toNumber(expense.amount))}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="rounded border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                    No expense categories to show.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={PERFEX_CARD}>
            <CardHeader className={COMPACT_CARD_HEADER}>
              <div className="flex items-center justify-between">
                <CardTitle className={COMPACT_CARD_TITLE}>Top Debtors</CardTitle>
                <Link className="text-xs text-primary hover:underline" href="/accounting/reports/aging">
                  View invoices
                </Link>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
              {topDebtors.length === 0 ? (
                <div className="rounded border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                  No debtor balances for this period.
                </div>
              ) : (
                topDebtors.slice(0, 5).map((debtor) => (
                  <div key={debtor.id} className="rounded border border-border/60 p-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-foreground">{debtor.entity}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {debtor.number} • Due {debtor.due_date ? format(parseISO(debtor.due_date), "MMM d, yyyy") : "N/A"}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs font-semibold text-foreground">{formatCurrency(toNumber(debtor.amount))}</div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className={PERFEX_CARD}>
            <CardHeader className={COMPACT_CARD_HEADER}>
              <CardTitle className={COMPACT_CARD_TITLE}>Accounts Receivable</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <CompactStat title="Total Outstanding" value={formatCurrency(arOutstanding)} icon={HandCoins} />
                <CompactStat
                  title="Overdue Amount"
                  value={formatCurrency(overdueReceivableAmount)}
                  description={`${snapshot?.receivables.overdue_invoices.length ?? 0} invoices`}
                  icon={ShieldAlert}
                />
              </div>
              <AgingBars buckets={arBuckets} formatCurrency={formatCurrency} />
              <Link className="inline-flex text-xs text-primary hover:underline" href="/accounting/reports/aging">
                View aging report
              </Link>
            </CardContent>
          </Card>

        </div>
      </section>

      {showOperationalSections ? (
      <section className="grid gap-3 xl:grid-cols-[1fr_1fr]">
        <Card className={PERFEX_CARD}>
          <CardHeader className={COMPACT_CARD_HEADER}>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className={COMPACT_CARD_TITLE}>Accounts Payable</CardTitle>
              <div className="flex items-center gap-3">
                <Link className="text-xs text-primary hover:underline" href="/accounting/reports/aging?type=payables">
                  AP aging
                </Link>
                <Link className="text-xs text-primary hover:underline" href="/billing/bills">
                  Supplier bills
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <CompactStat title="Total Outstanding" value={formatCurrency(apOutstanding)} icon={Receipt} />
              <CompactStat
                title="Due This Week"
                value={formatCurrency(toNumber(snapshot?.payables.summary?.due_this_week))}
                description={`${snapshot?.payables.summary?.due_this_week_count ?? 0} bills`}
                icon={Clock3}
              />
              <CompactStat
                title="Due This Month"
                value={formatCurrency(toNumber(snapshot?.payables.summary?.due_this_month))}
                description={`${snapshot?.payables.summary?.due_this_month_count ?? 0} bills`}
                icon={Calendar}
              />
              <CompactStat
                title="Overdue Bills"
                value={formatCurrency(toNumber(snapshot?.payables.summary?.overdue_bills))}
                description={`${snapshot?.payables.summary?.overdue_bills_count ?? 0} bills`}
                icon={ShieldAlert}
              />
            </div>
            <AgingBars buckets={apBuckets} formatCurrency={formatCurrency} />
            {showApprovalsPriority ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                {snapshot?.payables.pending_approvals ?? 0} supplier bill approvals are pending review.
              </div>
            ) : null}
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold">Top Creditors</h3>
                <Link className="text-xs text-primary hover:underline" href="/billing/bills">
                  View bills
                </Link>
              </div>
              {topCreditors.map((creditor) => (
                <div key={creditor.supplier_id} className="flex items-center justify-between rounded border border-border/60 p-2">
                  <div>
                    <div className="text-xs font-medium text-foreground">{creditor.supplier_name}</div>
                    <div className="text-xs text-muted-foreground">
                      Due {creditor.expected_payment_date ? format(parseISO(creditor.expected_payment_date), "MMM d, yyyy") : "To be scheduled"}
                    </div>
                  </div>
                  <div className="text-xs font-semibold">{formatCurrency(toNumber(creditor.amount_due))}</div>
                </div>
              ))}
            </div>
            <Separator />
            <div className="grid gap-3 sm:grid-cols-3">
              {upcomingPayments.map((window) => (
                <CompactStat
                  key={window.days}
                  title={`Due in ${window.label}`}
                  value={formatCurrency(window.amount)}
                  description={`${window.count} bills`}
                  icon={Clock3}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className={PERFEX_CARD}>
          <CardHeader className={COMPACT_CARD_HEADER}>
            <CardTitle className={COMPACT_CARD_TITLE}>Cash & Bank Dashboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-3">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold">Till-Enabled Accounts</h3>
                <Link className="text-xs text-primary hover:underline" href="/accounting/tills">
                  Open till status
                </Link>
              </div>
              {tillAccounts.map((account) => {
                return (
                  <Link
                    key={account.id}
                    href={account.href ?? `/accounting/reports/general-ledger?account_id=${account.id}`}
                    className="block rounded border border-border/60 p-2 transition-colors hover:border-primary/50 hover:bg-muted/30"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium">{account.name}</div>
                        <div className="text-xs text-muted-foreground">
                          GL {formatCurrency(toNumber(account.balance))} • {account.open_till_status} till
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Last closure{" "}
                          {account.last_till_closure
                            ? format(parseISO(account.last_till_closure), "MMM d, h:mm a")
                            : "Pending"}{" "}
                          • Reconciliation{" "}
                          {account.last_reconciliation
                            ? format(parseISO(account.last_reconciliation), "MMM d, h:mm a")
                            : "Pending"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-semibold">{formatCurrency(toNumber(account.balance))}</div>
                        <div
                          className={cn(
                            "text-xs",
                            account.variance_status === "Balanced" ? "text-emerald-600" : "text-amber-600"
                          )}
                        >
                          {account.variance_status ?? "Variance pending"}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold">Bank Accounts</h3>
                <Link className="text-xs text-primary hover:underline" href="/accounting/banking/reconciliation">
                  Reconcile accounts
                </Link>
              </div>
              {bankSnapshot.map((account) => (
                <Link
                  key={account.id}
                  href={account.href ?? `/accounting/banking/reconciliation?account_id=${account.id}`}
                  className="block rounded border border-border/60 p-2 transition-colors hover:border-primary/50 hover:bg-muted/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium">{account.bank_name ?? account.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {account.account_name ?? account.name} • {account.unreconciled_transactions} unreconciled
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Last reconciliation{" "}
                        {account.last_reconciliation_date
                          ? format(parseISO(account.last_reconciliation_date), "MMM d, yyyy")
                          : "Pending"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold">{formatCurrency(toNumber(account.ledger_balance ?? account.balance))}</div>
                      <div className="text-xs text-muted-foreground">
                        Reconciled {formatCurrency(account.reconciled_balance)}
                      </div>
                      <div className={cn("text-xs", toNumber(account.difference) === 0 ? "text-emerald-600" : "text-amber-600")}>
                        Difference {formatCurrency(toNumber(account.difference))}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
      ) : null}

      {showOperationalSections ? (
      <section className="grid gap-3 xl:grid-cols-[1fr_0.95fr]">
        <Card className={PERFEX_CARD}>
          <CardHeader className={COMPACT_CARD_HEADER}>
            <CardTitle className={COMPACT_CARD_TITLE}>Till Management Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <CompactStat title="Open Tills" value={String(tillTotals.open_tills ?? openTills.length)} icon={Wallet} />
              <CompactStat title="Closed Today" value={String(tillTotals.closed_tills_today ?? 0)} icon={ClipboardCheck} />
              <CompactStat title="Pending Closures" value={String(tillTotals.pending_closures ?? openTills.length)} icon={Clock3} />
              <CompactStat title="Shortages" value={formatCurrency(toNumber(tillTotals.shortages))} icon={AlertTriangle} />
              <CompactStat title="Excesses" value={formatCurrency(toNumber(tillTotals.excesses))} icon={CheckCircle2} />
            </div>
            <div className="rounded-md border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Till Account</TableHead>
                    <TableHead>Open Duration</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openTills.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">No open tills.</TableCell>
                    </TableRow>
                  ) : (
                    openTills.map((till) => (
                      <TableRow key={till.id}>
                        <TableCell>
                          <Link href={till.href ?? `/accounting/tills/${till.id}`} className="font-medium text-primary hover:underline">
                            {till.user}
                          </Link>
                        </TableCell>
                        <TableCell>{till.branch}</TableCell>
                        <TableCell>{till.till_account || "-"}</TableCell>
                        <TableCell>{till.open_duration || "-"}</TableCell>
                        <TableCell className="text-right">{formatCurrency(toNumber(till.opening_balance))}</TableCell>
                        <TableCell className="text-right">{formatCurrency(toNumber(till.current_balance))}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <CompactStat title="Pay-ins" value={formatCurrency(toNumber(tillTotals.pay_ins))} icon={ArrowRight} />
              <CompactStat title="Pay-outs" value={formatCurrency(toNumber(tillTotals.pay_outs))} icon={ArrowRight} />
              <CompactStat title="Cash Receipts" value={formatCurrency(toNumber(tillTotals.cash_receipts))} icon={CircleDollarSign} />
              <CompactStat title="Cash Refunds" value={formatCurrency(toNumber(tillTotals.cash_refunds))} icon={CreditCard} />
              <CompactStat title="Net Movement" value={formatCurrency(toNumber(tillTotals.net_movement))} icon={Scale} />
              <CompactStat title="Pending Approvals" value={String(tillTotals.pending_variance_approvals)} icon={ClipboardCheck} />
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold">Pending Supervisor Actions</h3>
                <Link href="/accounting/tills" className="text-xs text-primary hover:underline">
                  Review variances
                </Link>
              </div>
              {pendingSupervisorActions.length === 0 ? (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
                  No supervisor variance actions pending.
                </div>
              ) : (
                pendingSupervisorActions.map((action) => (
                  <div key={action.id} className="rounded border border-border/60 p-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium text-foreground">{action.till_account || `Till #${action.id}`}</div>
                        <div className="text-xs text-muted-foreground">
                          {action.user} • {action.branch} • {action.closed_at ? format(parseISO(action.closed_at), "MMM d, h:mm a") : "Closed"}
                        </div>
                        {action.reason ? <div className="mt-1 text-xs text-muted-foreground">{action.reason}</div> : null}
                      </div>
                      <div className="text-right">
                        <div className={cn("text-xs font-semibold", toNumber(action.variance) < 0 ? "text-rose-600" : "text-emerald-600")}>
                          {formatCurrency(toNumber(action.variance))}
                        </div>
                        <div className="mt-2 flex justify-end gap-2">
                          <Link href={action.href ?? `/accounting/tills/${action.id}`} className="text-xs font-medium text-primary hover:underline">
                            Review
                          </Link>
                          {hasDashboardPermission("manage_billing") ? (
                            <>
                              <Link href={action.approve_href ?? `/accounting/tills/${action.id}`} className="text-xs font-medium text-emerald-700 hover:underline">
                                Approve
                              </Link>
                              <Link href={action.href ?? `/accounting/tills/${action.id}`} className="text-xs font-medium text-rose-700 hover:underline">
                                Reject
                              </Link>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className={PERFEX_CARD}>
          <CardHeader className={COMPACT_CARD_HEADER}>
            <CardTitle className={COMPACT_CARD_TITLE}>Tax Dashboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <CompactStat title="VAT Collected" value={formatCurrency(toNumber(snapshot?.tax.vat_collected))} icon={Calculator} />
              <CompactStat title="VAT Payable" value={formatCurrency(toNumber(snapshot?.tax.vat_payable))} icon={Calculator} />
              <CompactStat title="Input VAT" value={formatCurrency(toNumber(snapshot?.tax.input_vat))} icon={Calculator} />
              <CompactStat title="Output VAT" value={formatCurrency(totalTaxCollected)} icon={Calculator} />
              <CompactStat title="Tax Due" value={formatCurrency(taxDue)} icon={ShieldAlert} description="Net liability" />
              <CompactStat title="Tax Credit" value={formatCurrency(toNumber(snapshot?.tax.tax_credit))} icon={CheckCircle2} />
              <CompactStat title="Net Tax Position" value={formatCurrency(toNumber(snapshot?.tax.net_tax_position))} icon={Scale} />
            </div>
            <div className="rounded border border-border/60 p-2">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold">Upcoming Filing Deadlines</h3>
                <Link href="/accounting/reports/tax" className="text-xs text-primary hover:underline">
                  View tax report
                </Link>
              </div>
              <div className="space-y-2">
                {(snapshot?.tax.deadlines ?? []).map((deadline) => (
                  <DeadlineItem
                    key={`${deadline.label}-${deadline.due_date}`}
                    label={`${deadline.tax_type ?? "Tax"} • ${deadline.label}`}
                    dueDate={format(parseISO(deadline.filing_date ?? deadline.due_date), "MMM d, yyyy")}
                    daysRemaining={deadline.days_remaining}
                    severity={deadline.severity}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
      ) : null}

      <section className="grid gap-3 xl:grid-cols-[minmax(0,3.8fr)_minmax(280px,0.9fr)]">
        <Card className={PERFEX_CARD}>
          <CardHeader className={COMPACT_CARD_HEADER}>
            <CardTitle className={COMPACT_CARD_TITLE}>Financial Statements Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,0.95fr)]">
            <SnapshotCard title="Profit & Loss" actionHref="/accounting/reports/profit-loss">
              {statementSnapshot.map((item) => (
                <SnapshotRow
                  key={item.label}
                  label={item.label}
                  value={formatCurrency(item.value)}
                  trend={
                    item.label === "Revenue"
                      ? snapshot?.statements.profit_loss.trend?.revenue
                      : item.label === "Gross Profit"
                        ? snapshot?.statements.profit_loss.trend?.gross_profit
                        : item.label === "Net Profit"
                          ? snapshot?.statements.profit_loss.trend?.net_profit
                          : undefined
                  }
                />
              ))}
            </SnapshotCard>
            <SnapshotCard title="Balance Sheet" actionHref="/accounting/reports/balance-sheet">
              <SnapshotRow label="Assets" value={formatCurrency(assets)} trend={snapshot?.statements.balance_sheet.trend?.assets} />
              <SnapshotRow label="Liabilities" value={formatCurrency(liabilities)} trend={snapshot?.statements.balance_sheet.trend?.liabilities} />
              <SnapshotRow label="Equity" value={formatCurrency(equity)} trend={snapshot?.statements.balance_sheet.trend?.equity} />
            </SnapshotCard>
            <SnapshotCard title="Cash Flow" actionHref="/accounting/reports/cash-flow">
              {cashFlowSnapshot.map((item) => (
                <SnapshotRow
                  key={item.label}
                  label={item.label}
                  value={formatCurrency(item.value)}
                  trend={
                    item.label === "Operating"
                      ? snapshot?.statements.cash_flow.trend?.operating_cash_flow
                      : item.label === "Investing"
                        ? snapshot?.statements.cash_flow.trend?.investing_cash_flow
                        : snapshot?.statements.cash_flow.trend?.financing_cash_flow
                  }
                />
              ))}
              <SnapshotRow label="Closing Cash" value={formatCurrency(toNumber(snapshot?.statements.cash_flow.closing_balance))} />
            </SnapshotCard>
          </CardContent>
        </Card>

        <Card className={cn(PERFEX_CARD, "xl:max-w-[360px]")}>
          <CardHeader className={COMPACT_CARD_HEADER}>
            <CardTitle className={COMPACT_CARD_TITLE}>{showApprovalsPriority ? "Monitoring Center & Approvals" : "Monitoring Center"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3">
            {showApprovalsPriority ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                {snapshot?.payables.pending_approvals ?? 0} supplier bill approvals are pending review.
              </div>
            ) : null}
            {monitoringGroups.length > 0 ? (
              <>
                {highPriorityMonitoringCount === 0 ? (
                  <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
                    No high-priority exceptions at the moment.
                  </div>
                ) : null}
                {monitoringGroups.map((group) => (
                  <MonitoringGroup key={group.id} group={group} formatCurrency={formatCurrency} />
                ))}
              </>
            ) : alerts.length === 0 ? (
              <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
                No high-priority exceptions at the moment.
              </div>
            ) : (
              <>
                <AlertGroup title="Critical" alerts={criticalAlerts} />
                <AlertGroup title="Warning" alerts={warningAlerts} />
                <AlertGroup title="Information" alerts={infoAlerts} />
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {showQuickActions ? (
      <section className="grid gap-3 xl:grid-cols-[1fr_0.95fr]">
        <Card className={PERFEX_CARD}>
          <CardHeader className={COMPACT_CARD_HEADER}>
            <CardTitle className={COMPACT_CARD_TITLE}>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="flex min-h-12 items-center justify-between rounded border border-border/60 p-2 transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded bg-muted text-primary">
                    <action.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-xs font-medium text-foreground">{action.label}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className={PERFEX_CARD}>
          <CardHeader className={COMPACT_CARD_HEADER}>
            <CardTitle className={COMPACT_CARD_TITLE}>Recent Finance Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3">
            {recentEntries.slice(0, 6).map((entry) => (
              <Link
                key={entry.id}
                href={`/accounting/journal-entries/${entry.id}`}
                className="block rounded border border-border/60 p-2 transition-colors hover:border-primary/40 hover:bg-muted/30"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-foreground">{entry.reference || `Journal #${entry.id}`}</div>
                    <div className="text-xs text-muted-foreground">{entry.description}</div>
                  </div>
                  <Badge variant={entry.posted ? "outline" : "secondary"}>{entry.posted ? "Posted" : "Draft"}</Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {entry.date ? format(parseISO(entry.date), "MMM d, yyyy") : "No date"}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
      ) : (
      <section>
        <Card className={PERFEX_CARD}>
          <CardHeader className={COMPACT_CARD_HEADER}>
            <CardTitle className={COMPACT_CARD_TITLE}>Recent Finance Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3">
            {recentEntries.slice(0, 8).map((entry) => (
              <Link
                key={entry.id}
                href={`/accounting/journal-entries/${entry.id}`}
                className="block rounded border border-border/60 p-2 transition-colors hover:border-primary/40 hover:bg-muted/30"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-foreground">{entry.reference || `Journal #${entry.id}`}</div>
                    <div className="text-xs text-muted-foreground">{entry.description}</div>
                  </div>
                  <Badge variant={entry.posted ? "outline" : "secondary"}>{entry.posted ? "Posted" : "Draft"}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-foreground">{label}</div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CompactStat({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded border border-border/60 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[10px] font-medium uppercase text-muted-foreground">{title}</div>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
      {description ? <div className="text-[11px] text-muted-foreground">{description}</div> : null}
    </div>
  );
}

function AgingBars({
  buckets,
  formatCurrency,
}: {
  buckets: Array<{ key: string; label: string; value: number }>;
  formatCurrency: (value: number) => string;
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);

  return (
    <div className="space-y-2">
      {buckets.map((bucket, index) => {
        const width = total > 0 ? `${(bucket.value / total) * 100}%` : "0%";
        return (
          <div key={bucket.key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{bucket.label}</span>
              <span className="font-medium text-foreground">{formatCurrency(bucket.value)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full"
                style={{ width, backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HealthDot({ status }: { status: "healthy" | "warning" | "critical" }) {
  const className =
    status === "healthy"
      ? "bg-emerald-500"
      : status === "warning"
        ? "bg-amber-500"
        : "bg-rose-500";

  return <span className={cn("h-2.5 w-2.5 rounded-full", className)} />;
}

function TrendBadge({ trend }: { trend?: "up" | "down" | "stable" }) {
  if (!trend) return null;

  const className =
    trend === "up"
      ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300"
      : trend === "down"
        ? "border-rose-400/60 bg-rose-500/15 text-rose-300"
        : "border-slate-300/60 bg-slate-500/15 text-slate-200";

  return (
    <Badge variant="outline" className={cn("ml-2 h-5 px-1.5 text-[10px] font-semibold capitalize", className)}>
      {trend}
    </Badge>
  );
}

function AlertGroup({
  title,
  alerts,
}: {
  title: string;
  alerts: Array<DashboardAlert & { id: string }>;
}) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {alerts.map((alert) => (
        <div key={alert.id} className="rounded border border-border/60 p-2">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <div className="text-xs font-medium text-foreground">{alert.title}</div>
            <SeverityBadge severity={alert.severity} />
          </div>
          <div className="text-xs text-muted-foreground">{alert.message}</div>
          {alert.href ? (
            <Link href={alert.href} className="mt-1.5 inline-flex items-center text-xs text-primary hover:underline">
              Open action <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MonitoringGroup({
  group,
  formatCurrency,
}: {
  group: NonNullable<AccountingCommandCenterSnapshot["monitoring"]>[number];
  formatCurrency: (value: number) => string;
}) {
  const visibleItems = group.items.filter((item) => toNumber(item.count) > 0 || toNumber(item.amount) > 0);
  if (visibleItems.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</div>
        <SeverityBadge severity={group.severity} />
      </div>
      <div className="space-y-1.5">
        {visibleItems.map((item) => {
          const content = (
            <div className="flex items-center justify-between gap-3 rounded border border-border/60 p-2 transition-colors hover:border-primary/40 hover:bg-muted/30">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-foreground">{item.label}</div>
                {typeof item.amount === "number" && toNumber(item.amount) !== 0 ? (
                  <div className="text-[11px] text-muted-foreground">{formatCurrency(toNumber(item.amount))}</div>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold text-foreground">
                  {toNumber(item.count)}
                </span>
                {item.href ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : null}
              </div>
            </div>
          );

          return item.href ? (
            <Link key={item.id} href={item.href} className="block">
              {content}
            </Link>
          ) : (
            <div key={item.id}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}

function DeadlineItem({
  label,
  dueDate,
  daysRemaining,
  severity = "info",
}: {
  label: string;
  dueDate: string;
  daysRemaining?: number;
  severity?: "critical" | "warning" | "info";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-border/60 p-2">
      <div>
        <div className="text-xs text-foreground">{label}</div>
        {typeof daysRemaining === "number" ? (
          <div className="text-xs text-muted-foreground">{daysRemaining} days remaining</div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <SeverityBadge severity={severity} />
        <span className="text-xs font-medium text-muted-foreground">{dueDate}</span>
      </div>
    </div>
  );
}

function SnapshotCard({
  title,
  actionHref,
  children,
}: {
  title: string;
  actionHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border/60 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Link href={actionHref} className="text-xs text-primary hover:underline">
          View Full Report
        </Link>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function SnapshotRow({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: "up" | "down" | "stable";
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center font-medium text-foreground">
        {value}
        <TrendBadge trend={trend} />
      </span>
    </div>
  );
}
