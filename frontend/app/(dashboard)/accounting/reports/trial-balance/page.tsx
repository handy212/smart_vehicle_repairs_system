"use client";

import { AccountingReportSkeleton } from "../../components/AccountingReportSkeleton";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow} from "@/components/ui/table";
import Link from "next/link";
import { buildTrialBalanceExportPayload } from "@/lib/utils/accounting-report-export";
import { AccountingReportToolbar } from "../../components/AccountingReportToolbar";
import { AccountingReportPrintHeader } from "../../components/AccountingReportPrintHeader";

interface TrialBalanceAccount {
    code: string;
    name: string;
    type: string;
    debit: number | string;
    credit: number | string;
}

interface TrialBalanceReport {
    accounts: TrialBalanceAccount[];
    totals: {
        debits: number | string;
        credits: number | string;
    };
    is_balanced: boolean;
}

export default function TrialBalancePage() {
    const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const { formatCurrency, currencySymbol } = useCurrency();

    const { data: report, isLoading, isError } = useQuery<TrialBalanceReport>({
        queryKey: ["accounting", "trial-balance", date],
        queryFn: () => accountingApi.getTrialBalance(date)});

    const getExportPayload = () =>
        report ? buildTrialBalanceExportPayload(report, date) : null;

    if (isLoading) {
        return <AccountingReportSkeleton />;
    }

    if (isError) {
        return <div>Error loading report</div>;
    }

    return (
        <div className="space-y-6">
            <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
                <AccountingReportToolbar
                    getExportPayload={getExportPayload}
                    disabled={!report}
                    reportPrint={{
                        slug: "trial-balance",
                        getQueryParams: () => ({ date }),
                        pdfFilename: `trial-balance_${date}`,
                    }}
                >
                    <Input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-40 h-9 text-sm"
                    />
                </AccountingReportToolbar>
            </div>

            <AccountingReportPrintHeader title="Trial Balance" dateInfo={`As of ${date}`} />

            <Card className="print-container">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Accounts</CardTitle>
                        {report?.is_balanced ? (
                            <span className="text-success bg-success/10 px-3 py-1 rounded-full text-sm font-medium">Balanced</span>
                        ) : (
                            <span className="text-destructive bg-destructive/10 px-3 py-1 rounded-full text-sm font-medium">Unbalanced</span>
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

                            {report?.accounts.map((account: TrialBalanceAccount, index: number) => (
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
