"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Calendar, TrendingUp, TrendingDown } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface AccountItem {
    code: string;
    name: string;
    balance: number;
}

interface IncomeStatementData {
    operating: {
        revenues: AccountItem[];
        cogs: AccountItem[];
        expenses: AccountItem[];
        gross_profit: number;
        net_operating_income: number;
        net_operating_revenue: number;
        net_cogs: number;
        net_operating_expenses: number;
    };
    other: {
        revenues: AccountItem[];
        expenses: AccountItem[];
        net_other_revenues: number;
        net_other_expenses: number;
        net_other_income: number;
    };
    net_income: number;
}

export default function IncomeStatementPage() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    const [fromDate, setFromDate] = useState(firstDay.toISOString().split('T')[0]);
    const [toDate, setToDate] = useState(now.toISOString().split('T')[0]);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['income-statement', fromDate, toDate],
        queryFn: () => accountingApi.getIncomeStatement(fromDate, toDate),
    });

    const incomeData = data?.data as IncomeStatementData | undefined;

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
        }).format(amount);
    };

    const renderLineItems = (items: AccountItem[]) => {
        if (!items || items.length === 0) {
            return (
                <p className="text-sm text-muted-foreground italic pl-4">No items</p>
            );
        }
        return items.map((item) => (
            <div key={item.code} className="flex justify-between items-center py-2 pl-4 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-600 dark:text-gray-300">
                    {item.code} - {item.name}
                </span>
                <span className="font-mono text-sm">
                    {formatCurrency(item.balance)}
                </span>
            </div>
        ));
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
                    <h1 className="text-3xl font-bold">Income Statement</h1>
                    <p className="text-muted-foreground mt-1">
                        {data?.entity_name} • {data?.from_date} to {data?.to_date}
                    </p>
                </div>
                <Button variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Export PDF
                </Button>
            </div>

            {/* Date Range Filter */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-end gap-4">
                        <div className="flex-1 max-w-xs">
                            <Label htmlFor="from-date">From Date</Label>
                            <div className="relative mt-1">
                                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <Input
                                    id="from-date"
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        <div className="flex-1 max-w-xs">
                            <Label htmlFor="to-date">To Date</Label>
                            <div className="relative mt-1">
                                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <Input
                                    id="to-date"
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        <Button onClick={() => refetch()}>
                            Update
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Income Statement */}
            <Card>
                <CardHeader>
                    <CardTitle>Profit & Loss Statement</CardTitle>
                </CardHeader>
                <CardContent>
                    {incomeData ? (
                        <div className="space-y-6">
                            {/* Operating Revenue */}
                            <div>
                                <h3 className="text-lg font-semibold mb-3 text-blue-600 dark:text-blue-400">Operating Revenue</h3>
                                {renderLineItems(incomeData.operating.revenues)}
                                <div className="flex justify-between items-center py-3 mt-2 border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                                    <span>Total Operating Revenue</span>
                                    <span className="font-mono text-green-600 dark:text-green-400">
                                        {formatCurrency(incomeData.operating.net_operating_revenue)}
                                    </span>
                                </div>
                            </div>

                            {/* Cost of Goods Sold */}
                            <div>
                                <h3 className="text-lg font-semibold mb-3 text-orange-600 dark:text-orange-400">Cost of Goods Sold (COGS)</h3>
                                {renderLineItems(incomeData.operating.cogs)}
                                <div className="flex justify-between items-center py-3 mt-2 border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                                    <span>Total COGS</span>
                                    <span className="font-mono text-red-600 dark:text-red-400">
                                        {formatCurrency(incomeData.operating.net_cogs)}
                                    </span>
                                </div>
                            </div>

                            {/* Gross Profit */}
                            <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                                <div className="flex justify-between items-center">
                                    <span className="text-lg font-bold">Gross Profit</span>
                                    <span className={`text-xl font-bold font-mono ${incomeData.operating.gross_profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {formatCurrency(incomeData.operating.gross_profit)}
                                    </span>
                                </div>
                            </div>

                            {/* Operating Expenses */}
                            <div>
                                <h3 className="text-lg font-semibold mb-3 text-purple-600 dark:text-purple-400">Operating Expenses</h3>
                                {renderLineItems(incomeData.operating.expenses)}
                                <div className="flex justify-between items-center py-3 mt-2 border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                                    <span>Total Operating Expenses</span>
                                    <span className="font-mono text-red-600 dark:text-red-400">
                                        {formatCurrency(incomeData.operating.net_operating_expenses)}
                                    </span>
                                </div>
                            </div>

                            {/* Net Operating Income */}
                            <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                                <div className="flex justify-between items-center">
                                    <span className="text-lg font-bold">Net Operating Income</span>
                                    <span className={`text-xl font-bold font-mono ${incomeData.operating.net_operating_income >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {formatCurrency(incomeData.operating.net_operating_income)}
                                    </span>
                                </div>
                            </div>

                            {/* Other Income/Expenses */}
                            {(incomeData.other.revenues.length > 0 || incomeData.other.expenses.length > 0) && (
                                <>
                                    <div>
                                        <h3 className="text-lg font-semibold mb-3 text-teal-600 dark:text-teal-400">Other Income</h3>
                                        {renderLineItems(incomeData.other.revenues)}
                                        <div className="flex justify-between items-center py-3 mt-2 border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                                            <span>Total Other Income</span>
                                            <span className="font-mono text-green-600 dark:text-green-400">
                                                {formatCurrency(incomeData.other.net_other_revenues)}
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-lg font-semibold mb-3 text-red-600 dark:text-red-400">Other Expenses</h3>
                                        {renderLineItems(incomeData.other.expenses)}
                                        <div className="flex justify-between items-center py-3 mt-2 border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                                            <span>Total Other Expenses</span>
                                            <span className="font-mono text-red-600 dark:text-red-400">
                                                {formatCurrency(incomeData.other.net_other_expenses)}
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Net Income */}
                            <div className="mt-8 p-6 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 rounded-lg border-2 border-emerald-200 dark:border-emerald-800">
                                <div className="flex justify-between items-center">
                                    <span className="text-2xl font-bold">Net Income</span>
                                    <span className={`text-3xl font-bold font-mono flex items-center gap-3 ${incomeData.net_income >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {incomeData.net_income >= 0 ? (
                                            <TrendingUp className="w-8 h-8" />
                                        ) : (
                                            <TrendingDown className="w-8 h-8" />
                                        )}
                                        {formatCurrency(incomeData.net_income)}
                                    </span>
                                </div>

                                {incomeData.net_income === 0 && (
                                    <p className="text-sm text-muted-foreground text-center mt-4">
                                        No revenue or expenses recorded for this period. Start by creating invoices and recording payments.
                                    </p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            No data available for the selected period.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
