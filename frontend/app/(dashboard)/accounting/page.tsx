"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown, FileText, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function AccountingDashboard() {
    // Fetch key data
    const { data: balances, isLoading: balancesLoading } = useQuery({
        queryKey: ['account-balances'],
        queryFn: () => accountingApi.getAccountBalances(),
    });

    const { data: trialBalance, isLoading: trialLoading } = useQuery({
        queryKey: ['trial-balance'],
        queryFn: () => accountingApi.getTrialBalance(),
    });

    const { data: incomeStatement, isLoading: incomeLoading } = useQuery({
        queryKey: ['income-statement-summary'],
        queryFn: () => {
            const now = new Date();
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            return accountingApi.getIncomeStatement(
                firstDay.toISOString().split('T')[0],
                now.toISOString().split('T')[0]
            );
        },
    });

    // Calculate KPIs from balances
    const calculateKPIs = () => {
        if (!balances?.balances) return { assets: 0, liabilities: 0, equity: 0, cash: 0 };

        let assets = 0;
        let liabilities = 0;
        let equity = 0;
        let cash = 0;

        balances.balances.forEach((account) => {
            const balance = parseFloat(account.balance || '0');

            if (account.account_role === 'ASSET') {
                assets += balance;
                if (account.account_code === '1110') { // Cash account
                    cash = balance;
                }
            } else if (account.account_role === 'LIABILITY') {
                liabilities += balance;
            } else if (account.account_role === 'EQUITY') {
                equity += balance;
            }
        });

        return { assets, liabilities, equity, cash };
    };

    const kpis = calculateKPIs();

    // Calculate revenue and expenses from income statement data
    const calculateIncomeData = () => {
        if (!incomeStatement?.data) return { revenue: 0, expenses: 0, netIncome: 0 };

        // This is a simplified version - adjust based on actual Django Ledger response structure
        let revenue = 0;
        let expenses = 0;

        balances?.balances?.forEach((account) => {
            const balance = parseFloat(account.balance || '0');
            if (account.account_role === 'INCOME') {
                revenue += Math.abs(balance);
            } else if (account.account_role === 'EXPENSE') {
                expenses += Math.abs(balance);
            }
        });

        return { revenue, expenses, netIncome: revenue - expenses };
    };

    const incomeData = calculateIncomeData();

    // Prepare chart data
    const assetLiabilityData = [
        { name: 'Assets', value: kpis.assets },
        { name: 'Liabilities', value: kpis.liabilities },
        { name: 'Equity', value: kpis.equity },
    ];

    const incomeExpenseData = [
        { name: 'Revenue', amount: incomeData.revenue },
        { name: 'Expenses', amount: incomeData.expenses },
    ];

    const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B'];

    if (balancesLoading || trialLoading) {
        return (
            <div className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[...Array(4)].map((_, i) => (
                        <Card key={i}>
                            <CardContent className="pt-6">
                                <Skeleton className="h-24" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold">Accounting Dashboard</h1>
                <p className="text-muted-foreground mt-1">
                    Financial overview and key metrics for {balances?.entity_name || 'your organization'}
                </p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Assets */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total Assets
                        </CardTitle>
                        <TrendingUp className="h-5 w-5 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-green-600">
                            ${kpis.assets.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Current total assets
                        </p>
                    </CardContent>
                </Card>

                {/* Total Liabilities */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total Liabilities
                        </CardTitle>
                        <TrendingDown className="h-5 w-5 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-red-600">
                            ${kpis.liabilities.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Current total liabilities
                        </p>
                    </CardContent>
                </Card>

                {/* Equity */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total Equity
                        </CardTitle>
                        <DollarSign className="h-5 w-5 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-blue-600">
                            ${kpis.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Assets - Liabilities
                        </p>
                    </CardContent>
                </Card>

                {/* Cash Balance */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Cash Balance
                        </CardTitle>
                        <DollarSign className="h-5 w-5 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">
                            ${kpis.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Available cash
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Balance Sheet Overview */}
                <Card>
                    <CardHeader>
                        <CardTitle>Balance Sheet Overview</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={assetLiabilityData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, value }) => `${name}: $${value.toLocaleString()}`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {assetLiabilityData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: any) => `$${parseFloat(value).toLocaleString()}`} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Income vs Expenses */}
                <Card>
                    <CardHeader>
                        <CardTitle>Revenue vs Expenses (MTD)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={incomeExpenseData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip formatter={(value: any) => `$${parseFloat(value).toLocaleString()}`} />
                                <Legend />
                                <Bar dataKey="amount" fill="#3B82F6" />
                            </BarChart>
                        </ResponsiveContainer>
                        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Net Income:</span>
                                <span className={`text-lg font-bold ${incomeData.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    ${incomeData.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Links */}
            <Card>
                <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Link href="/accounting/journal-entries/new">
                            <Button variant="outline" className="w-full justify-between h-auto py-4">
                                <div className="flex items-center gap-3">
                                    <FileText className="h-5 w-5" />
                                    <div className="text-left">
                                        <div className="font-semibold">New Journal Entry</div>
                                        <div className="text-xs text-muted-foreground">Create manual entry</div>
                                    </div>
                                </div>
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>

                        <Link href="/accounting/reports/trial-balance">
                            <Button variant="outline" className="w-full justify-between h-auto py-4">
                                <div className="flex items-center gap-3">
                                    <FileText className="h-5 w-5" />
                                    <div className="text-left">
                                        <div className="font-semibold">Trial Balance</div>
                                        <div className="text-xs text-muted-foreground">View trial balance</div>
                                    </div>
                                </div>
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>

                        <Link href="/accounting/reports/income-statement">
                            <Button variant="outline" className="w-full justify-between h-auto py-4">
                                <div className="flex items-center gap-3">
                                    <FileText className="h-5 w-5" />
                                    <div className="text-left">
                                        <div className="font-semibold">Income Statement</div>
                                        <div className="text-xs text-muted-foreground">P&L report</div>
                                    </div>
                                </div>
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>

                        <Link href="/accounting/accounts">
                            <Button variant="outline" className="w-full justify-between h-auto py-4">
                                <div className="flex items-center gap-3">
                                    <FileText className="h-5 w-5" />
                                    <div className="text-left">
                                        <div className="font-semibold">Chart of Accounts</div>
                                        <div className="text-xs text-muted-foreground">Browse accounts</div>
                                    </div>
                                </div>
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>

            {/* Trial Balance Summary */}
            {trialBalance && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Trial Balance Status</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                As of {trialBalance.as_of_date}
                            </p>
                        </div>
                        <Link href="/accounting/reports/trial-balance">
                            <Button variant="outline">
                                View Full Report
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                <div className="text-sm font-medium text-blue-600 dark:text-blue-400">Total Debits</div>
                                <div className="text-2xl font-bold mt-1">${parseFloat(trialBalance.total_debit).toLocaleString()}</div>
                            </div>
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                <div className="text-sm font-medium text-red-600 dark:text-red-400">Total Credits</div>
                                <div className="text-2xl font-bold mt-1">${parseFloat(trialBalance.total_credit).toLocaleString()}</div>
                            </div>
                            <div className={`p-4 rounded-lg ${trialBalance.balanced
                                    ? 'bg-green-50 dark:bg-green-900/20'
                                    : 'bg-red-50 dark:bg-red-900/20'
                                }`}>
                                <div className={`text-sm font-medium ${trialBalance.balanced
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-red-600 dark:text-red-400'
                                    }`}>
                                    Status
                                </div>
                                <div className="text-2xl font-bold mt-1">
                                    {trialBalance.balanced ? '✓ Balanced' : '✗ Unbalanced'}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
