"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, startOfYear } from "date-fns";
import { useRouter } from "next/navigation";
import {
    DollarSign,
    TrendingUp,
    Wallet,
    PieChart as PieChartIcon,
    FileText,
    ArrowRight,
    Plus,
    Activity
} from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useBranchStore } from "@/store/branchStore";

export default function AccountingDashboardPage() {
    const router = useRouter();
    const { formatCurrency } = useCurrency();
    const { activeBranchId } = useBranchStore();
    const today = format(new Date(), "yyyy-MM-dd");
    const startYear = format(startOfYear(new Date()), "yyyy-MM-dd");

    // Fetch Balance Sheet for Snapshot
    const { data: bsData, isLoading: bsLoading } = useQuery({
        queryKey: ["accounting", "balance-sheet", today, activeBranchId],
        queryFn: () => accountingApi.getBalanceSheet(today),
    });

    // Fetch P&L for Performance
    const { data: plData, isLoading: plLoading } = useQuery({
        queryKey: ["accounting", "profit-loss", startYear, today, activeBranchId],
        queryFn: () => accountingApi.getProfitLoss(startYear, today, activeBranchId || undefined),
    });

    // Helper to find specific account balance by partial name
    const findBalance = (report: any, section: string, namePart: string) => {
        if (!report || !report[section]) return 0;
        const account = report[section].find((a: any) => a.name.toLowerCase().includes(namePart.toLowerCase()));
        return account ? account.balance : 0;
    };

    const cashBalance = bsData ? findBalance(bsData, 'assets', 'cash') + findBalance(bsData, 'assets', 'bank') : 0;
    const loading = bsLoading || plLoading;

    return (
        <div className="space-y-4">
            {/* Header - Compact */}
            <div className="flex justify-between items-center pt-2">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Financial Overview</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Real-time financial insights
                    </p>
                </div>
                <Button onClick={() => router.push("/accounting/journal-entries/new")} size="sm" className="h-9">
                    <Plus className="w-4 h-4 mr-2" />
                    New Entry
                </Button>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-24 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Card className="border shadow-sm">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cash on Hand</p>
                                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
                                        {formatCurrency(cashBalance)}
                                    </p>
                                </div>
                                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                    <Wallet className="w-5 h-5 text-green-600 dark:text-green-400" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border shadow-sm">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Income (YTD)</p>
                                    <p className={`text-lg font-bold mt-1 ${plData && plData.totals.net_income >= 0 ? "text-green-600" : "text-red-600"}`}>
                                        {formatCurrency(plData?.totals.net_income || 0)}
                                    </p>
                                </div>
                                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                    <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border shadow-sm">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue (YTD)</p>
                                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
                                        {formatCurrency(plData?.totals.income || 0)}
                                    </p>
                                </div>
                                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                    <DollarSign className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border shadow-sm">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Expenses (YTD)</p>
                                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
                                        {formatCurrency(plData?.totals.expenses || 0)}
                                    </p>
                                </div>
                                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                                    <PieChartIcon className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Reports Section - Categorized - Compact */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-blue-500 shadow-sm" onClick={() => router.push("/accounting/reports/balance-sheet")}>
                            <CardContent className="p-3">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Balance Sheet</h3>
                                        <p className="text-xs text-gray-500 mt-1">Assets, liabilities, and equity snapshot</p>
                                    </div>
                                    <FileText className="w-4 h-4 text-blue-500" />
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-green-500 shadow-sm" onClick={() => router.push("/accounting/reports/profit-loss")}>
                            <CardContent className="p-3">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Profit & Loss</h3>
                                        <p className="text-xs text-gray-500 mt-1">Income, expenses, and net profit</p>
                                    </div>
                                    <TrendingUp className="w-4 h-4 text-green-500" />
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-purple-500 shadow-sm" onClick={() => router.push("/accounting/reports/cash-flow")}>
                            <CardContent className="p-3">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Cash Flow</h3>
                                        <p className="text-xs text-gray-500 mt-1">Inflows and outflows analysis</p>
                                    </div>
                                    <Activity className="w-4 h-4 text-purple-500" />
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-orange-500 shadow-sm" onClick={() => router.push("/accounting/reports/aging")}>
                            <CardContent className="p-3">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Aging Reports</h3>
                                        <p className="text-xs text-gray-500 mt-1">Overdue payables and receivables</p>
                                    </div>
                                    <FileText className="w-4 h-4 text-orange-500" />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Recent Transactions - Compact */}
                <div className="lg:col-span-1">
                    <Card className="h-full border shadow-sm">
                        <CardHeader className="p-3 border-b border-gray-100 dark:border-gray-800">
                            <CardTitle className="text-sm font-semibold">Recent Transactions</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <RecentActivityList />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function RecentActivityList() {
    const { activeBranchId } = useBranchStore();
    const { data: transactions, isLoading } = useQuery({
        queryKey: ["accounting", "recent-transactions", activeBranchId],
        queryFn: () => accountingApi.getRecentTransactions(),
    });

    if (isLoading) return <div className="p-4 text-xs text-gray-500">Loading recent activity...</div>;
    if (!transactions || transactions.length === 0) return <div className="p-4 text-xs text-gray-500">No recent transactions.</div>;

    return (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {transactions.slice(0, 5).map((tx: any) => (
                <div key={tx.id} className="p-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="flex justify-between items-start mb-1">
                        <p className="text-xs font-medium text-gray-900 dark:text-white line-clamp-1">{tx.description || "Journal Entry"}</p>
                        <span className="text-[10px] font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400">
                            {tx.transactions?.length || 0} Lines
                        </span>
                    </div>
                    <p className="text-[10px] text-gray-500 flex justify-between">
                        <span>{tx.date}</span>
                        <span>{tx.reference || "No Ref"}</span>
                    </p>
                </div>
            ))}
            <div className="p-2 text-center border-t border-gray-100 dark:border-gray-800">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-blue-600 hover:text-blue-700 w-full" onClick={() => window.location.href = '/accounting/journal-entries'}>
                    View All Transactions <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
            </div>
        </div>
    );
}
