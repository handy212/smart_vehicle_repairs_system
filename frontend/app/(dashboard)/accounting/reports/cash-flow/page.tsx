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

interface CashFlowGroup {
    description: string;
    balance: number;
}

interface CashFlowData {
    operating: Record<string, CashFlowGroup>;
    financing: Record<string, CashFlowGroup>;
    investing: Record<string, CashFlowGroup>;
    net_cash_by_activity: {
        OPERATING: number;
        FINANCING: number;
        INVESTING: number;
    };
    net_income: number;
    net_cash: number;
}

export default function CashFlowPage() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    const [fromDate, setFromDate] = useState(firstDay.toISOString().split('T')[0]);
    const [toDate, setToDate] = useState(now.toISOString().split('T')[0]);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['cash-flow', fromDate, toDate],
        queryFn: () => accountingApi.getCashFlowStatement(fromDate, toDate),
    });

    const cashFlowData = data?.data as CashFlowData | undefined;

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
        }).format(amount);
    };

    const renderSection = (title: string, items: Record<string, CashFlowGroup>, total: number) => (
        <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4 text-blue-600 dark:text-blue-400">{title}</h3>
            <div className="space-y-2">
                {Object.entries(items).map(([key, item]) => (
                    <div key={key} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                        <span className="text-sm text-gray-600 dark:text-gray-300">{item.description}</span>
                        <span className={`font-mono text-sm ${item.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatCurrency(item.balance)}
                        </span>
                    </div>
                ))}
                <div className="flex justify-between items-center py-3 mt-3 border-t-2 border-gray-300 dark:border-gray-600">
                    <span className="font-semibold">Net Cash from {title}</span>
                    <span className={`font-mono font-bold ${total >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatCurrency(total)}
                    </span>
                </div>
            </div>
        </div>
    );

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
                    <h1 className="text-3xl font-bold">Statement of Cash Flows</h1>
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

            {/* Cash Flow Statement */}
            <Card>
                <CardHeader>
                    <CardTitle>Cash Flow Statement</CardTitle>
                </CardHeader>
                <CardContent>
                    {cashFlowData ? (
                        <div className="space-y-6">
                            {/* Operating Activities */}
                            {renderSection(
                                "Operating Activities",
                                cashFlowData.operating,
                                cashFlowData.net_cash_by_activity.OPERATING
                            )}

                            {/* Investing Activities */}
                            {renderSection(
                                "Investing Activities",
                                cashFlowData.investing,
                                cashFlowData.net_cash_by_activity.INVESTING
                            )}

                            {/* Financing Activities */}
                            {renderSection(
                                "Financing Activities",
                                cashFlowData.financing,
                                cashFlowData.net_cash_by_activity.FINANCING
                            )}

                            {/* Summary */}
                            <div className="mt-8 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 rounded-lg border-2 border-blue-200 dark:border-blue-800">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-lg font-semibold">Net Increase in Cash</span>
                                        <span className={`text-2xl font-bold font-mono flex items-center gap-2 ${cashFlowData.net_cash >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                            {cashFlowData.net_cash >= 0 ? (
                                                <TrendingUp className="w-6 h-6" />
                                            ) : (
                                                <TrendingDown className="w-6 h-6" />
                                            )}
                                            {formatCurrency(cashFlowData.net_cash)}
                                        </span>
                                    </div>

                                    {cashFlowData.net_cash === 0 && (
                                        <p className="text-sm text-muted-foreground text-center mt-4">
                                            No cash flow activity for the selected period. This is typical when starting a new accounting system.
                                        </p>
                                    )}
                                </div>
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
