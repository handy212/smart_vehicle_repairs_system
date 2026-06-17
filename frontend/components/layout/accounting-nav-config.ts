import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Hash,
  Zap,
  Landmark,
  Repeat,
  Banknote,
  Wallet,
  PieChart,
  Shield,
  Scale,
} from "lucide-react";

export interface AccountingNavItem {
  name: string;
  href: string;
  permission?: string;
  permissions?: string[];
  icon?: LucideIcon;
  description?: string;
}

export interface AccountingNavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: AccountingNavItem[];
}

/** Accounting module navigation — grouped for collapsible sub-nav. */
export const ACCOUNTING_NAV_GROUPS: AccountingNavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    icon: BarChart3,
    items: [
      {
        name: "Overview",
        href: "/accounting",
        permission: "view_accounting",
        icon: BarChart3,
        description: "KPIs, alerts, and shortcuts",
      },
    ],
  },
  {
    id: "ledger",
    label: "Ledger",
    icon: BookOpen,
    items: [
      {
        name: "Journal Entries",
        href: "/accounting/journal-entries",
        permission: "view_journal_entries",
        icon: BookOpen,
        description: "Manual entries, reversals, and audit trail",
      },
      {
        name: "Chart of Accounts",
        href: "/accounting/accounts",
        permission: "view_accounting",
        icon: Hash,
        description: "Account structure and balances",
      },
      {
        name: "Accruals",
        href: "/accounting/accruals",
        permission: "view_accounting",
        icon: Zap,
        description: "Accrued expenses and deferrals",
      },
    ],
  },
  {
    id: "banking",
    label: "Banking",
    icon: Landmark,
    items: [
      {
        name: "Bank Reconciliation",
        href: "/accounting/banking/reconciliation",
        permission: "view_bank_statements",
        icon: Landmark,
        description: "Statements, matching, and reconciliation",
      },
      {
        name: "Fund Transfers",
        href: "/accounting/transfers",
        permission: "view_transfer_requests",
        icon: Repeat,
        description: "Inter-account and branch transfers",
      },
      {
        name: "Till Management",
        href: "/accounting/tills",
        permission: "view_accounting",
        icon: Banknote,
        description: "Open, close, and reconcile cash tills",
      },
    ],
  },
  {
    id: "planning",
    label: "Planning",
    icon: Wallet,
    items: [
      {
        name: "Budgets",
        href: "/accounting/budgets",
        permission: "view_budgets",
        icon: Wallet,
        description: "Budget lines and variance tracking",
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: PieChart,
    items: [
      {
        name: "Financial Reports",
        href: "/accounting/reports",
        permission: "view_financial_reports",
        icon: PieChart,
        description: "P&L, balance sheet, aging, and more",
      },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    icon: Shield,
    items: [
      {
        name: "Controls & Compliance",
        href: "/accounting/controls",
        permission: "manage_accounting_periods",
        icon: Shield,
        description: "Control accounts, period lock, and close",
      },
      {
        name: "Subledger Integrity",
        href: "/accounting/integrity",
        permission: "view_financial_reports",
        icon: Scale,
        description: "GL vs operational AR/AP reconciliation",
      },
    ],
  },
];

/** Flat list for backwards compatibility (e.g. command palette). */
export const ACCOUNTING_NAV_ITEMS: AccountingNavItem[] = ACCOUNTING_NAV_GROUPS.flatMap(
  (group) => group.items
);

export function getAccountingActiveItem(pathname: string | null): AccountingNavItem | null {
  if (!pathname) return null;

  const matches = ACCOUNTING_NAV_ITEMS.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  if (matches.length === 0) return null;

  return matches.reduce((prev, curr) => (curr.href.length > prev.href.length ? curr : prev));
}

export function getAccountingActiveGroupId(pathname: string | null): string | null {
  const activeItem = getAccountingActiveItem(pathname);
  if (!activeItem) return null;

  return (
    ACCOUNTING_NAV_GROUPS.find((group) =>
      group.items.some((item) => item.href === activeItem.href)
    )?.id ?? null
  );
}
