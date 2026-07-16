"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import {
  AlertTriangle,
  ChevronRight,
  HandCoins,
  Landmark,
  Receipt,
  Wallet,
} from "lucide-react";
import { billingApi } from "@/lib/api/billing";
import { accountingApi } from "@/lib/api/accounting";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { WORKSHOP_PANEL_CLASS } from "@/lib/constants/table-typography";

const CARD = cn(
  WORKSHOP_PANEL_CLASS,
  "p-3.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/25"
);

export function FinanceAtAGlancePanel() {
  const { formatCurrency } = useCurrency();
  const { hasPermission, hasAnyPermission } = usePermissions();

  const canViewBilling = hasPermission("view_billing");
  const canViewAccounting = hasPermission("view_accounting");
  const canViewBank = hasAnyPermission(["reconcile_bank_statements", "view_bank_statements"]);
  const enabled = canViewBilling || canViewAccounting;

  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");

  const invoiceStatsQuery = useQuery({
    queryKey: ["dashboard", "finance-glance", "invoice-stats"],
    queryFn: () => billingApi.invoices.stats(),
    enabled: canViewBilling,
    staleTime: 5 * 60 * 1000,
  });

  const billStatsQuery = useQuery({
    queryKey: ["dashboard", "finance-glance", "bill-stats"],
    queryFn: () => billingApi.bills.stats(),
    enabled: canViewBilling,
    staleTime: 5 * 60 * 1000,
  });

  const cashQuery = useQuery({
    queryKey: ["dashboard", "finance-glance", "cash", monthStart, today],
    queryFn: () =>
      accountingApi.getCommandCenterSnapshot({
        start_date: monthStart,
        end_date: today,
        fiscal_year: String(new Date().getFullYear()),
        branch_id: "",
        account_id: "",
      }),
    enabled: canViewAccounting,
    staleTime: 5 * 60 * 1000,
  });

  if (!enabled) {
    return null;
  }

  const outstandingAr = Number(invoiceStatsQuery.data?.financials?.outstanding_total ?? 0);
  const overdueCount = invoiceStatsQuery.data?.counts?.overdue ?? 0;
  const overdueAmount = Number(invoiceStatsQuery.data?.financials?.past_due_total ?? 0);
  const outstandingAp = Number(billStatsQuery.data?.financials?.outstanding_total ?? 0);
  const totalCash = cashQuery.data?.cash_position?.total_available_cash ?? 0;
  const pendingVariances = cashQuery.data?.till_management?.totals?.pending_variance_approvals ?? 0;

  const tiles = [
    canViewBilling
      ? {
          key: "ar",
          label: "Outstanding AR",
          value: formatCurrency(outstandingAr),
          sub: overdueCount > 0 ? `${overdueCount} overdue · ${formatCurrency(overdueAmount)}` : "All current",
          href: "/billing/receivables?tab=balances",
          icon: HandCoins,
          tone: overdueCount > 0 ? "text-destructive" : "text-success",
        }
      : null,
    canViewBilling
      ? {
          key: "collections",
          label: "Overdue Invoices",
          value: String(overdueCount),
          sub: overdueCount > 0 ? formatCurrency(overdueAmount) : "None overdue",
          href: "/billing/receivables?tab=overdue",
          icon: AlertTriangle,
          tone: overdueCount > 0 ? "text-destructive" : "text-muted-foreground",
        }
      : null,
    canViewBilling
      ? {
          key: "ap",
          label: "Outstanding AP",
          value: formatCurrency(outstandingAp),
          sub: "Supplier bills open",
          href: "/billing/payables?tab=balances",
          icon: Receipt,
          tone: "text-warning",
        }
      : null,
    canViewAccounting
      ? {
          key: "cash",
          label: "Available Cash",
          value: formatCurrency(Number(totalCash)),
          sub: pendingVariances > 0 ? `${pendingVariances} till variance(s) pending` : "Cash, bank & tills",
          href: "/accounting",
          icon: Wallet,
          tone: "text-info",
        }
      : null,
    canViewAccounting && canViewBank
      ? {
          key: "bank",
          label: "Bank Reconciliation",
          value: "Review",
          sub: "Match statements to ledger",
          href: "/accounting/banking/reconciliation",
          icon: Landmark,
          tone: "text-info",
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    value: string;
    sub: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
  }>;

  if (tiles.length === 0) return null;

  const loading =
    (canViewBilling && (invoiceStatsQuery.isLoading || billStatsQuery.isLoading)) ||
    (canViewAccounting && cashQuery.isLoading);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Finance at a glance
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Receivables, payables, and cash — jump to the full accounting workspace when needed.
          </p>
        </div>
        {canViewAccounting ? (
          <Link href="/accounting" className="text-[11px] text-primary hover:underline">
            Accounting dashboard
          </Link>
        ) : null}
      </div>
      <div
        className={cn(
          "grid gap-3",
          tiles.length >= 5 ? "sm:grid-cols-2 xl:grid-cols-5" : "sm:grid-cols-2 xl:grid-cols-4"
        )}
      >
        {tiles.map((tile) => (
          <Link key={tile.key} href={tile.href} className={CARD}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                <tile.icon className={cn("h-4 w-4", tile.tone)} />
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tile.label}</p>
            <p className="text-xl font-bold tracking-tight text-foreground tabular-nums">
              {loading ? "—" : tile.value}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{tile.sub}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
