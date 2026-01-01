"use client";

import { useState } from "react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
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
import { Download, Calendar, Package, TrendingUp, DollarSign, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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

    const { data, isLoading, refetch } = useQuery<InventoryAccountingData>({
        queryKey: ['inventory-accounting', dateFrom, dateTo],
        queryFn: async () => {
            const response = await axios.get(
                `/api/inventory/parts/inventory_accounting_report/?date_from=${dateFrom}&date_to=${dateTo}`
            );
            return response.data;
        },
    });

    const { formatCurrency } = useCurrency();

    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('en-US').format(num);
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
                <Button variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                </Button>
            </div>

            {/* Date Range Filter */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-end gap-4">
                        <div className="flex-1 max-w-xs">
                            <Label htmlFor="date-from">From Date</Label>
                            <div className="relative mt-1">
                                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
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
                                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
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
                                <div className="text-2xl font-bold text-blue-600">
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
                                <div className="text-2xl font-bold text-orange-600">
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
                                <div className={`text-2xl font-bold ${data.cogs_analysis.inventory_turnover_ratio >= 4 ? 'text-green-600' : data.cogs_analysis.inventory_turnover_ratio >= 2 ? 'text-yellow-600' : 'text-red-600'}`}>
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
                                <div className={`text-2xl font-bold ${data.cogs_analysis.days_inventory_outstanding <= 90 ? 'text-green-600' : data.cogs_analysis.days_inventory_outstanding <= 180 ? 'text-yellow-600' : 'text-red-600'}`}>
                                    {data.cogs_analysis.days_inventory_outstanding.toFixed(0)} days
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Target: 60-90 days
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Potential Profit Summary */}
                    <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 border-2 border-emerald-200 dark:border-emerald-800">
                        <CardContent className="pt-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <div className="text-sm text-muted-foreground">Potential Selling Value</div>
                                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                        {formatCurrency(data.inventory_summary.total_selling_value)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-muted-foreground">Potential Profit</div>
                                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                        {formatCurrency(data.inventory_summary.potential_profit)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-muted-foreground">Potential Margin</div>
                                    <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
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
                                                    <TableCell className="text-right font-mono text-blue-600">
                                                        {formatCurrency(category.cost_value)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono">
                                                        {formatCurrency(category.selling_value)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-green-600">
                                                        {formatCurrency(category.potential_profit)}
                                                    </TableCell>
                                                    <TableCell className={`text-right font-bold ${category.margin_percent >= 30 ? 'text-green-600' : category.margin_percent >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
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
                                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                                <div
                                                    className={`h-2 rounded-full ${index === 0 ? 'bg-green-500' :
                                                        index === 1 ? 'bg-yellow-500' :
                                                            index === 2 ? 'bg-orange-500' :
                                                                'bg-red-500'
                                                        }`}
                                                    style={{ width: `${percentage}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
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
