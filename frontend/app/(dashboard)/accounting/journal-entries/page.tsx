"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function JournalEntriesPage() {
    const router = useRouter();

    const { data: entries, isLoading } = useQuery({
        queryKey: ["accounting", "journal-entries"],
        queryFn: () => accountingApi.getJournalEntries(),
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Journal Entries</h1>
                    <p className="text-muted-foreground">
                        View and manage all accounting journal entries
                    </p>
                </div>
                <Button onClick={() => router.push("/accounting/journal-entries/new")}>
                    <Plus className="w-4 h-4 mr-2" />
                    New Entry
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All Journal Entries</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>ID</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Reference</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Transactions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {entries?.results?.map((entry: any) => (
                                    <TableRow
                                        key={entry.id}
                                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
                                        onClick={() => router.push(`/accounting/journal-entries/${entry.id}`)}
                                    >
                                        <TableCell className="font-medium">
                                            {format(new Date(entry.date), "MMM d, yyyy")}
                                        </TableCell>
                                        <TableCell>#{entry.id}</TableCell>
                                        <TableCell className="max-w-md truncate">{entry.description}</TableCell>
                                        <TableCell>{entry.reference || "-"}</TableCell>
                                        <TableCell>
                                            <Badge variant={entry.posted ? "success" : "outline"}>
                                                {entry.posted ? "Posted" : "Draft"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{entry.transactions?.length || 0} lines</TableCell>
                                    </TableRow>
                                ))}
                                {(!entries?.results || entries.results.length === 0) && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                            No journal entries found. Create your first entry to get started.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
