"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Calendar, Wallet, Building2, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface AccountGroup {
    [key: string]: {
        balance: number;
        accounts?: Array<{
            code: string;
            name: string;
            balance: number;
        }>;
    };
}

interface BalanceSheetData {
    assets?: AccountGroup;
    liabilities?: AccountGroup;
    equity?: AccountGroup;
    total_assets?: number;
    total_liabilities?: number;
    total_equity?: number;
    equity_balance?: number;
    retained_earnings_balance?: number;
    liabilities_equity_balance?: number;
}

export default function BalanceSheetPage() {
    const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['balance-sheet', asOfDate],
        queryFn: () => accountingApi.getBalanceSheet(asOfDate),
    });

    const balanceSheetData = data?.data as BalanceSheetData | undefined;

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
        }).format(amount);
    };

    const renderAccountGroup = (title: string, group: AccountGroup | undefined, color: string) => {
        if (!group || Object.keys(group).length === 0) {
            return (
                <div className="mb-6">
                    <h3 className={`text-lg font-semibold mb-3 ${color}`}>{title}</h3>
                    <p className="text-sm text-muted-foreground italic pl-4">No accounts</p>
                </div>
            );
        }

        let total = 0;
        const items: JSX.Element[] = [];

        Object.entries(group).forEach(([key, value]) => {
            if (typeof value === 'object' && value !== null && 'balance' in value) {
                total += value.balance || 0;
                items.push(
                    <div key={key} className="py-2 pl-4 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                                {value.description || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </span>
                            <span className="font-mono text-sm">
                                {formatCurrency(value.balance)}
                            </span>
                        </div>
                        {value.accounts && value.accounts.length > 0 && (
                            <div className="mt-2 pl-4 space-y-1">
                                {value.accounts.map((account) => (
                                    <div key={account.code} className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                        <span>{account.code} - {account.name}</span>
                                        <span className="font-mono">{formatCurrency(account.balance)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            }
        });

        return (
            <div className="mb-6">
                <h3 className={`text-lg font-semibold mb-3 ${color}`}>{title}</h3>
                {items}
                <div className="flex justify-between items-center py-3 mt-2 border-t-2 border-gray-300 dark:border-gray-600 font-bold">
                    <span>Total {title}</span>
                    <span className="font-mono text-lg">
                        {formatCurrency(total)}
                    </span>
                </div>
            </div>
        );
    };

    if (isLoading) {
        return (
            <div className="p-8 space-y-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }

    // Calculate totals
    const totalEquity = (balanceSheetData?.equity_balance || 0) + (balanceSheetData?.retained_earnings_balance || 0);
    const totalLiabilitiesEquity = balanceSheetData?.liabilities_equity_balance || 0;

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Balance Sheet</h1>
                    <p className="text-muted-foreground mt-1">
                        {data?.entity_name} • As of {data?.to_date}
                    </p>
                </div>
                <Button variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Export PDF
                </Button>
            </div>

            {/* Date Filter */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-end gap-4">
                        <div className="flex-1 max-w-xs">
                            <Label htmlFor="as-of-date">As of Date</Label>
                            <div className="relative mt-1">
                                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <Input
                                    id="as-of-date"
                                    type="date"
                                    value={asOfDate}
                                    onChange={(e) => setAsOfDate(e.target.value)}
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

            {/* Balance Sheet */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Assets */}
                <Card>
                    <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950 dark:to-cyan-950">
                        <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                            <Wallet className="w-5 h-5" />
                            Assets
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        {balanceSheetData?.assets ? (
                            renderAccountGroup("Current Assets", balanceSheetData.assets, "text-blue-600 dark:text-blue-400")
                        ) : (
                            <div className="space-y-4">
                                <div className="text-center py-8 text-muted-foreground">
                                    <p className="text-sm">No asset accounts configured yet.</p>
                                    <p className="text-xs mt-2">Assets will appear here once you start recording transactions.</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Liabilities & Equity */}
                <div className="space-y-6">
                    {/* Liabilities */}
                    <Card>
                        <CardHeader className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950 dark:to-red-950">
                            <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                                <Building2 className="w-5 h-5" />
                                Liabilities
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            {balanceSheetData?.liabilities ? (
                                renderAccountGroup("Current Liabilities", balanceSheetData.liabilities, "text-orange-600 dark:text-orange-400")
                            ) : (
                                <div className="text-center py-6 text-muted-foreground">
                                    <p className="text-sm">No liabilities recorded.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Equity */}
                    <Card>
                        <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950">
                            <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                                <TrendingUp className="w-5 h-5" />
                                Equity
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                                    <span className="text-sm text-gray-600 dark:text-gray-300">Owner's Equity</span>
                                    <span className="font-mono text-sm">
                                        {formatCurrency(balanceSheetData?.equity_balance || 0)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                                    <span className="text-sm text-gray-600 dark:text-gray-300">Retained Earnings</span>
                                    <span className="font-mono text-sm">
                                        {formatCurrency(balanceSheetData?.retained_earnings_balance || 0)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-3 mt-2 border-t-2 border-gray-300 dark:border-gray-600 font-bold">
                                    <span>Total Equity</span>
                                    <span className="font-mono text-lg text-emerald-600 dark:text-emerald-400">
                                        {formatCurrency(totalEquity)}
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Balance Equation */}
            <Card>
                <CardHeader>
                    <CardTitle>Accounting Equation</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 p-6 rounded-lg border-2 border-purple-200 dark:border-purple-800">
                        <div className="flex items-center justify-center gap-4 text-lg font-semibold flex-wrap">
                            <div className="text-center">
                                <div className="text-sm text-muted-foreground mb-1">Assets</div>
                                <div className="font-mono text-blue-600 dark:text-blue-400">
                                    {formatCurrency(balanceSheetData?.total_assets || 0)}
                                </div>
                            </div>
                            <div className="text-2xl text-muted-foreground">=</div>
                            <div className="text-center">
                                <div className="text-sm text-muted-foreground mb-1">Liabilities</div>
                                <div className="font-mono text-orange-600 dark:text-orange-400">
                                    {formatCurrency(balanceSheetData?.total_liabilities || 0)}
                                </div>
                            </div>
                            <div className="text-2xl text-muted-foreground">+</div>
                            <div className="text-center">
                                <div className="text-sm text-muted-foreground mb-1">Equity</div>
                                <div className="font-mono text-emerald-600 dark:text-emerald-400">
                                    {formatCurrency(totalEquity)}
                                </div>
                            </div>
                        </div>

                        {totalEquity === 0 && totalLiabilitiesEquity === 0 && (
                            <p className="text-sm text-muted-foreground text-center mt-6">
                                Your balance sheet is empty. Start by recording initial capital, creating invoices, and making purchases to see your financial position.
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
