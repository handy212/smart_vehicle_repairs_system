"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, Calendar, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function GeneralLedgerPage() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    const [fromDate, setFromDate] = useState(firstDay.toISOString().split('T')[0]);
    const [toDate, setToDate] = useState(now.toISOString().split('T')[0]);
    const [accountCode, setAccountCode] = useState("");
    const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

    const { data: accounts } = useQuery({
        queryKey: ['chart-of-accounts'],
        queryFn: () => accountingApi.getChartOfAccounts(),
    });

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['general-ledger', fromDate, toDate, accountCode],
        queryFn: () => accountingApi.getGeneralLedger({
            from_date: fromDate,
            to_date: toDate,
            account_code: accountCode || undefined,
        }),
    });

    const toggleAccountExpanded = (code: string) => {
        const newExpanded = new Set(expandedAccounts);
        if (newExpanded.has(code)) {
            newExpanded.delete(code);
        } else {
            newExpanded.add(code);
        }
        setExpandedAccounts(newExpanded);
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
                    <h1 className="text-3xl font-bold">General Ledger</h1>
                    <p className="text-muted-foreground mt-1">
                        {data?.entity_name} • {data?.from_date} to {data?.to_date}
                    </p>
                </div>
                <Button variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Export PDF
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
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
                        <div>
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
                        <div>
                            <Label htmlFor="account">Account (Optional)</Label>
                            <select
                                id="account"
                                value={accountCode}
                                onChange={(e) => setAccountCode(e.target.value)}
                                className="w-full px-3 py-2 mt-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                            >
                                <option value="">All Accounts</option>
                                {accounts?.accounts.map((acc) => (
                                    <option key={acc.id} value={acc.code}>
                                        {acc.code} - {acc.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-end">
                            <Button onClick={() => refetch()} className="w-full">
                                Update
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* General Ledger by Account */}
            {data && data.accounts.length > 0 ? (
                <div className="space-y-4">
                    {data.accounts.map((account) => {
                        const isExpanded = expandedAccounts.has(account.account_code);

                        return (
                            <Card key={account.account_code}>
                                <CardHeader
                                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                    onClick={() => toggleAccountExpanded(account.account_code)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {isExpanded ? (
                                                <ChevronDown className="h-5 w-5 text-gray-500" />
                                            ) : (
                                                <ChevronRight className="h-5 w-5 text-gray-500" />
                                            )}
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <code className="font-mono font-semibold">{account.account_code}</code>
                                                    <span className="font-semibold">{account.account_name}</span>
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    {account.transaction_count} transactions
                                                </p>
                                            </div>
                                        </div>
                                        <Badge variant="secondary">{account.transaction_count}</Badge>
                                    </div>
                                </CardHeader>

                                {isExpanded && (
                                    <CardContent>
                                        <div className="overflow-x-auto">
                                            <table className="w-full">
                                                <thead className="bg-gray-50 dark:bg-gray-800">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Type</th>
                                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                                                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">JE</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                    {(() => {
                                                        let runningBalance = 0;
                                                        return account.transactions.map((txn, idx) => {
                                                            const amount = parseFloat(txn.amount);
                                                            if (txn.tx_type === 'debit') {
                                                                runningBalance += amount;
                                                            } else {
                                                                runningBalance -= amount;
                                                            }

                                                            return (
                                                                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                                    <td className="px-4 py-3 text-sm">
                                                                        {txn.date ? format(new Date(txn.date), 'MMM dd, yyyy') : '-'}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-sm">{txn.description}</td>
                                                                    <td className="px-4 py-3 text-center">
                                                                        <Badge variant={txn.tx_type === 'debit' ? 'default' : 'secondary'} className="text-xs">
                                                                            {txn.tx_type.toUpperCase()}
                                                                        </Badge>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-sm text-right font-mono">
                                                                        {txn.tx_type === 'debit' ? `$${amount.toLocaleString()}` : '-'}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-sm text-right font-mono">
                                                                        {txn.tx_type === 'credit' ? `$${amount.toLocaleString()}` : '-'}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-sm text-right font-mono font-semibold">
                                                                        ${runningBalance.toLocaleString()}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-center">
                                                                        <code className="text-xs text-muted-foreground">{txn.journal_entry_id}</code>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        });
                                                    })()}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                )}
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <Card>
                    <CardContent className="pt-12 pb-12 text-center">
                        <p className="text-muted-foreground">
                            No transactions found for the selected period.
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
