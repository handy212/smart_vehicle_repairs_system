"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useState } from "react";

export default function AccountDetailPage() {
    const params = useParams();
    const router = useRouter();
    const accountId = params.id as string;
    const [page, setPage] = useState(0);
    const limit = 50;

    const { data: account, isLoading: accountLoading } = useQuery({
        queryKey: ['account-detail', accountId],
        queryFn: () => accountingApi.getAccount(accountId),
    });

    const { data: transactions, isLoading: transactionsLoading } = useQuery({
        queryKey: ['account-transactions', accountId, page],
        queryFn: () => accountingApi.getAccountTransactions(accountId, {
            limit,
            offset: page * limit,
        }),
        enabled: !!accountId,
    });

    if (accountLoading) {
        return (
            <div className="p-8 space-y-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (!account) {
        return (
            <div className="p-8">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-center text-muted-foreground">Account not found</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const totalPages = Math.ceil((transactions?.total_count || 0) / limit);

    return (
        <div className="p-8 space-y-6">
            {/* Back Button */}
            <Button variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Chart of Accounts
            </Button>

            {/* Account Info */}
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-3">
                                <code className="text-2xl font-mono font-bold">{account.code}</code>
                                <Badge variant="outline">{account.role}</Badge>
                                {account.active ? (
                                    <Badge variant="success">Active</Badge>
                                ) : (
                                    <Badge variant="secondary">Inactive</Badge>
                                )}
                                {account.locked && <Badge variant="warning">Locked</Badge>}
                            </div>
                            <h1 className="text-3xl font-bold mt-2">{account.name}</h1>
                        </div>
                        <Button variant="outline">
                            <Download className="mr-2 h-4 w-4" />
                            Export
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <p className="text-sm text-muted-foreground">Account Type</p>
                            <p className="font-semibold">{account.role}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Balance Type</p>
                            <p className="font-semibold">{account.balance_type}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Depth Level</p>
                            <p className="font-semibold">{account.depth}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">UUID</p>
                            <p className="font-mono text-xs text-muted-foreground">{account.uuid}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Transactions */}
            <Card>
                <CardHeader>
                    <CardTitle>
                        Transaction History
                        {transactions && (
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                                ({transactions.total_count} transactions)
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {transactionsLoading ? (
                        <div className="space-y-2">
                            {[...Array(5)].map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : transactions && transactions.transactions.length > 0 ? (
                        <>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Description</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead className="text-right">Debit</TableHead>
                                            <TableHead className="text-right">Credit</TableHead>
                                            <TableHead>JE #</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {transactions.transactions.map((txn) => (
                                            <TableRow key={txn.id}>
                                                <TableCell>
                                                    {txn.date ? format(new Date(txn.date), 'MMM dd, yyyy') : '-'}
                                                </TableCell>
                                                <TableCell>{txn.description || '-'}</TableCell>
                                                <TableCell>
                                                    <Badge variant={txn.tx_type === 'debit' ? 'default' : 'secondary'}>
                                                        {txn.tx_type.toUpperCase()}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-mono">
                                                    {txn.tx_type === 'debit' ? `$${parseFloat(txn.amount).toLocaleString()}` : '-'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono">
                                                    {txn.tx_type === 'credit' ? `$${parseFloat(txn.amount).toLocaleString()}` : '-'}
                                                </TableCell>
                                                <TableCell>
                                                    <code className="text-xs">{txn.journal_entry_id}</code>
                                                </TableCell>
                                                <TableCell>
                                                    {txn.posted ? (
                                                        <Badge variant="success" className="text-xs">Posted</Badge>
                                                    ) : (
                                                        <Badge variant="warning" className="text-xs">Draft</Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="mt-4 flex items-center justify-between">
                                    <div className="text-sm text-muted-foreground">
                                        Page {page + 1} of {totalPages}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                                            disabled={page === 0}
                                        >
                                            Previous
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                                            disabled={page >= totalPages - 1}
                                        >
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            No transactions found for this account.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
