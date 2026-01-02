"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { useState } from "react";
import { Download, Loader2, ArrowLeft } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import Link from "next/link";

export default function TrialBalancePage() {
    const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const { formatCurrency } = useCurrency();

    const { data: report, isLoading, isError } = useQuery({
        queryKey: ["accounting", "trial-balance", date],
        queryFn: () => accountingApi.getTrialBalance(date),
    });

    const handleExport = () => {
        // TODO: Implement PDF/CSV export
        alert("Export feature coming soon");
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        );
    }

    if (isError) {
        return <div>Error loading report</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/accounting">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Trial Balance</h1>
                        <p className="text-muted-foreground">
                            As of {format(new Date(date), "MMMM d, yyyy")}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-40"
                    />
                    <Button variant="outline" onClick={handleExport}>
                        <Download className="w-4 h-4 mr-2" />
                        Export
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Accounts</CardTitle>
                        {report?.is_balanced ? (
                            <span className="text-green-600 bg-green-50 px-3 py-1 rounded-full text-sm font-medium">Balanced</span>
                        ) : (
                            <span className="text-red-600 bg-red-50 px-3 py-1 rounded-full text-sm font-medium">Unbalanced</span>
                        )}
                    </div>

                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead>Account Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="text-right">Debit</TableHead>
                                <TableHead className="text-right">Credit</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {report?.accounts.map((account: any, index: number) => (
                                <TableRow key={index}>
                                    <TableCell className="font-medium">{account.code}</TableCell>
                                    <TableCell>{account.name}</TableCell>
                                    <TableCell className="capitalize">{account.type}</TableCell>
                                    <TableCell className="text-right">
                                        {Number(account.debit) > 0 ? formatCurrency(account.debit) : "-"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {Number(account.credit) > 0 ? formatCurrency(account.credit) : "-"}
                                    </TableCell>
                                </TableRow>
                            ))}

                            {/* Totals Row */}
                            <TableRow className="font-bold bg-muted/50">
                                <TableCell colSpan={3} className="text-right">Totals</TableCell>
                                <TableCell className="text-right">{formatCurrency(report?.totals.debits)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(report?.totals.credits)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
