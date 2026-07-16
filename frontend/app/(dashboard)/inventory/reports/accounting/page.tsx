"use client";

import { useState } from "react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";
import { BranchReportChip } from "@/components/reporting/BranchReportChip";
import { useBranchStore } from "@/store/branchStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Calendar, Package, TrendingUp, DollarSign, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportExportMenu } from "@/components/reports/ReportExportMenu";
import { exportSheetsToExcel, type TableExportPayload } from "@/lib/utils/report-export";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, ChevronDown } from "lucide-react";
import { useToast } from "@/lib/hooks/useToast";

interface InventoryAccountingData {
    period: {
        date_from: string;
        date_to: string;
        days: number;
    };
    inventory_summary: {
        total_parts: number;
        total_quantity: number;
        total_cost_value: number;
        total_selling_value: number;
        potential_profit: number;
        potential_margin_percent: number;
    };
    cogs_analysis: {
        cogs: number;
        units_sold: number;
        avg_cost_per_unit: number;
        inventory_turnover_ratio: number;
        days_inventory_outstanding: number;
    };
    by_category: Array<{
        category_id: number;
        category_name: string;
        parts_count: number;
        total_quantity: number;
        cost_value: number;
        selling_value: number;
        potential_profit: number;
        margin_percent: number;
    }>;
    stock_aging: Array<{
        age_range: string;
        parts_count: number;
        value: number;
    }>;
}

export default function InventoryAccountingPage() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    const [dateFrom, setDateFrom] = useState(firstDay.toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(now.toISOString().split('T')[0]);

    const { activeBranchId } = useBranchStore();

    const { data, isLoading, refetch } = useQuery<InventoryAccountingData>({
        queryKey: ['inventory-accounting', dateFrom, dateTo, activeBranchId],
        queryFn: async () => {
            const response = await apiClient.get(
                '/inventory/parts/inventory_accounting_report/',
                { params: { date_from: dateFrom, date_to: dateTo } }
            );
            return response.data;
        },
    });

    const { formatCurrency } = useCurrency();
    const { toast } = useToast();

    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('en-US').format(num);
    };

    const buildCategoryExport = (): TableExportPayload | null => {
        if (!data?.by_category?.length) return null;
        return {
            filename: `inventory-accounting_${dateFrom}_${dateTo}`,
            reportTitle: "Inventory Accounting — By category",
            dateInfo: `${dateFrom} to ${dateTo}`,
            headers: ["Category", "Parts", "Quantity", "Cost value", "Selling value", "Profit", "Margin %"],
            rows: data.by_category.map((c) => [
                c.category_name,
                c.parts_count,
                c.total_quantity,
                c.cost_value,
                c.selling_value,
                c.potential_profit,
                c.margin_percent.toFixed(2),
            ]),
            currencyColumnIndexes: [3, 4, 5],
        };
    };

    const exportFullWorkbook = () => {
        if (!data) {
            toast({ title: "Nothing to export", description: "Load the report first." });
            return;
        }
        const s = data.inventory_summary;
        const cogs = data.cogs_analysis;
        exportSheetsToExcel(
            [
                {
                    name: "Summary",
                    headers: [
                        { key: "metric", label: "Metric" },
                        { key: "value", label: "Value" },
                    ],
                    rows: [
                        { metric: "Total cost value", value: s.total_cost_value },
                        { metric: "Total selling value", value: s.total_selling_value },
                        { metric: "Potential profit", value: s.potential_profit },
                        { metric: "Margin %", value: s.potential_margin_percent },
                        { metric: "COGS (period)", value: cogs.cogs },
                        { metric: "Units sold", value: cogs.units_sold },
                        { metric: "Turnover ratio", value: cogs.inventory_turnover_ratio },
                        { metric: "Days inventory", value: cogs.days_inventory_outstanding },
                    ],
                    currencyKeys: ["value"],
                },
                {
                    name: "By category",
                    headers: [
                        { key: "category", label: "Category" },
                        { key: "parts", label: "Parts" },
                        { key: "qty", label: "Quantity" },
                        { key: "cost", label: "Cost value" },
                        { key: "selling", label: "Selling value" },
                        { key: "profit", label: "Profit" },
                        { key: "margin", label: "Margin %" },
                    ],
                    rows: data.by_category.map((cat) => ({
                        category: cat.category_name,
                        parts: cat.parts_count,
                        qty: cat.total_quantity,
                        cost: cat.cost_value,
                        selling: cat.selling_value,
                        profit: cat.potential_profit,
                        margin: cat.margin_percent,
                    })),
                    currencyKeys: ["cost", "selling", "profit"],
                },
                {
                    name: "Stock aging",
                    headers: [
                        { key: "range", label: "Age range" },
                        { key: "parts", label: "Parts" },
                        { key: "value", label: "Value" },
                    ],
                    rows: data.stock_aging.map((a) => ({
                        range: a.age_range,
                        parts: a.parts_count,
                        value: a.value,
                    })),
                    currencyKeys: ["value"],
                },
            ],
            `inventory-accounting_${dateFrom}_${dateTo}`
        );
        toast({ title: "Export started", description: "Downloading Excel workbook." });
    };

    if (isLoading) {
        return (
            <div className="p-8 space-y-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Inventory Accounting Report</h1>
                    <p className="text-muted-foreground mt-1">
                        Comprehensive inventory valuation, COGS analysis, and turnover metrics
                    </p>
                </div>
                <div className="flex gap-2">
                    <ReportExportMenu getPayload={buildCategoryExport} disabled={!data} />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" type="button" disabled={!data}>
                                <Download className="mr-2 h-4 w-4" />
                                More
                                <ChevronDown className="ml-1 h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={exportFullWorkbook}>
                                Export full workbook (.xlsx)
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Date Range Filter */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-end gap-4">
                        <div className="flex-1 max-w-xs">
                            <Label htmlFor="date-from">From Date</Label>
                            <div className="relative mt-1">
                                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <Input
                                    id="date-from"
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        <div className="flex-1 max-w-xs">
                            <Label htmlFor="date-to">To Date</Label>
                            <div className="relative mt-1">
                                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <Input
                                    id="date-to"
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        <Button onClick={() => refetch()}>Update Report</Button>
                    </div>
                </CardContent>
            </Card>

            {data && (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-primary">
                                    {formatCurrency(data.inventory_summary.total_cost_value)}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {formatNumber(data.inventory_summary.total_parts)} parts | {formatNumber(data.inventory_summary.total_quantity)} units
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">COGS (Period)</CardTitle>
                                <Package className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-primary">
                                    {formatCurrency(data.cogs_analysis.cogs)}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {formatNumber(data.cogs_analysis.units_sold)} units sold | Avg: {formatCurrency(data.cogs_analysis.avg_cost_per_unit)}/unit
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Turnover Ratio</CardTitle>
                                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold ${data.cogs_analysis.inventory_turnover_ratio >= 4 ? 'text-success' : data.cogs_analysis.inventory_turnover_ratio >= 2 ? 'text-warning' : 'text-destructive'}`}>
                                    {data.cogs_analysis.inventory_turnover_ratio.toFixed(2)}x
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Target: 4-6x (Auto Parts)
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Days Inventory</CardTitle>
                                <Clock className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold ${data.cogs_analysis.days_inventory_outstanding <= 90 ? 'text-success' : data.cogs_analysis.days_inventory_outstanding <= 180 ? 'text-warning' : 'text-destructive'}`}>
                                    {data.cogs_analysis.days_inventory_outstanding.toFixed(0)} days
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Target: 60-90 days
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Potential Profit Summary */}
                    <Card className="bg-gradient-to-br from-success/10 to-info/10 dark:from-success/20 dark:to-info/20 border-2 border-success/20 dark:border-success/40">
                        <CardContent className="pt-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <div className="text-sm text-muted-foreground">Potential Selling Value</div>
                                    <div className="text-2xl font-bold text-success dark:text-success">
                                        {formatCurrency(data.inventory_summary.total_selling_value)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-muted-foreground">Potential Profit</div>
                                    <div className="text-2xl font-bold text-success">
                                        {formatCurrency(data.inventory_summary.potential_profit)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-muted-foreground">Potential Margin</div>
                                    <div className="text-2xl font-bold text-info dark:text-info">
                                        {data.inventory_summary.potential_margin_percent.toFixed(2)}%
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Breakdown by Category */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Inventory by Category</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {data.by_category && data.by_category.length > 0 ? (
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Category</TableHead>
                                                <TableHead className="text-right">Parts</TableHead>
                                                <TableHead className="text-right">Quantity</TableHead>
                                                <TableHead className="text-right">Cost Value</TableHead>
                                                <TableHead className="text-right">Selling Value</TableHead>
                                                <TableHead className="text-right">Potential Profit</TableHead>
                                                <TableHead className="text-right">Margin %</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {data.by_category.map((category) => (
                                                <TableRow key={category.category_id}>
                                                    <TableCell className="font-medium">{category.category_name}</TableCell>
                                                    <TableCell className="text-right">{formatNumber(category.parts_count)}</TableCell>
                                                    <TableCell className="text-right">{formatNumber(category.total_quantity)}</TableCell>
                                                    <TableCell className="text-right font-mono text-primary">
                                                        {formatCurrency(category.cost_value)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono">
                                                        {formatCurrency(category.selling_value)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-success">
                                                        {formatCurrency(category.potential_profit)}
                                                    </TableCell>
                                                    <TableCell className={`text-right font-bold ${category.margin_percent >= 30 ? 'text-success' : category.margin_percent >= 15 ? 'text-warning' : 'text-destructive'}`}>
                                                        {category.margin_percent.toFixed(2)}%
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    No category data available
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Stock Aging Analysis */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Stock Aging Analysis</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {data.stock_aging.map((aging, index) => {
                                    const total = data.inventory_summary.total_cost_value;
                                    const percentage = total > 0 ? (aging.value / total * 100) : 0;

                                    return (
                                        <div key={index} className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <span className="font-medium min-w-[120px]">{aging.age_range}</span>
                                                    <span className="text-sm text-muted-foreground">
                                                        {formatNumber(aging.parts_count)} parts
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="font-mono text-sm">
                                                        {formatCurrency(aging.value)}
                                                    </span>
                                                    <span className="text-sm text-muted-foreground min-w-[60px] text-right">
                                                        {percentage.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="w-full bg-border rounded-full h-2">
                                                <div
                                                    className={`h-2 rounded-full ${index === 0 ? 'bg-success' :
                                                        index === 1 ? 'bg-warning' :
                                                            index === 2 ? 'bg-primary' :
                                                                'bg-destructive'
                                                        }`}
                                                    style={{ width: `${percentage}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-6 p-4 bg-primary/10 dark:bg-warning/15 rounded-lg">
                                <p className="text-sm text-muted-foreground">
                                    <strong>Stock Aging Guide:</strong> 0-90 days (Fresh stock), 91-180 days (Normal turnover),
                                    181-365 days (Slow-moving - consider promotions), Over 365 days (Dead stock - consider write-off)
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
