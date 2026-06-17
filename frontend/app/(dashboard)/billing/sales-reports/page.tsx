"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import {
  ArrowRight,
  BarChart3,
  FileText,
  HandCoins,
  PieChart,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { billingApi } from "@/lib/api/billing";
import { reportingApi } from "@/lib/api/reporting";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const LINKS = [
  {
    title: "Revenue Report",
    description: "Revenue by period, service type, and collection trends.",
    href: "/reports/financial",
    icon: BarChart3,
  },
  {
    title: "Management Reports",
    description: "Executive KPIs, branch scorecards, and revenue mix.",
    href: "/accounting/reports/management",
    icon: PieChart,
  },
  {
    title: "Customer Balances",
    description: "Open receivable balances by customer.",
    href: "/billing/customer-balances",
    icon: HandCoins,
  },
  {
    title: "Collections",
    description: "Overdue invoices, aging buckets, and follow-up actions.",
    href: "/billing/collections",
    icon: FileText,
  },
  {
    title: "Invoices",
    description: "Customer invoices and payment status.",
    href: "/billing/invoices",
    icon: Receipt,
  },
];

export default function SalesReportsPage() {
  const { formatCurrency } = useCurrency();
  const today = new Date();
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
  const todayStr = format(today, "yyyy-MM-dd");

  const { data: invoiceStats, isLoading: statsLoading } = useQuery({
    queryKey: ["billing", "sales-reports", "invoice-stats"],
    queryFn: () => billingApi.invoices.stats(),
  });

  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ["billing", "sales-reports", "revenue-mtd", monthStart, todayStr],
    queryFn: () =>
      reportingApi.revenue({
        start_date: monthStart,
        end_date: todayStr,
        period: "monthly",
      }),
  });

  const outstandingAr = Number(invoiceStats?.financials?.outstanding_total ?? 0);
  const overdueCount = invoiceStats?.counts?.overdue ?? 0;
  const overdueAmount = Number(invoiceStats?.financials?.past_due_total ?? 0);
  const revenueMtd =
    revenueData?.summary?.total_paid ??
    revenueData?.revenue_by_period?.reduce(
      (sum: number, row: { revenue?: number | string }) => sum + Number(row.revenue ?? 0),
      0
    ) ??
    0;

  const summaryCards = [
    {
      label: "Revenue MTD",
      value: statsLoading || revenueLoading ? "—" : formatCurrency(Number(revenueMtd)),
      icon: TrendingUp,
      href: "/reports/financial",
    },
    {
      label: "Outstanding AR",
      value: statsLoading ? "—" : formatCurrency(outstandingAr),
      icon: HandCoins,
      href: "/billing/customer-balances",
    },
    {
      label: "Overdue Invoices",
      value: statsLoading ? "—" : String(overdueCount),
      sub: statsLoading ? undefined : formatCurrency(overdueAmount),
      icon: Receipt,
      href: "/billing/collections",
    },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Receivables snapshot for the current period, plus links to full revenue and management reports.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href}>
              <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/20">
                <CardContent className="pt-5">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-semibold">{card.value}</p>
                  {card.sub ? <p className="text-xs text-destructive">{card.sub}</p> : null}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Full reports</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href} className="group">
                <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/20">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <CardTitle className="text-base">{link.title}</CardTitle>
                    <CardDescription>{link.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <span className="text-xs font-medium text-primary">Open report</span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
