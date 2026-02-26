"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { format } from "date-fns";
import apiClient from "@/lib/api/client";
import { useBranchStore } from "@/store/branchStore";
import { useCurrency } from "@/lib/hooks/useCurrency";

export default function JobProfitabilityPage() {
    const { formatCurrency } = useCurrency();
    const { activeBranchId } = useBranchStore();
    const [filters, setFilters] = useState({
        start_date: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0]
    });

    const { data: report, isLoading } = useQuery({
        queryKey: ["job-profitability", filters, activeBranchId],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters.start_date) params.append('start_date', filters.start_date);
            if (filters.end_date) params.append('end_date', filters.end_date);
            if (activeBranchId) params.append('branch_id', activeBranchId.toString());

            const response = await apiClient.get(`/accounting/reports/job-profitability/?${params}`);
            return response.data;
        }
    });

    return (
        <div className="space-y-4">
            {/* Compact Header */}
            <div className="pt-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Job Profitability</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Analyze revenue vs costs for all work orders
                </p>
            </div>

            {/* Filters - Compact */}
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

            {/* Summary Cards - Compact */}
            {report && (
                <div className="grid grid-cols-3 gap-3">
                    <Card className="shadow-sm border">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Revenue</p>
                                    <p className="text-lg font-bold text-foreground mt-1">
                                        {formatCurrency(report.summary?.total_revenue || 0)}
                                    </p>
                                </div>
                                <DollarSign className="w-8 h-8 text-primary" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Costs</p>
                                    <p className="text-lg font-bold text-foreground mt-1">
                                        {formatCurrency(report.summary?.total_costs || 0)}
                                    </p>
                                </div>
                                <TrendingDown className="w-8 h-8 text-red-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Profit</p>
                                    <p className="text-lg font-bold text-success mt-1">
                                        {formatCurrency(report.summary?.net_profit || 0)}
                                    </p>
                                </div>
                                <TrendingUp className="w-8 h-8 text-success" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Table - Compact */}
            <Card className="border-none shadow-sm overflow-hidden ring-1 ring-gray-200 dark:ring-gray-800">
                <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-base">Work Orders ({report?.jobs?.length || 0})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : report?.jobs?.length > 0 ? (
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
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Profit</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Margin</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>

                                    {report.jobs.map((job: any) => (
                                        <TableRow key={job.work_order_id} className="hover:bg-muted/50 hover:bg-muted/50 border-b border-border">
                                            <TableCell className="px-4 py-2 font-mono text-xs font-medium text-card-foreground">
                                                {job.work_order_number}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-sm font-medium text-foreground">
                                                {job.customer_name}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                {job.date ? format(new Date(job.date), 'MMM d, yyyy') : '-'}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-foreground text-right font-mono">
                                                {formatCurrency(job.revenue || 0)}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground text-right font-mono">
                                                {formatCurrency(job.labor_cost || 0)}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground text-right font-mono">
                                                {formatCurrency(job.parts_cost || 0)}
                                            </TableCell>
                                            <TableCell className={`px-4 py-2 text-xs text-right font-mono font-medium ${(job.profit || 0) >= 0 ? 'text-success' : 'text-red-600'}`}>
                                                {formatCurrency(job.profit || 0)}
                                            </TableCell>
                                            <TableCell className={`px-4 py-2 text-xs text-right font-medium ${(job.margin || 0) >= 0 ? 'text-success' : 'text-red-600'}`}>
                                                {job.margin !== undefined ? `${job.margin.toFixed(1)}%` : '-'}
                                            </TableCell>
                                        </TableRow>
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
