"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowUpRight, ArrowDownRight, DollarSign, Wallet, Activity, CreditCard, TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend
} from "recharts";
import { Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function ManagementDashboardPage() {
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], // First day of current month
        end: new Date().toISOString().split('T')[0] // Today
    });

    const { data, isLoading, error } = useQuery({
        queryKey: ["managementMetrics", dateRange],
        queryFn: () => accountingApi.getManagementMetrics(dateRange.start, dateRange.end),
    });

    if (isLoading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-96 items-center justify-center text-red-500">
                <AlertCircle className="mr-2 h-5 w-5" />
                Failed to load dashboard data
            </div>
        );
    }

    const { kpis, top_expenses, top_jobs } = data;

    // Colors for charts
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    };

    const formatPercent = (val: number) => {
        return `${val.toFixed(1)}%`;
    }

    return (
        <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Executive Dashboard</h1>
                    <p className="text-muted-foreground mt-1">
                        Financial performance overview for {format(new Date(dateRange.start), 'MMM d')} - {format(new Date(dateRange.end), 'MMM d, yyyy')}
                    </p>
                </div>
                {/* Future: Date Range Picker Component */}
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                        // Reset to MTD
                        setDateRange({
                            start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
                            end: new Date().toISOString().split('T')[0]
                        });
                    }}>MTD</Button>
                    <Button variant="outline" size="sm" onClick={() => {
                        // YTD
                        setDateRange({
                            start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
                            end: new Date().toISOString().split('T')[0]
                        });
                    }}>YTD</Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    title="Net Income"
                    value={kpis.net_income}
                    icon={Activity}
                    trend={kpis.net_income > 0 ? "positive" : "negative"}
                    description="Net Profit (Loss)"
                />
                <KpiCard
                    title="Revenue"
                    value={kpis.revenue}
                    icon={DollarSign}
                    trend="neutral"
                    description="Total Income"
                />
                <KpiCard
                    title="Cash on Hand"
                    value={kpis.cash_balance}
                    icon={Wallet}
                    trend="neutral"
                    description="Bank & Cash Accounts"
                />
                <KpiCard
                    title="Avg Job Margin"
                    value={kpis.avg_job_margin}
                    isPercent
                    icon={TrendingUp}
                    trend={kpis.avg_job_margin > 30 ? "positive" : "neutral"}
                    description="Gross Profit Margin"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard
                    title="Total Expenses"
                    value={kpis.expenses}
                    icon={ArrowDownRight}
                    trend="negative" // Expenses typically negative impact, but here just neutral or based on comparison
                    description="Operating Expenses"
                />
                <KpiCard
                    title="AR Outstanding"
                    value={kpis.ar_outstanding}
                    icon={CreditCard}
                    trend="neutral"
                    description="Unpaid Invoices"
                />
                <KpiCard
                    title="AP Outstanding"
                    value={kpis.ap_outstanding}
                    icon={CreditCard}
                    trend="neutral"
                    description="Unpaid Bills"
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Expenses */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Top Expenses</CardTitle>
                        <CardDescription>Highest spending categories</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={top_expenses}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="amount"
                                >
                                    {top_expenses.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Job Profitability Table (Top 5) */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Top Jobs by Profit</CardTitle>
                        <CardDescription>Most profitable completed work orders</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Job</TableHead>
                                    <TableHead className="text-right">Revenue</TableHead>
                                    <TableHead className="text-right">Profit</TableHead>
                                    <TableHead className="text-right">Margin</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {top_jobs.map((job: any) => (
                                    <TableRow key={job.work_order_id}>
                                        <TableCell>
                                            <div className="font-medium">{job.work_order_number}</div>
                                            <div className="text-xs text-muted-foreground">{job.vehicle}</div>
                                        </TableCell>
                                        <TableCell className="text-right">{formatCurrency(job.revenue)}</TableCell>
                                        <TableCell className="text-right">
                                            <span className="text-green-600 font-medium">
                                                {formatCurrency(job.gross_profit)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant={job.margin_percent > 40 ? "secondary" : "outline"}>
                                                {formatPercent(job.margin_percent)}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function KpiCard({ title, value, icon: Icon, description, trend, isPercent = false }: any) {
    const formattedValue = isPercent
        ? `${value.toFixed(1)}%`
        : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                    {title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold ${trend === 'positive' ? 'text-green-600' : trend === 'negative' ? 'text-red-600' : ''}`}>
                    {formattedValue}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                    {description}
                </p>
            </CardContent>
        </Card>
    );
}
