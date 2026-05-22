"use client";

import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Wrench, Package, MoreHorizontal } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import apiClient from "@/lib/api/client";
import { useBranchStore } from "@/store/branchStore";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { ReportExportMenu } from "@/components/reports/ReportExportMenu";
import type { TableExportPayload } from "@/lib/utils/report-export";

function MarginBadge({ value }: { value: number }) {
    const color =
        value >= 40 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
        : value >= 20 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
            {value.toFixed(1)}%
        </span>
    );
}

type JobProfitabilityJob = {
    work_order_id: number;
    work_order_number: string;
    customer: string;
    created_at?: string;
    revenue?: number;
    labor_cost?: number;
    parts_cost?: number;
    gross_profit?: number;
    margin_percent?: number;
    labor_cost_is_actual?: boolean;
    parts_cost_is_actual?: boolean;
    labor_revenue?: number;
    labor_margin_percent?: number;
    parts_revenue?: number;
    parts_margin_percent?: number;
    other_revenue?: number;
    other_margin_percent?: number;
};

type JobProfitabilityReport = {
    totals?: Record<string, number>;
    jobs?: JobProfitabilityJob[];
};

export default function JobProfitabilityPage() {
    const { formatCurrency } = useCurrency();
    const { activeBranchId } = useBranchStore();
    const [filters, setFilters] = useState({
        start_date: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split("T")[0],
        end_date: new Date().toISOString().split("T")[0],
    });
    const [expandedJob, setExpandedJob] = useState<number | null>(null);

    const { data: report, isLoading } = useQuery({
        queryKey: ["job-profitability", filters, activeBranchId],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters.start_date) params.append("start_date", filters.start_date);
            if (filters.end_date) params.append("end_date", filters.end_date);
            if (activeBranchId) params.append("branch_id", activeBranchId.toString());
            const response = await apiClient.get(`/accounting/reports/job-profitability/?${params}`);
            return response.data;
        },
    });

    const typedReport = report as JobProfitabilityReport | undefined;
    const totals = typedReport?.totals ?? {};
    const jobs = typedReport?.jobs ?? [];

    const getExportPayload = (): TableExportPayload | null => {
        if (!jobs.length) return null;
        return {
            reportTitle: "Job Profitability",
            filename: `job-profitability_${filters.start_date}_${filters.end_date}`,
            dateInfo: `${filters.start_date} to ${filters.end_date}`,
            headers: [
                "WO #",
                "Customer",
                "Date",
                "Revenue",
                "Labor Cost",
                "Parts Cost",
                "Gross Profit",
                "Margin %",
            ],
            rows: jobs.map((job) => [
                job.work_order_number,
                job.customer,
                job.created_at ? format(new Date(job.created_at), "yyyy-MM-dd") : "",
                job.revenue ?? 0,
                job.labor_cost ?? 0,
                job.parts_cost ?? 0,
                job.gross_profit ?? 0,
                job.margin_percent ?? 0,
            ]),
            currencyColumnIndexes: [3, 4, 5, 6],
        };
    };

    return (
        <div className="space-y-4">
            <div className="pt-2 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Job Profitability</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Revenue vs. actual costs per work order — broken down by labor, parts, and other
                </p>
                </div>
                <ReportExportMenu getPayload={getExportPayload} disabled={!jobs.length} />
            </div>

            {/* Filters */}
            <Card className="border shadow-sm">
                <CardContent className="p-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="start_date" className="text-xs">Start Date</Label>
                            <Input
                                id="start_date"
                                type="date"
                                value={filters.start_date}
                                onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                                className="h-9 text-sm"
                            />
                        </div>
                        <div>
                            <Label htmlFor="end_date" className="text-xs">End Date</Label>
                            <Input
                                id="end_date"
                                type="date"
                                value={filters.end_date}
                                onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                                className="h-9 text-sm"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Summary Cards */}
            {report && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Card className="shadow-sm border">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Revenue</p>
                                    <p className="text-lg font-bold text-foreground mt-1">
                                        {formatCurrency(totals.revenue ?? 0)}
                                    </p>
                                </div>
                                <DollarSign className="w-8 h-8 text-primary opacity-70" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Direct Costs</p>
                                    <p className="text-lg font-bold text-foreground mt-1">
                                        {formatCurrency(totals.direct_costs ?? 0)}
                                    </p>
                                </div>
                                <TrendingDown className="w-8 h-8 text-destructive opacity-70" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gross Profit</p>
                                    <p className={`text-lg font-bold mt-1 ${(totals.gross_profit ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                                        {formatCurrency(totals.gross_profit ?? 0)}
                                    </p>
                                </div>
                                <TrendingUp className="w-8 h-8 text-emerald-500 opacity-70" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border">
                        <CardContent className="p-3">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg Margin</p>
                                <p className={`text-lg font-bold mt-1 ${(totals.avg_margin_percent ?? 0) >= 20 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                                    {(totals.avg_margin_percent ?? 0).toFixed(1)}%
                                </p>
                                <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
                                    <span>Labor: {formatCurrency(totals.total_labor_revenue ?? 0)}</span>
                                    <span>Parts: {formatCurrency(totals.total_parts_revenue ?? 0)}</span>
                                    <span>Other: {formatCurrency(totals.total_other_revenue ?? 0)}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Table */}
            <Card className="border-none shadow-sm overflow-hidden ring-1 ring-gray-200 dark:ring-gray-800">
                <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-base">Work Orders ({jobs.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : jobs.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/50 border-y border-border">
                                    <TableRow className="hover:bg-transparent border-none">
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">WO #</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Customer</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Date</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Revenue</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Labor Cost</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Parts Cost</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Gross Profit</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Margin</TableHead>
                                        <TableHead className="h-8 w-8 px-2"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {jobs.map((job) => (
                                        <Fragment key={job.work_order_id}>
                                            <TableRow
                                                className="hover:bg-muted/50 border-b border-border cursor-pointer"
                                                onClick={() => setExpandedJob(expandedJob === job.work_order_id ? null : job.work_order_id)}
                                            >
                                                <TableCell className="px-4 py-2 font-mono text-xs font-medium text-card-foreground">
                                                    <Link
                                                        href={`/workorders/${job.work_order_id}`}
                                                        className="text-primary hover:underline"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {job.work_order_number}
                                                    </Link>
                                                </TableCell>
                                                <TableCell className="px-4 py-2 text-sm font-medium text-foreground">
                                                    {job.customer}
                                                </TableCell>
                                                <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                    {job.created_at ? format(new Date(job.created_at), "MMM d, yyyy") : "-"}
                                                </TableCell>
                                                <TableCell className="px-4 py-2 text-xs text-foreground text-right font-mono">
                                                    {formatCurrency(job.revenue ?? 0)}
                                                </TableCell>
                                                <TableCell className="px-4 py-2 text-xs text-muted-foreground text-right font-mono">
                                                    <span>{formatCurrency(job.labor_cost ?? 0)}</span>
                                                    {job.labor_cost_is_actual && (
                                                        <span className="ml-1 text-[9px] text-emerald-500">actual</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="px-4 py-2 text-xs text-muted-foreground text-right font-mono">
                                                    <span>{formatCurrency(job.parts_cost ?? 0)}</span>
                                                    {job.parts_cost_is_actual && (
                                                        <span className="ml-1 text-[9px] text-emerald-500">actual</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className={`px-4 py-2 text-xs text-right font-mono font-medium ${(job.gross_profit ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                                                    {formatCurrency(job.gross_profit ?? 0)}
                                                </TableCell>
                                                <TableCell className="px-4 py-2 text-xs text-right">
                                                    <MarginBadge value={job.margin_percent ?? 0} />
                                                </TableCell>
                                                <TableCell className="px-2 py-2 text-muted-foreground">
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </TableCell>
                                            </TableRow>

                                            {/* Expanded per-category breakdown */}
                                            {expandedJob === job.work_order_id && (
                                                <TableRow className="bg-muted/30 border-b border-border">
                                                    <TableCell colSpan={9} className="px-4 py-3">
                                                        <div className="grid grid-cols-3 gap-4 text-xs">
                                                            {/* Labor */}
                                                            <div className="flex items-start gap-2">
                                                                <Wrench className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                                                                <div>
                                                                    <p className="font-semibold text-foreground">Labor</p>
                                                                    <p className="text-muted-foreground">Revenue: {formatCurrency(job.labor_revenue ?? 0)}</p>
                                                                    <p className="text-muted-foreground">Cost: {formatCurrency(job.labor_cost ?? 0)}</p>
                                                                    <p className="mt-0.5">Margin: <MarginBadge value={job.labor_margin_percent ?? 0} /></p>
                                                                </div>
                                                            </div>
                                                            {/* Parts */}
                                                            <div className="flex items-start gap-2">
                                                                <Package className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                                                <div>
                                                                    <p className="font-semibold text-foreground">Parts</p>
                                                                    <p className="text-muted-foreground">Revenue: {formatCurrency(job.parts_revenue ?? 0)}</p>
                                                                    <p className="text-muted-foreground">Cost: {formatCurrency(job.parts_cost ?? 0)}</p>
                                                                    <p className="mt-0.5">Margin: <MarginBadge value={job.parts_margin_percent ?? 0} /></p>
                                                                </div>
                                                            </div>
                                                            {/* Other */}
                                                            <div className="flex items-start gap-2">
                                                                <DollarSign className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                                                                <div>
                                                                    <p className="font-semibold text-foreground">Other / Fees</p>
                                                                    <p className="text-muted-foreground">Revenue: {formatCurrency(job.other_revenue ?? 0)}</p>
                                                                    <p className="mt-0.5">Margin: <MarginBadge value={job.other_margin_percent ?? 0} /></p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </Fragment>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground py-12 text-sm">
                            No work orders found for the selected date range.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
