"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { InteractiveTrendChart } from "@/components/dashboard/InteractiveTrendChart";
import { OperationalGrid } from "@/components/dashboard/OperationalGrid";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download, Database } from "lucide-react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { quickbooksApi } from "@/lib/api/quickbooks";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/hooks/useTheme";

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

export default function AccountingDashboardPage() {
    const { error: toastError, success: toastSuccess } = useToast();
    const { theme: activeTheme } = useTheme();
    const isPerfex = activeTheme === "perfex";
    const [dateRange, setDateRange] = useState({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date())
    });
    const [isSyncing, setIsSyncing] = useState(false);

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

    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ['accounting-analytics', dateRange.from, dateRange.to],
        queryFn: async () => {
            return await accountingApi.getAnalyticsSnapshot({
                start_date: format(dateRange.from!, 'yyyy-MM-dd'),
                end_date: format(dateRange.to!, 'yyyy-MM-dd')
            }) as AccountingSnapshot;
        },
        refetchInterval: 300000 // Refresh every 5 mins
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

    if (isLoading) {
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

    if (isError) {
        return <div className="p-8 text-destructive">Error loading dashboard data. Please try again.</div>;
    }

    if (!data) return null;

    const { financial_health, trends, insights, top_jobs } = data;

    const revenueSpark = trends.map((t) => ({ value: t.revenue }));
    const expenseSpark = trends.map((t) => ({ value: t.expense }));
    const profitSpark = trends.map((t) => ({ value: t.revenue - t.expense }));
    const cashFlowSpark = trends.map((t) => ({ value: t.cash_flow }));

    return (
        <div className={`max-w-[1600px] ${isPerfex ? "space-y-4 p-4" : "space-y-6 p-4 md:p-6"}`}>
            <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
                <div>
                    <h1 className={`${isPerfex ? "text-base font-semibold" : "text-2xl font-semibold"} tracking-tight text-foreground`}>Financial Overview</h1>
                    <p className={`mt-1 ${isPerfex ? "text-xs" : "text-sm"} text-muted-foreground`}>
                        Analytics for {format(dateRange.from!, "MMM d")} - {format(dateRange.to!, "MMM d, yyyy")}
                    </p>
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
                    <Button variant="outline" size="sm" className={isPerfex ? "h-8 text-xs" : "h-9"} onClick={handleQBOSync} disabled={isSyncing}>
                        <Database className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
                        {isSyncing ? "Syncing..." : "Sync from QuickBooks"}
                    </Button>
                    <Button size="sm" className={isPerfex ? "h-8 text-xs" : "h-9"} onClick={handleExport}>
                        <Download className="w-4 h-4 mr-2" />
                        Export Report
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    title="Cash on Hand"
                    value={financial_health.cash_on_hand}
                    icon="wallet"
                    variant="info"
                    data={cashFlowSpark}
                    dataKey="value"
                    trend={{
                        value: 0,
                        isPositive: true,
                        label: `Runway: ${financial_health.runway_months.toFixed(1)} mo`
                    }}
                />
                <MetricCard
                    title="Net Profit"
                    value={financial_health.net_profit}
                    icon="trend"
                    variant={financial_health.net_profit >= 0 ? "success" : "danger"}
                    data={profitSpark}
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
                />
                <MetricCard
                    title="Total Expenses"
                    value={financial_health.total_expenses}
                    icon="activity"
                    variant="warning"
                    data={expenseSpark}
                    trend={{
                        value: 0,
                        isPositive: false,
                        label: `Burn: $${(financial_health.monthly_burn / 1000).toFixed(1)}k/mo`
                    }}
                />
            </div>

            <div className={`grid grid-cols-1 ${isPerfex ? "rounded-md border border-border bg-card shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)] overflow-hidden" : ""}`}>
                <InteractiveTrendChart data={trends} title="Financial Performance Trends" />
            </div>

            <div className={isPerfex ? "rounded-md border border-border bg-card shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)] overflow-hidden" : ""}>
                <OperationalGrid
                    insights={insights}
                    topJobs={top_jobs}
                />
            </div>
        </div>
    );
}
