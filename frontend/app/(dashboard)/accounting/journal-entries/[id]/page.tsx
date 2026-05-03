"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Loader2, FileText, Calendar, Hash, CheckCircle2, Clock, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    TableFooter,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import { useState } from "react";
import Link from "next/link";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ApiError = {
    response?: {
        data?: {
            error?: string;
            detail?: string;
        };
    };
};

type JournalTransaction = {
    id?: number;
    account_code?: string;
    account_name?: string;
    account?: {
        code?: string;
        name?: string;
    };
    amount: string | number;
    transaction_type: "debit" | "credit";
    description?: string;
};

type JournalEntryDetail = {
    id: number;
    date: string;
    description: string;
    reference?: string;
    posted: boolean;
    created_at: string;
    transactions?: JournalTransaction[];
};

function getErrorMessage(error: unknown, fallback: string) {
    const data = (error as ApiError)?.response?.data;
    return data?.error || data?.detail || fallback;
}

export default function JournalEntryDetailPage() {

    const router = useRouter();
    const params = useParams();
    const id = params.id as string;
    const { formatCurrency } = useCurrency();
    const queryClient = useQueryClient();
    const { success, error: toastError } = useToast();
    const [reverseOpen, setReverseOpen] = useState(false);
    const [reverseDate, setReverseDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [reverseReason, setReverseReason] = useState("");

    const { data: entry, isLoading, error } = useQuery({
        queryKey: ["accounting", "journal-entry", id],
        queryFn: () => accountingApi.getJournalEntry(id),
        enabled: !!id,
    });

    const reverseMutation = useMutation({
        mutationFn: () => accountingApi.reverseJournalEntry(id, {
            date: reverseDate || undefined,
            reason: reverseReason,
        }),
        onSuccess: (reversal) => {
            success("Reversal journal entry posted.");
            setReverseOpen(false);
            queryClient.invalidateQueries({ queryKey: ["accounting", "journal-entry", id] });
            queryClient.invalidateQueries({ queryKey: ["accounting", "journal-entries"] });
            router.push(`/accounting/journal-entries/${reversal.id}`);
        },
        onError: (error: unknown) => {
            toastError(getErrorMessage(error, "Failed to reverse journal entry"));
        },
    });

    if (isLoading) {
        return (
            <div className="flex justify-center items-center p-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !entry) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link href="/accounting/journal-entries">
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-1" /> Back
                        </Button>
                    </Link>
                </div>
                <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                        Journal entry not found.
                    </CardContent>
                </Card>
            </div>
        );
    }

    const typedEntry = entry as JournalEntryDetail;

    const totalDebits = (typedEntry.transactions || [])

        .filter((t) => t.transaction_type === "debit")

        .reduce((sum: number, t) => sum + parseFloat(String(t.amount || 0)), 0);

    const totalCredits = (typedEntry.transactions || [])

        .filter((t) => t.transaction_type === "credit")

        .reduce((sum: number, t) => sum + parseFloat(String(t.amount || 0)), 0);

    return (
        <div className="space-y-4 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/accounting/journal-entries">
                        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="w-4 h-4 mr-1" />
                            Back
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-lg font-semibold">Journal Entry #{typedEntry.id}</h1>
                        <p className="text-sm text-muted-foreground">{typedEntry.description}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant={typedEntry.posted ? "success" : "outline"} className="text-xs px-2 py-1">
                        {typedEntry.posted ? (
                            <><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Posted</>
                        ) : (
                            <><Clock className="w-3.5 h-3.5 mr-1" /> Draft</>
                        )}
                    </Badge>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={!typedEntry.posted || String(typedEntry.reference || "").startsWith("REV-JE-")}
                        onClick={() => setReverseOpen(true)}
                    >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Reverse
                    </Button>
                </div>
            </div>

            <Card className="overflow-hidden">
                <CardContent className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="flex items-start gap-3">
                            <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">Date</p>
                                <p className="font-medium">{format(new Date(typedEntry.date), "MMM d, yyyy")}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Hash className="w-5 h-5 text-muted-foreground mt-0.5" />
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">Reference</p>
                                <p className="font-medium">{typedEntry.reference || "—"}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">Transactions</p>
                                <p className="font-medium">{typedEntry.transactions?.length || 0} lines</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Clock className="w-5 h-5 text-muted-foreground mt-0.5" />
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">Created</p>
                                <p className="font-medium">{format(new Date(typedEntry.created_at), "MMM d, yyyy HH:mm")}</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="overflow-hidden">
                <CardHeader className="border-b border-border bg-muted/10 px-4 py-3">
                    <CardTitle className="text-sm font-semibold">Transaction Lines</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[15%]">Account Code</TableHead>
                                <TableHead className="w-[35%]">Account Name</TableHead>
                                <TableHead className="w-[20%]">Description</TableHead>
                                <TableHead className="w-[15%] text-right">Debit</TableHead>
                                <TableHead className="w-[15%] text-right">Credit</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>

                            {(typedEntry.transactions || []).map((tx, idx) => (
                                <TableRow key={tx.id || idx}>
                                    <TableCell className="font-mono text-sm">
                                        {tx.account_code || tx.account?.code || "—"}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {tx.account_name || tx.account?.name || "—"}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {tx.description || "—"}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        {tx.transaction_type === "debit"
                                            ? formatCurrency(parseFloat(String(tx.amount)))
                                            : ""}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        {tx.transaction_type === "credit"
                                            ? formatCurrency(parseFloat(String(tx.amount)))
                                            : ""}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter>
                            <TableRow className="bg-muted/50 font-semibold">
                                <TableCell colSpan={3} className="text-right">
                                    Totals
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                    {formatCurrency(totalDebits)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                    {formatCurrency(totalCredits)}
                                </TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={reverseOpen} onOpenChange={setReverseOpen}>
                <DialogContent className="sm:max-w-[460px] p-0 gap-0">
                    <DialogHeader>
                        <div className="border-b border-border px-5 py-4">
                            <DialogTitle className="text-base">Reverse Journal Entry</DialogTitle>
                        </div>
                    </DialogHeader>
                    <div className="space-y-4 px-5 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="reverse-date">Reversal Date</Label>
                            <Input
                                id="reverse-date"
                                type="date"
                                value={reverseDate}
                                onChange={(event) => setReverseDate(event.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="reverse-reason">Reason</Label>
                            <Textarea
                                id="reverse-reason"
                                value={reverseReason}
                                onChange={(event) => setReverseReason(event.target.value)}
                                rows={3}
                                className="resize-none"
                            />
                        </div>
                    </div>
                    <DialogFooter className="border-t border-border px-5 py-3">
                        <Button variant="outline" onClick={() => setReverseOpen(false)}>Cancel</Button>
                        <Button onClick={() => reverseMutation.mutate()} disabled={reverseMutation.isPending}>
                            {reverseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Post Reversal
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
