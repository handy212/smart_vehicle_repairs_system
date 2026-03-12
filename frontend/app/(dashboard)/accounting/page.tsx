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
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { addDays, startOfMonth, endOfMonth, format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { quickbooksApi } from "@/lib/api/quickbooks";
import { cn } from "@/lib/utils";

export default function AccountingDashboardPage() {
    const { error: toastError, success: toastSuccess } = useToast();
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
        } catch (err) {
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
            });
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

        } catch (err) {
            toastError("Failed to export report");
        }
    };

    if (isLoading) {
        return (
            <div className="p-8 space-y-8 animate-pulse">
                <div className="h-12 w-1/3 bg-muted rounded"></div>
                <div className="grid grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted rounded"></div>)}
                </div>
                <div className="h-96 bg-muted rounded"></div>
            </div>
        );
    }

    if (isError) {
        return <div className="p-8 text-rose-500">Error loading dashboard data. Please try again.</div>;
    }

    const { financial_health, trends, insights, top_jobs } = data;

    // Prepare sparkline data (simplified from trends)

    const revenueSpark = trends.map((t: any) => ({ value: t.revenue }));

    const expenseSpark = trends.map((t: any) => ({ value: t.expense }));

    const profitSpark = trends.map((t: any) => ({ value: t.revenue - t.expense }));

    const cashFlowSpark = trends.map((t: any) => ({ value: t.cash_flow }));

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-[1600px]">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Financial Overview</h1>
                    <p className="text-muted-foreground mt-1">
                        Analytics for {format(dateRange.from!, "MMM d")} - {format(dateRange.to!, "MMM d, yyyy")}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <DateRangePicker
                        startDate={format(dateRange.from!, 'yyyy-MM-dd')}
                        endDate={format(dateRange.to!, 'yyyy-MM-dd')}
                        onStartDateChange={(date) => setDateRange(prev => ({ ...prev, from: new Date(date) }))}
                        onEndDateChange={(date) => setDateRange(prev => ({ ...prev, to: new Date(date) }))}
                    />
                    <Button variant="outline" size="icon" onClick={() => refetch()}>
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleQBOSync} disabled={isSyncing}>
                        <Database className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
                        {isSyncing ? "Syncing..." : "Sync from QuickBooks"}
                    </Button>
                    <Button onClick={handleExport}>
                        <Download className="w-4 h-4 mr-2" />
                        Export Report
                    </Button>
                </div>
            </div>

            {/* Pulse Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    title="Cash on Hand"
                    value={financial_health.cash_on_hand}
                    icon="wallet"
                    variant="info"
                    data={cashFlowSpark}
                    dataKey="value"
                    trend={{
                        value: 0, // Calculate MoM in backend for real trend
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
                        value: financial_health.net_profit_margin.toFixed(1),
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

            {/* Main Interactive Chart */}
            <div className="grid grid-cols-1">
                <InteractiveTrendChart data={trends} title="Financial Performance Trends" />
            </div>

            {/* Operational Grid */}
            <OperationalGrid
                insights={insights}
                topJobs={top_jobs}
            />
        </div>
    );
}
