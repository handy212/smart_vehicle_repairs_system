import { addDays, isAfter, parseISO } from "date-fns";
import type { Bill, Invoice } from "@/lib/api/billing";

export type AccountingDashboardAudience =
  | "accountant"
  | "finance_manager"
  | "branch_manager"
  | "executive";

export type DashboardSeverity = "critical" | "warning" | "info";

export type DashboardAlert = {
  id: string;
  severity: DashboardSeverity;
  title: string;
  message: string;
  href?: string;
};

export function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function getAccountingDashboardAudience(
  role?: string,
  permissions: string[] = []
): AccountingDashboardAudience {
  if (role === "accountant") return "accountant";
  if (role === "manager") return "branch_manager";
  if (role === "super-admin" || role === "admin") return "executive";
  if (permissions.includes("manage_accounting_periods") || permissions.includes("manage_billing")) {
    return "finance_manager";
  }
  return "accountant";
}

export function buildTopCustomerRevenue(invoices: Invoice[], limit = 5) {
  const byCustomer = new Map<
    string,
    {
      customer: string;
      revenue: number;
      invoiceCount: number;
      lastInvoiceDate?: string;
    }
  >();

  for (const invoice of invoices) {
    const customer = invoice.customer_name || `Customer #${invoice.customer}`;
    const existing = byCustomer.get(customer) ?? {
      customer,
      revenue: 0,
      invoiceCount: 0,
      lastInvoiceDate: invoice.invoice_date,
    };

    existing.revenue += toNumber(invoice.total);
    existing.invoiceCount += 1;
    if (!existing.lastInvoiceDate || invoice.invoice_date > existing.lastInvoiceDate) {
      existing.lastInvoiceDate = invoice.invoice_date;
    }

    byCustomer.set(customer, existing);
  }

  return [...byCustomer.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function buildUpcomingBills(
  bills: Bill[],
  asOfDate: string,
  windowDays = [7, 14, 30]
) {
  const asOf = parseISO(asOfDate);
  const windows = windowDays.map((days) => ({
    days,
    label: `${days} Days`,
    amount: 0,
    count: 0,
  }));

  for (const bill of bills) {
    if (!bill.due_date) continue;
    const dueDate = parseISO(bill.due_date);
    if (isAfter(asOf, dueDate)) continue;

    for (const window of windows) {
      if (!isAfter(dueDate, addDays(asOf, window.days))) {
        window.amount += toNumber(bill.amount_due);
        window.count += 1;
      }
    }
  }

  return windows;
}

export function buildAgingBuckets(summary?: Record<string, unknown>) {
  return [
    { key: "current", label: "Current", value: toNumber(summary?.current) },
    { key: "1-30", label: "30 Days", value: toNumber(summary?.["1-30"]) },
    { key: "31-60", label: "60 Days", value: toNumber(summary?.["31-60"]) },
    { key: "61-90", label: "90 Days", value: toNumber(summary?.["61-90"]) },
    { key: "90+", label: "120+ Days", value: toNumber(summary?.["90+"]) },
  ];
}

export function buildDashboardAlerts(args: {
  negativeCashAccounts?: Array<{ name: string; balance: number }>;
  overdueInvoiceCount?: number;
  overdueInvoiceAmount?: number;
  pendingBillApprovals?: number;
  taxDue?: number;
  tillShortage?: number;
  unreconciledBankAccounts?: number;
  booksBalanced?: boolean;
}) {
  const alerts: DashboardAlert[] = [];

  if ((args.negativeCashAccounts?.length ?? 0) > 0) {
    alerts.push({
      id: "negative-cash",
      severity: "critical",
      title: "Negative cash balance",
      message: `${args.negativeCashAccounts?.[0]?.name ?? "A cash account"} is below zero and needs immediate review.`,
      href: "/accounting/reports/balance-sheet",
    });
  }

  if ((args.tillShortage ?? 0) > 0) {
    alerts.push({
      id: "till-shortage",
      severity: "critical",
      title: "Till shortage detected",
      message: `Till reconciliation is showing shortages that need supervisor approval.`,
      href: "/accounting/tills",
    });
  }

  if ((args.overdueInvoiceCount ?? 0) > 0) {
    alerts.push({
      id: "overdue-invoices",
      severity: "warning",
      title: "Overdue receivables",
      message: `${args.overdueInvoiceCount} invoices are overdue and collections should be followed up.`,
      href: "/accounting/reports/aging",
    });
  }

  if ((args.pendingBillApprovals ?? 0) > 0) {
    alerts.push({
      id: "bill-approvals",
      severity: "warning",
      title: "Supplier bills pending approval",
      message: `${args.pendingBillApprovals} supplier bills are waiting for approval.`,
      href: "/billing/bills",
    });
  }

  if ((args.taxDue ?? 0) > 0) {
    alerts.push({
      id: "tax-due",
      severity: "warning",
      title: "Tax payable outstanding",
      message: `Net VAT liability is due based on the current reporting window.`,
      href: "/accounting/reports/tax",
    });
  }

  if ((args.unreconciledBankAccounts ?? 0) > 0) {
    alerts.push({
      id: "bank-recon",
      severity: "info",
      title: "Bank reconciliation backlog",
      message: `${args.unreconciledBankAccounts} bank accounts still have unreconciled statements.`,
      href: "/accounting/banking/reconciliation",
    });
  }

  if (args.booksBalanced === false) {
    alerts.push({
      id: "imbalanced-books",
      severity: "critical",
      title: "Unbalanced books",
      message: `Trial balance is out of balance and needs accounting review.`,
      href: "/accounting/reports/trial-balance",
    });
  }

  return alerts;
}
