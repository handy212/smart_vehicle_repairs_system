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

const CARD =
  "rounded-md border border-border bg-card p-3 shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)] transition-colors hover:border-primary/30 hover:bg-muted/20";

export function FinanceAtAGlancePanel() {
  const { formatCurrency } = useCurrency();
  const { hasPermission, hasAnyPermission } = usePermissions();

  const canViewBilling = hasPermission("view_billing");
  const canViewAccounting = hasPermission("view_accounting");

  if (!canViewBilling && !canViewAccounting) {
    return null;
  }

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
          tone: overdueCount > 0 ? "text-destructive" : "text-emerald-600",
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
          tone: "text-amber-600",
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
          tone: "text-violet-600",
        }
      : null,
    canViewAccounting && hasAnyPermission(["reconcile_bank_statements", "view_bank_statements"])
      ? {
          key: "bank",
          label: "Bank Reconciliation",
          value: "Review",
          sub: "Match statements to ledger",
          href: "/accounting/banking/reconciliation",
          icon: Landmark,
          tone: "text-sky-600",
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
            <p className="mt-2 text-[10px] text-muted-foreground">{tile.label}</p>
            <p className="text-sm font-semibold text-foreground">
              {loading ? "—" : tile.value}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{tile.sub}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
