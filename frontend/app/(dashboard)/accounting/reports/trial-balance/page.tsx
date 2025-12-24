"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Calendar } from "lucide-react";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function TrialBalancePage() {
    const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['trial-balance', asOfDate],
        queryFn: () => accountingApi.getTrialBalance(asOfDate),
    });

    const handleExport = () => {
        // TODO: Implement export functionality
        console.log('Export trial balance');
    };

    if (isLoading) {
        return (
            <div className="p-8 space-y-6">
                <Skeleton className="h-12 w-full" />
                <Card>
                    <CardContent className="pt-6">
                        <div className="space-y-2">
                            {[...Array(10)].map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Trial Balance</h1>
                    <p className="text-muted-foreground mt-1">
                        {data?.entity_name} • As of {data?.as_of_date}
                    </p>
                </div>
                <Button variant="outline" onClick={handleExport}>
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

            {/* Balance Status */}
            {data && (
                <Card className={`${data.balanced
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    }`}>
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <div className="text-sm font-medium text-muted-foreground mb-1">Total Debits</div>
                                <div className="text-3xl font-bold text-blue-600">
                                    ${parseFloat(data.total_debit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div>
                                <div className="text-sm font-medium text-muted-foreground mb-1">Total Credits</div>
                                <div className="text-3xl font-bold text-red-600">
                                    ${parseFloat(data.total_credit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div>
                                <div className="text-sm font-medium text-muted-foreground mb-1">Status</div>
                                <div className="flex items-center gap-2">
                                    <Badge
                                        variant={data.balanced ? "success" : "danger"}
                                        className="text-lg px-4 py-1"
                                    >
                                        {data.balanced ? '✓ Balanced' : '✗ Unbalanced'}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Trial Balance Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Account Balances</CardTitle>
                </CardHeader>
                <CardContent>
                    {data && data.trial_balance.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Account Code</TableHead>
                                        <TableHead>Account Name</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="text-right">Debit</TableHead>
                                        <TableHead className="text-right">Credit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.trial_balance.map((item) => (
                                        <TableRow key={item.account_code}>
                                            <TableCell>
                                                <code className="text-sm font-mono font-semibold">{item.account_code}</code>
                                            </TableCell>
                                            <TableCell>{item.account_name}</TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="text-xs">
                                                    {item.account_role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                {parseFloat(item.debit) > 0
                                                    ? `$${parseFloat(item.debit).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                                                    : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                {parseFloat(item.credit) > 0
                                                    ? `$${parseFloat(item.credit).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                                                    : '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {/* Total Row */}
                                    <TableRow className="bg-gray-50 dark:bg-gray-800 font-bold">
                                        <TableCell colSpan={3} className="text-right">TOTAL:</TableCell>
                                        <TableCell className="text-right font-mono">
                                            ${parseFloat(data.total_debit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            ${parseFloat(data.total_credit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            No account balances found.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
