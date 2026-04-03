"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
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
import { exportToCSV, generateFilenameWithTimestamp } from "@/lib/utils/export-utils";
import { exportToExcel } from "@/lib/utils/excel-export";
import { ExportDropdown } from "@/components/ui/export-dropdown";
import { COMPANY_NAME } from "@/lib/constants";

export default function TrialBalancePage() {
    const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const { formatCurrency } = useCurrency();

    const { data: report, isLoading, isError } = useQuery({
        queryKey: ["accounting", "trial-balance", date],
        queryFn: () => accountingApi.getTrialBalance(date),
    });

    const handleExportCSV = () => {
        if (!report) return;


        const rows: any[][] = [];
        rows.push(['Trial Balance']);
        rows.push([`As of: ${date}`]);
        rows.push([]);


        report.accounts.forEach((account: any) => {
            rows.push([
                account.code,
                account.name,
                account.type,
                Number(account.debit) > 0 ? account.debit : 0,
                Number(account.credit) > 0 ? account.credit : 0
            ]);
        });

        rows.push(['', '', 'Totals', report.totals.debits, report.totals.credits]);

        const filename = generateFilenameWithTimestamp('trial-balance', 'csv');
        exportToCSV(rows, filename, ['Code', 'Account Name', 'Type', 'Debit', 'Credit']);
    };

    const handleExportExcel = () => {
        if (!report) return;


        const rows: any[][] = [];

        // Headers
        rows.push(['Code', 'Account Name', 'Type', 'Debit', 'Credit']);

        // Data

        report.accounts.forEach((account: any) => {
            rows.push([
                account.code,
                account.name,
                account.type,
                Number(account.debit) > 0 ? account.debit : 0,
                Number(account.credit) > 0 ? account.credit : 0
            ]);
        });

        // Totals
        rows.push(['', '', 'TOTALS', report.totals.debits, report.totals.credits]);

        const filename = generateFilenameWithTimestamp('trial-balance', 'xlsx');
        exportToExcel(rows, filename, {
            sheetName: 'Trial Balance',
            reportTitle: 'Trial Balance',
            dateInfo: `As of: ${format(new Date(date), 'MMMM d, yyyy')}`,
            boldRows: [0, rows.length - 1],
            currencyColumns: [3, 4],
            freezePane: { row: 1, col: 0 },
            showTimestamp: true,
            companyName: COMPANY_NAME
        });
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
                    <ExportDropdown
                        onExportCSV={handleExportCSV}
                        onExportExcel={handleExportExcel}
                        disabled={!report}
                    />
                </div>
            </div>

            <Card>
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
