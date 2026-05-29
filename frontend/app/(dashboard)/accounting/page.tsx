"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { accountingApi } from "@/lib/api/accounting";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { InteractiveTrendChart } from "@/components/dashboard/InteractiveTrendChart";
import { OperationalGrid } from "@/components/dashboard/OperationalGrid";
import { RecentActivityPanel, type RecentJournalEntry } from "@/components/dashboard/RecentActivityPanel";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download, Database } from "lucide-react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { quickbooksApi } from "@/lib/api/quickbooks";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/hooks/useTheme";
import { useBranchStore } from "@/store/branchStore";
import { BranchReportChip } from "@/components/reporting/BranchReportChip";
import { useCurrency } from "@/lib/hooks/useCurrency";

type TrendPoint = {
    date: string;
    revenue: number;
    expense: number;
    cash_flow: number;
};

type Insight = {
    type: "danger" | "warning" | "info";
    title: string;
    message: string;
    action_link?: string;
};

type TopJob = {
    work_order_id: number | string;
    customer: string;
    vehicle: string;
    gross_profit: number;
    margin_percent: number;
};

type FinancialHealth = {
    cash_on_hand: number;
    runway_months: number;
    net_profit: number;
    net_profit_margin: number;
    total_revenue: number;
    total_expenses: number;
    monthly_burn: number;
};

type AccountingSnapshot = {
    financial_health: FinancialHealth;
    trends: TrendPoint[];
    insights: Insight[];
    top_jobs: TopJob[];
};

function normalizeAccountingSnapshot(raw: unknown): AccountingSnapshot {
    const d = (raw ?? {}) as Partial<AccountingSnapshot>;
    const fh: Partial<FinancialHealth> = d.financial_health ?? {};
    return {
        financial_health: {
            cash_on_hand: Number(fh.cash_on_hand) || 0,
            runway_months: Number.isFinite(Number(fh.runway_months)) ? Number(fh.runway_months) : 0,
            net_profit: Number(fh.net_profit) || 0,
            net_profit_margin: Number(fh.net_profit_margin) || 0,
            total_revenue: Number(fh.total_revenue) || 0,
            total_expenses: Number(fh.total_expenses) || 0,
            monthly_burn: Number(fh.monthly_burn) || 0,
        },
        trends: Array.isArray(d.trends)
            ? d.trends.map((t) => ({
                  date: t.date ?? "",
                  revenue: Number(t.revenue) || 0,
                  expense: Number(t.expense) || 0,
                  cash_flow: Number(t.cash_flow) || 0,
              }))
            : [],
        insights: Array.isArray(d.insights) ? d.insights : [],
        top_jobs: Array.isArray(d.top_jobs) ? d.top_jobs : [],
    };
}

type MgmtKpis = {
    ar_outstanding?: number;
    ap_outstanding?: number;
    avg_job_margin?: number;
};

export default function AccountingDashboardPage() {
    const router = useRouter();
    const { error: toastError, success: toastSuccess } = useToast();
    const { formatCurrency, currencySymbol } = useCurrency();
    const { theme: activeTheme } = useTheme();
    const isPerfex = activeTheme.startsWith("perfex");
    const [dateRange, setDateRange] = useState({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date())
    });
    const [isSyncing, setIsSyncing] = useState(false);
    const { isConnected: isQboConnected } = useQuickBooksConnection();

    const handleQBOSync = async () => {
        try {
            setIsSyncing(true);
            await quickbooksApi.syncInbound();
            toastSuccess("QuickBooks sync triggered successfully. Data will update in a few moments.");
        } catch {
            toastError("Failed to trigger QuickBooks sync");
        } finally {
            setIsSyncing(false);
        }
    };

    const { activeBranchId } = useBranchStore();
    const startStr = format(dateRange.from!, 'yyyy-MM-dd');
    const endStr = format(dateRange.to!, 'yyyy-MM-dd');

    const {
        data,
        isLoading,
        isError,
        refetch,
    } = useQuery({
        queryKey: ['accounting-analytics', startStr, endStr, activeBranchId],
        queryFn: async () => {
            const raw = await accountingApi.getAnalyticsSnapshot({
                start_date: startStr,
                end_date: endStr,
            });
            return normalizeAccountingSnapshot(raw);
        },
        refetchInterval: 300000,
    });

    const { data: mgmtMetrics, isLoading: mgmtLoading } = useQuery({
        queryKey: ['accounting-mgmt-metrics', startStr, endStr, activeBranchId],
        queryFn: () => accountingApi.getManagementMetrics(startStr, endStr),
        refetchInterval: 300000,
        retry: 1,
    });

    const { data: recentEntries, isLoading: recentLoading } = useQuery({
        queryKey: ['accounting-recent-entries', activeBranchId],
        queryFn: () => accountingApi.getRecentTransactions(),
        staleTime: 60 * 1000,
    });

    const handleExport = async () => {
        try {
            const blob = await accountingApi.exportBoardPack(
                format(dateRange.from!, 'yyyy-MM-dd'),
                format(dateRange.to!, 'yyyy-MM-dd')
            );
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `financial-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toastSuccess("Export complete");
        } catch {
            toastError("Failed to export report");
        }
    };

    const pageLoading = isLoading || mgmtLoading;

    if (pageLoading) {
        return (
            <div className={`max-w-[1600px] animate-pulse ${isPerfex ? "space-y-4 p-4" : "space-y-6 p-4 md:p-6"}`}>
                <div className="h-10 w-72 rounded bg-muted"></div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 rounded-xl bg-muted" />)}
                </div>
                <div className="h-80 rounded-xl bg-muted"></div>
            </div>
        );
    }

    if (isError || !data) {
        return (
            <div className="max-w-[1600px] p-8 flex flex-col items-center gap-4 text-center">
                <p className="text-destructive">Error loading dashboard data. Please try again.</p>
                <Button variant="outline" onClick={() => refetch()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                </Button>
            </div>
        );
    }

    const { financial_health, trends, insights, top_jobs } = data;
    const mgmtKpis = (mgmtMetrics as { kpis?: MgmtKpis })?.kpis;

    const revenueSpark = trends.map((t) => ({ value: t.revenue }));
    const expenseSpark = trends.map((t) => ({ value: t.expense }));
    const profitSpark = trends.map((t) => ({ value: t.revenue - t.expense }));
    const cashBalanceSpark = trends.map((t) => ({ value: t.cash_flow }));

    const entryList = Array.isArray(recentEntries)
        ? recentEntries
        : ((recentEntries as unknown as { results?: unknown[] })?.results ?? []);

    const recentJournalEntries: RecentJournalEntry[] = entryList.slice(0, 6).map((e) => {
        const row = e as { id: number; reference?: string; date?: string; description?: string; posted?: boolean };
        return {
            id: row.id,
            entry_number: row.reference,
            date: row.date ?? "",
            description: row.description,
            status: row.posted ? "Posted" : "Draft",
        };
    });

    const burnLabel = `${currencySymbol}${(financial_health.monthly_burn / 1000).toFixed(1)}k/mo`;

    return (
        <div className={`max-w-[1600px] ${isPerfex ? "space-y-4 p-4" : "space-y-6 p-4 md:p-6"}`}>
            <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
                <div>
                    <h1 className={`${isPerfex ? "text-base font-semibold" : "text-2xl font-semibold"} tracking-tight text-foreground`}>Financial Overview</h1>
                    <p className={`mt-1 ${isPerfex ? "text-xs" : "text-sm"} text-muted-foreground`}>
                        Analytics for {format(dateRange.from!, "MMM d")} - {format(dateRange.to!, "MMM d, yyyy")}
                    </p>
                    <p className={`mt-1 ${isPerfex ? "text-[10px]" : "text-xs"} text-muted-foreground`}>
                        Per-report Print and PDF use branded templates under{" "}
                        <Link href="/accounting/reports" className="text-primary underline">
                            Financial Reports
                        </Link>
                        . Board pack below is a combined executive summary.
                    </p>
                    <div className="mt-2">
                        <BranchReportChip />
                    </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
                    <DateRangePicker
                        startDate={format(dateRange.from!, 'yyyy-MM-dd')}
                        endDate={format(dateRange.to!, 'yyyy-MM-dd')}
                        onStartDateChange={(date) => setDateRange(prev => ({ ...prev, from: new Date(date) }))}
                        onEndDateChange={(date) => setDateRange(prev => ({ ...prev, to: new Date(date) }))}
                    />
                    <Button variant="outline" size="icon" className={isPerfex ? "h-8 w-8 text-xs" : "h-9 w-9"} onClick={() => refetch()}>
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                    {isQboConnected && (
                        <Button variant="outline" size="sm" className={isPerfex ? "h-8 text-xs" : "h-9"} onClick={handleQBOSync} disabled={isSyncing}>
                            <Database className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
                            {isSyncing ? "Syncing..." : "Sync from QuickBooks"}
                        </Button>
                    )}
                    <Button size="sm" className={isPerfex ? "h-8 text-xs" : "h-9"} onClick={() => handleExport()}>
                        <Download className="w-4 h-4 mr-2" />
                        Board pack PDF
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    title="Cash on Hand"
                    value={financial_health.cash_on_hand}
                    icon="wallet"
                    variant="info"
                    data={cashBalanceSpark}
                    dataKey="value"
                    onClick={() => router.push("/accounting/reports/cash-flow")}
                    trend={{
                        value: 0,
                        isPositive: true,
                        label: `Runway: ${Math.min(financial_health.runway_months, 99).toFixed(1)} mo`
                    }}
                />
                <MetricCard
                    title="Net Profit"
                    value={financial_health.net_profit}
                    icon="trend"
                    variant={financial_health.net_profit >= 0 ? "success" : "danger"}
                    data={profitSpark}
                    onClick={() => router.push("/accounting/reports/profit-loss")}
                    trend={{
                        value: Number(financial_health.net_profit_margin.toFixed(1)),
                        isPositive: financial_health.net_profit >= 0,
                        label: "Margin"
                    }}
                />
                <MetricCard
                    title="Total Revenue"
                    value={financial_health.total_revenue}
                    icon="dollar"
                    variant="default"
                    data={revenueSpark}
                    onClick={() => router.push("/accounting/reports/profit-loss")}
                />
                <MetricCard
                    title="Total Expenses"
                    value={financial_health.total_expenses}
                    icon="activity"
                    variant="warning"
                    data={expenseSpark}
                    onClick={() => router.push("/accounting/reports/expense-breakdown")}
                    trend={{
                        value: 0,
                        isPositive: false,
                        label: `Burn: ${burnLabel}`
                    }}
                />
            </div>

            {(mgmtKpis?.ar_outstanding != null || mgmtKpis?.ap_outstanding != null || mgmtKpis?.avg_job_margin != null) && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {mgmtKpis?.ar_outstanding != null && (
                        <MetricCard
                            title="AR Outstanding"
                            value={mgmtKpis.ar_outstanding}
                            icon="dollar"
                            variant="info"
                            onClick={() => router.push("/accounting/reports/aging")}
                        />
                    )}
                    {mgmtKpis?.ap_outstanding != null && (
                        <MetricCard
                            title="AP Outstanding"
                            value={mgmtKpis.ap_outstanding}
                            icon="activity"
                            variant="warning"
                            onClick={() => router.push("/accounting/reports/aging")}
                        />
                    )}
                    {mgmtKpis?.avg_job_margin != null && (
                        <MetricCard
                            title="Avg Job Margin"
                            value={mgmtKpis.avg_job_margin}
                            displayValue={`${mgmtKpis.avg_job_margin.toFixed(1)}%`}
                            icon="trend"
                            variant="success"
                            onClick={() => router.push("/accounting/reports/margin-analysis")}
                        />
                    )}
                </div>
            )}

            <div className={`grid grid-cols-1 ${isPerfex ? "rounded-md border border-border bg-card shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)] overflow-hidden" : ""}`}>
                <InteractiveTrendChart data={trends} title="Financial Performance Trends" />
            </div>

            <div className="flex flex-wrap gap-2">
                {[
                    { label: "P&L", href: "/accounting/reports/profit-loss" },
                    { label: "Aging", href: "/accounting/reports/aging" },
                    { label: "Cash flow", href: "/accounting/reports/cash-flow" },
                    { label: "Job profitability", href: "/accounting/reports/job-profitability" },
                    { label: "Management", href: "/accounting/reports/management" },
                ].map((link) => (
                    <Link
                        key={link.href}
                        href={link.href}
                        className="rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium hover:bg-muted/60 transition-colors"
                    >
                        {link.label}
                    </Link>
                ))}
            </div>

            <div className={isPerfex ? "rounded-md border border-border bg-card shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)] overflow-hidden" : ""}>
                <OperationalGrid
                    insights={insights}
                    topJobs={top_jobs}
                />
            </div>

            <RecentActivityPanel entries={recentJournalEntries} isLoading={recentLoading} />
        </div>
    );
}
