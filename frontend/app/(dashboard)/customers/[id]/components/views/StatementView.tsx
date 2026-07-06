"use client";

import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { Card, CardContent } from "@/components/ui/card";
import { StatsGrid } from "@/components/shared/StatsGrid";
import { format, startOfMonth, startOfYear } from "date-fns";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StatementViewProps {
    customerId: number;
}

function getPeriodDates(period: string): { start: string; end: string } {
    const today = new Date();
    const end = format(today, "yyyy-MM-dd");
    if (period === "this_month") {
        return { start: format(startOfMonth(today), "yyyy-MM-dd"), end };
    }
    if (period === "last_month") {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        return {
            start: format(lastMonth, "yyyy-MM-dd"),
            end: format(lastMonthEnd, "yyyy-MM-dd"),
        };
    }
    if (period === "this_year") {
        return { start: format(startOfYear(today), "yyyy-MM-dd"), end };
    }
    return { start: "2000-01-01", end };
}

export function StatementView({ customerId }: StatementViewProps) {
    const { formatCurrency } = useCurrency();
    const [period, setPeriod] = useState("all_time");
    const periodDates = useMemo(() => getPeriodDates(period), [period]);

    const { data: statement, isLoading } = useQuery({
        queryKey: ["customer-statement", customerId, periodDates.start, periodDates.end],
        queryFn: () =>
            customersApi.statement(customerId, {
                start_date: periodDates.start,
                end_date: periodDates.end,
            }),
    });

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
    }

    const stats = [
        { label: "Opening Balance", value: formatCurrency(statement?.opening_balance ?? 0) },
        { label: "Period Charges", value: formatCurrency(statement?.period_debits ?? 0), color: "text-primary" },
        { label: "Period Credits", value: formatCurrency(statement?.period_credits ?? 0), color: "text-success" },
        { label: "Closing Balance", value: formatCurrency(statement?.closing_balance ?? 0), color: "text-destructive" },
    ];

    const transactions = statement?.transactions ?? [];

    const handleDownloadPdf = async () => {
        const blob = await customersApi.statementPdf(customerId, {
            start_date: periodDates.start,
            end_date: periodDates.end,
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `customer_statement_${customerId}_${periodDates.end}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center gap-3">
                <h2 className="text-lg font-semibold">Account Statement</h2>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                        <Download className="h-4 w-4 mr-2" />
                        Download PDF
                    </Button>
                    <Select value={period} onValueChange={(val) => setPeriod(val)}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="this_month">This Month</SelectItem>
                        <SelectItem value="last_month">Last Month</SelectItem>
                        <SelectItem value="this_year">This Year</SelectItem>
                        <SelectItem value="all_time">All Time</SelectItem>
                    </SelectContent>
                </Select>
                </div>
            </div>

            <StatsGrid stats={stats} columns={4} />

            <div className="space-y-4">
                <h3 className="text-md font-medium">Running Balance Ledger</h3>
                <Card>
                    <CardContent className="p-0">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3">Reference</th>
                                    <th className="px-4 py-3 text-right">Debit</th>
                                    <th className="px-4 py-3 text-right">Credit</th>
                                    <th className="px-4 py-3 text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {transactions.length === 0 ? (
                                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No transactions found</td></tr>
                                ) : (
                                    transactions.map((t) => (
                                        <tr key={`${t.type}-${t.source_id}`} className="hover:bg-muted/50">
                                            <td className="px-4 py-3">
                                                {t.date ? format(new Date(t.date), "MMM dd, yyyy") : "—"}
                                            </td>
                                            <td className="px-4 py-3 capitalize">{t.type.replace("_", " ")}</td>
                                            <td className="px-4 py-3 font-medium">{t.reference}</td>
                                            <td className="px-4 py-3 text-right font-mono">
                                                {t.debit > 0 ? formatCurrency(t.debit) : "—"}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">
                                                {t.credit > 0 ? formatCurrency(t.credit) : "—"}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-medium">
                                                {formatCurrency(t.running_balance)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
