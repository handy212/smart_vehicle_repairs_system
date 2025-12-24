"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trash2, CheckCircle, Lock } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";

export default function JournalEntryDetailPage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const entryId = parseInt(params.id as string);

    const { data: entry, isLoading } = useQuery({
        queryKey: ['journal-entry-detail', entryId],
        queryFn: () => accountingApi.getJournalEntryDetail(entryId),
    });

    const postMutation = useMutation({
        mutationFn: () => accountingApi.postJournalEntry(entryId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['journal-entry-detail', entryId] });
            queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
            toast({ title: "Success", description: "Journal entry posted successfully" });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.error || "Failed to post journal entry",
                variant: "destructive",
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: () => accountingApi.deleteJournalEntry(entryId),
        onSuccess: () => {
            toast({ title: "Success", description: "Journal entry deleted successfully" });
            router.push('/accounting/journal-entries');
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.error || "Failed to delete journal entry",
                variant: "destructive",
            });
        },
    });

    const handlePost = () => {
        if (confirm('Post this journal entry? This will lock the entry and it cannot be undone.')) {
            postMutation.mutate();
        }
    };

    const handleDelete = () => {
        if (confirm('Delete this journal entry? This action cannot be undone.')) {
            deleteMutation.mutate();
        }
    };

    if (isLoading) {
        return (
            <div className="p-8 space-y-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (!entry) {
        return (
            <div className="p-8">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-center text-muted-foreground">Journal entry not found</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const totalDebit = entry.transactions
        .filter(t => t.tx_type === 'debit')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const totalCredit = entry.transactions
        .filter(t => t.tx_type === 'credit')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    return (
        <div className="p-8 space-y-6">
            {/* Back Button */}
            <Button variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Journal Entries
            </Button>

            {/* Header */}
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h1 className="text-3xl font-bold">Journal Entry #{entry.id}</h1>
                                {entry.posted ? (
                                    <Badge variant="success">Posted</Badge>
                                ) : (
                                    <Badge variant="warning">Draft</Badge>
                                )}
                                {entry.locked && (
                                    <Badge variant="secondary">
                                        <Lock className="h-3 w-3 mr-1" />
                                        Locked
                                    </Badge>
                                )}
                            </div>
                            <p className="text-muted-foreground">
                                {entry.timestamp ? format(new Date(entry.timestamp), 'MMMM dd, yyyy') : 'No date'}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            {!entry.posted && (
                                <>
                                    <Button
                                        variant="default"
                                        onClick={handlePost}
                                        disabled={postMutation.isPending}
                                    >
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        {postMutation.isPending ? 'Posting...' : 'Post Entry'}
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        onClick={handleDelete}
                                        disabled={deleteMutation.isPending}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                            <p className="text-sm text-muted-foreground">Description</p>
                            <p className="font-semibold">{entry.description || '-'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Ledger</p>
                            <p className="font-semibold">{entry.ledger_name || '-'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">UUID</p>
                            <p className="font-mono text-xs text-muted-foreground">{entry.uuid}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Transactions */}
            <Card>
                <CardHeader>
                    <CardTitle>Transaction Lines</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Account Code</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Account Name</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Description</th>
                                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">Type</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Debit</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Credit</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {entry.transactions.map((txn) => (
                                    <tr key={txn.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <td className="px-4 py-3">
                                            <code className="text-sm font-mono font-semibold">{txn.account_code}</code>
                                        </td>
                                        <td className="px-4 py-3 text-sm">{txn.account_name}</td>
                                        <td className="px-4 py-3 text-sm text-muted-foreground">{txn.description || '-'}</td>
                                        <td className="px-4 py-3 text-center">
                                            <Badge variant={txn.tx_type === 'debit' ? 'default' : 'secondary'} className="text-xs">
                                                {txn.tx_type.toUpperCase()}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            {txn.tx_type === 'debit'
                                                ? `$${parseFloat(txn.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                                                : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            {txn.tx_type === 'credit'
                                                ? `$${parseFloat(txn.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                                                : '-'}
                                        </td>
                                    </tr>
                                ))}
                                {/* Totals Row */}
                                <tr className="bg-gray-100 dark:bg-gray-800 font-bold">
                                    <td colSpan={4} className="px-4 py-3 text-right">TOTALS:</td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        ${totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        ${totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Balance Check */}
                    <div className={`mt-4 p-4 rounded-lg ${Math.abs(totalDebit - totalCredit) < 0.01
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                        }`}>
                        <div className="flex items-center justify-between">
                            <span className="font-medium">
                                {Math.abs(totalDebit - totalCredit) < 0.01
                                    ? '✓ Entry is balanced'
                                    : '✗ Entry is not balanced'}
                            </span>
                            <span className="font-mono font-semibold">
                                Difference: ${Math.abs(totalDebit - totalCredit).toFixed(2)}
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
