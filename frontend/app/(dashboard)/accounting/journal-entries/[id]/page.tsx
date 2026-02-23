"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Loader2, FileText, Calendar, Hash, CheckCircle2, Clock } from "lucide-react";
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
import Link from "next/link";

export default function JournalEntryDetailPage() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;
    const { formatCurrency } = useCurrency();

    const { data: entry, isLoading, error } = useQuery({
        queryKey: ["accounting", "journal-entry", id],
        queryFn: () => accountingApi.getJournalEntry(id),
        enabled: !!id,
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

    const totalDebits = (entry.transactions || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((t: any) => t.transaction_type === "debit")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((sum: number, t: any) => sum + parseFloat(t.amount || 0), 0);

    const totalCredits = (entry.transactions || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((t: any) => t.transaction_type === "credit")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((sum: number, t: any) => sum + parseFloat(t.amount || 0), 0);

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/accounting/journal-entries">
                        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="w-4 h-4 mr-1" />
                            Back
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">Journal Entry #{entry.id}</h1>
                        <p className="text-sm text-muted-foreground">{entry.description}</p>
                    </div>
                </div>
                <Badge variant={entry.posted ? "success" : "outline"} className="text-sm px-3 py-1">
                    {entry.posted ? (
                        <><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Posted</>
                    ) : (
                        <><Clock className="w-3.5 h-3.5 mr-1" /> Draft</>
                    )}
                </Badge>
            </div>

            {/* Metadata Card */}
            <Card>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="flex items-start gap-3">
                            <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">Date</p>
                                <p className="font-medium">{format(new Date(entry.date), "MMM d, yyyy")}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Hash className="w-5 h-5 text-muted-foreground mt-0.5" />
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">Reference</p>
                                <p className="font-medium">{entry.reference || "—"}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">Transactions</p>
                                <p className="font-medium">{entry.transactions?.length || 0} lines</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Clock className="w-5 h-5 text-muted-foreground mt-0.5" />
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">Created</p>
                                <p className="font-medium">{format(new Date(entry.created_at), "MMM d, yyyy HH:mm")}</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Transactions Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Transaction Lines</CardTitle>
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
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {(entry.transactions || []).map((tx: any, idx: number) => (
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
                                            ? formatCurrency(parseFloat(tx.amount))
                                            : ""}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        {tx.transaction_type === "credit"
                                            ? formatCurrency(parseFloat(tx.amount))
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
        </div>
    );
}
