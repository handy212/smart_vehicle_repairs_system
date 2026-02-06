"use client";

import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent } from "@/components/ui/card";
import { StatsGrid } from "@/components/shared/StatsGrid";
import { format } from "date-fns";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface StatementViewProps {
    customerId: number;
}

export function StatementView({ customerId }: StatementViewProps) {
    const { formatCurrency } = useCurrency();
    const [period, setPeriod] = useState("all_time");

    const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
        queryKey: ["invoices", "customer", customerId],
        queryFn: () => billingApi.invoices.list({ customer: customerId }).then(res => res.results),
    });

    const { data: payments = [], isLoading: paymentsLoading } = useQuery({
        queryKey: ["payments", "customer", customerId],
        queryFn: () => billingApi.payments.list({ customer: customerId }),
    });

    const isLoading = invoicesLoading || paymentsLoading;

    // Calculate summary based on real data
    const calculateSummary = () => {
        // Filter by period if needed (simple implementation for now)
        const filteredInvoices = invoices;
        const filteredPayments = payments;

        const invoiced = filteredInvoices
            .filter((inv: any) => inv.status !== 'void')
            .reduce((sum: number, inv: any) => sum + parseFloat(inv.total), 0);

        const paymentTotal = filteredPayments
            .filter((pay: any) => pay.status !== 'failed' && pay.status !== 'void')
            .reduce((sum: number, pay: any) => sum + parseFloat(pay.amount), 0);

        const balanceDue = invoiced - paymentTotal;

        return {
            beginning_balance: 0, // Would need historical balance logic
            invoiced,
            payments: paymentTotal,
            balance_due: balanceDue
        };
    };

    const summary = calculateSummary();

    // Combine and sort transactions
    const transactions = [
        ...invoices.map((inv: any) => ({
            id: inv.id,
            type: 'invoice',
            date: inv.issue_date,
            amount: inv.total,
            status: inv.status,
            number: inv.invoice_number,
            original: inv
        })),
        ...payments.map((pay: any) => ({
            id: pay.id,
            type: 'payment',
            date: pay.payment_date,
            amount: pay.amount,
            status: pay.status,
            number: `PAY-${pay.id}`,
            original: pay
        }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
    }

    const cols = [
        { header: "Date", accessorKey: "date", cell: (item: any) => format(new Date(item.date), "MMM dd, yyyy") },
        { header: "Type", accessorKey: "type", cell: (item: any) => <span className="capitalize">{item.type}</span> },
        { header: "Number", accessorKey: "number" },
        { header: "Amount", accessorKey: "amount", cell: (item: any) => formatCurrency(parseFloat(item.amount)) },
        { header: "Status", accessorKey: "status", cell: (item: any) => <span className="capitalize px-2 py-1 rounded bg-border text-xs">{item.status}</span> },
    ];

    const stats = [
        { label: "Beginning Balance", value: formatCurrency(summary.beginning_balance) },
        { label: "Invoiced Amount", value: formatCurrency(summary.invoiced), color: "text-primary" },
        { label: "Payments Made", value: formatCurrency(summary.payments), color: "text-success" },
        { label: "Balance Due", value: formatCurrency(summary.balance_due), color: "text-red-600 dark:text-red-400" }
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Account Statement</h2>
                <Select
                    value={period}
                    onValueChange={(val) => setPeriod(val)}
                >
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

            <StatsGrid stats={stats} columns={4} />

            <div className="space-y-4">
                <h3 className="text-md font-medium">Detailed Transaction History</h3>
                <Card>
                    <CardContent className="p-0">
                        {/* Import DataTable dynamically or use what's available? DataTable is imported implicitly? No, I need to check imports */}
                        {/* Actually I need to add DataTable import if it's not there. It was NOT there in previous view of StatementView.tsx */}
                        {/* Wait, StatementView.tsx imports:
                            import { StatsGrid } from "@/components/shared/StatsGrid";
                            ...
                            No DataTable.
                            I must add DataTable import.
                          */}
                        {/* I will use the DataTable component */}
                        {/* Since I can't update imports in this replacement easily without seeing top, I will assume I can update imports in a separate call or try to squeeze it in if I knew the file content. 
                             The file content (Step 469) shows imports at top. 
                             I will update the whole file to be safe and include DataTable. 
                          */}
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3">Number</th>
                                    <th className="px-4 py-3 text-right">Amount</th>
                                    <th className="px-4 py-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {transactions.length === 0 ? (
                                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No transactions found</td></tr>
                                ) : (
                                    transactions.map((t: any) => (
                                        <tr key={`${t.type}-${t.id}`} className="hover:bg-muted/50 dark:hover:bg-gray-800/50">
                                            <td className="px-4 py-3">
                                                {t.date ? (
                                                    // specific check for invalid date string
                                                    isNaN(new Date(t.date).getTime()) ? '-' : format(new Date(t.date), "MMM dd, yyyy")
                                                ) : '-'}
                                            </td>
                                            <td className="px-4 py-3 capitalize">
                                                <span className={`inline-flex items-center gap-1 ${t.type === 'payment' ? 'text-success' : 'text-primary'}`}>
                                                    {t.type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-medium">{t.number}</td>
                                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(parseFloat(t.amount))}</td>
                                            <td className="px-4 py-3">
                                                <span className="px-2 py-0.5 rounded text-xs bg-border capitalize">{t.status}</span>
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
