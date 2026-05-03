"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Plus, Loader2, MoreVertical, RotateCcw } from "lucide-react";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/useToast";

type ApiError = {
    response?: {
        data?: {
            error?: string;
            detail?: string;
        };
    };
};

type JournalEntrySummary = {
    id: number;
    date: string;
    description: string;
    reference?: string;
    posted: boolean;
    transactions?: unknown[];
};

function getErrorMessage(error: unknown, fallback: string) {
    const data = (error as ApiError)?.response?.data;
    return data?.error || data?.detail || fallback;
}

export default function JournalEntriesPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { success, error: toastError } = useToast();

    const { data: entries, isLoading } = useQuery({
        queryKey: ["accounting", "journal-entries"],
        queryFn: () => accountingApi.getJournalEntries(),
    });

    const journalEntries: JournalEntrySummary[] = Array.isArray(entries)
        ? entries
        : (entries as { results?: JournalEntrySummary[] } | undefined)?.results || [];

    const reverseMutation = useMutation({
        mutationFn: (entryId: number) => accountingApi.reverseJournalEntry(entryId, {
            reason: "Reversed from journal entry list",
        }),
        onSuccess: () => {
            success("Journal entry reversed.");
            queryClient.invalidateQueries({ queryKey: ["accounting", "journal-entries"] });
        },
        onError: (error: unknown) => {
            toastError(getErrorMessage(error, "Failed to reverse journal entry"));
        },
    });

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
                <div>
                    <h1 className="text-lg font-semibold tracking-tight">Journal Entries</h1>
                    <p className="text-xs text-muted-foreground">
                        Posted ledger activity and reversal controls
                    </p>
                </div>
                <Button onClick={() => router.push("/accounting/journal-entries/new")} size="sm" className="h-9">
                    <Plus className="w-4 h-4 mr-2" />
                    New Entry
                </Button>
            </div>

            <Card className="overflow-hidden">
                <CardHeader className="border-b border-border bg-muted/10 px-4 py-3">
                    <CardTitle className="text-sm font-semibold">All Journal Entries</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>

                                {journalEntries.map((entry) => (
                                    <TableRow
                                        key={entry.id}
                                        className="cursor-pointer hover:bg-muted "
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
                                        <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-40">
                                                    <DropdownMenuItem
                                                        disabled={!entry.posted || reverseMutation.isPending || String(entry.reference || "").startsWith("REV-JE-")}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            reverseMutation.mutate(entry.id);
                                                        }}
                                                    >
                                                        <RotateCcw className="mr-2 h-4 w-4" />
                                                        Reverse
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {journalEntries.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
