"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountingApi, type JournalEntry } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Eye, Trash2, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";

export default function JournalEntriesPage() {
    const [search, setSearch] = useState("");
    const [postedFilter, setPostedFilter] = useState<string>("");
    const [page, setPage] = useState(0);
    const limit = 50;

    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data, isLoading } = useQuery({
        queryKey: ['journal-entries', search, postedFilter, page],
        queryFn: () => accountingApi.getJournalEntries({
            posted: postedFilter === "" ? undefined : postedFilter === "true",
            limit,
            offset: page * limit,
        }),
    });

    const postMutation = useMutation({
        mutationFn: (id: number) => accountingApi.postJournalEntry(id),
        onSuccess: () => {
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
        mutationFn: (id: number) => accountingApi.deleteJournalEntry(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
            toast({ title: "Success", description: "Journal entry deleted successfully" });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.error || "Failed to delete journal entry",
                variant: "destructive",
            });
        },
    });

    const handlePost = (entry: JournalEntry) => {
        if (confirm(`Post journal entry #${entry.id}? This will lock the entry.`)) {
            postMutation.mutate(entry.id);
        }
    };

    const handleDelete = (entry: JournalEntry) => {
        if (confirm(`Delete journal entry #${entry.id}? This action cannot be undone.`)) {
            deleteMutation.mutate(entry.id);
        }
    };

    const filteredEntries = data?.journal_entries?.filter((entry) => {
        if (search === "") return true;
        return entry.description.toLowerCase().includes(search.toLowerCase()) ||
            entry.id.toString().includes(search);
    }) || [];

    const totalPages = Math.ceil((data?.total_count || 0) / limit);

    if (isLoading) {
        return (
            <div className="p-8 space-y-6">
                <Skeleton className="h-12 w-full" />
                <Card>
                    <CardContent className="pt-6">
                        <div className="space-y-2">
                            {[...Array(5)].map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full" />
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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Journal Entries</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage manual journal entries • {data?.total_count || 0} total
                    </p>
                </div>
                <Link href="/accounting/journal-entries/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        New Journal Entry
                    </Button>
                </Link>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                                type="text"
                                placeholder="Search by description or ID..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        <select
                            value={postedFilter}
                            onChange={(e) => setPostedFilter(e.target.value)}
                            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All Statuses</option>
                            <option value="true">Posted Only</option>
                            <option value="false">Drafts Only</option>
                        </select>

                        {(search || postedFilter) && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSearch("");
                                    setPostedFilter("");
                                }}
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Journal Entries Table */}
            <Card>
                <CardHeader>
                    <CardTitle>All Journal Entries</CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredEntries.length > 0 ? (
                        <>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>ID</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Description</TableHead>
                                            <TableHead>Ledger</TableHead>
                                            <TableHead className="text-right">Total Debit</TableHead>
                                            <TableHead className="text-right">Total Credit</TableHead>
                                            <TableHead>Transactions</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredEntries.map((entry) => (
                                            <TableRow key={entry.id}>
                                                <TableCell>
                                                    <code className="text-sm font-mono">{entry.id}</code>
                                                </TableCell>
                                                <TableCell>
                                                    {entry.timestamp ? format(new Date(entry.timestamp), 'MMM dd, yyyy') : '-'}
                                                </TableCell>
                                                <TableCell className="max-w-xs truncate">{entry.description}</TableCell>
                                                <TableCell>{entry.ledger_name || '-'}</TableCell>
                                                <TableCell className="text-right font-mono">
                                                    ${parseFloat(entry.total_debit).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right font-mono">
                                                    ${parseFloat(entry.total_credit).toLocaleString()}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{entry.transactions_count}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {entry.posted ? (
                                                        <Badge variant="success">Posted</Badge>
                                                    ) : (
                                                        <Badge variant="warning">Draft</Badge>
                                                    )}
                                                    {entry.locked && (
                                                        <Badge variant="secondary" className="ml-2">Locked</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Link href={`/accounting/journal-entries/${entry.id}`}>
                                                            <Button variant="ghost" size="sm">
                                                                <Eye className="h-4 w-4" />
                                                            </Button>
                                                        </Link>
                                                        {!entry.posted && (
                                                            <>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => handlePost(entry)}
                                                                    disabled={postMutation.isPending}
                                                                >
                                                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => handleDelete(entry)}
                                                                    disabled={deleteMutation.isPending}
                                                                >
                                                                    <Trash2 className="h-4 w-4 text-red-600" />
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
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
                        <div className="text-center py-12">
                            <p className="text-muted-foreground">No journal entries found.</p>
                            <Link href="/accounting/journal-entries/new">
                                <Button className="mt-4" variant="outline">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create First Journal Entry
                                </Button>
                            </Link>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
