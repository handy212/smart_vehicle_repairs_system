"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Download, Filter, ArrowLeft } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import Link from "next/link";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { exportToCSV, generateFilenameWithTimestamp } from "@/lib/utils/export-utils";
import { exportToExcel } from "@/lib/utils/excel-export";
import { ExportDropdown } from "@/components/ui/export-dropdown";
import { COMPANY_NAME } from "@/lib/constants";

export default function BalanceSheetPage() {
    const { formatCurrency } = useCurrency();
    const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [showFilters, setShowFilters] = useState(false);

    const { data: report, isLoading } = useQuery({
        queryKey: ["accounting", "balance-sheet", date],
        queryFn: () => accountingApi.getBalanceSheet(date),
    });

    const handleExportCSV = () => {
        if (!report) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: any[][] = [];
        rows.push(['Balance Sheet']);
        rows.push([`As of: ${date}`]);
        rows.push([]);

        // Assets
        rows.push(['ASSETS']);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        report.assets.forEach((acc: any) => {
            rows.push([acc.code, acc.name, acc.balance]);
        });
        rows.push(['', 'Total Assets', report.totals.assets]);
        rows.push([]);

        // Liabilities
        rows.push(['LIABILITIES']);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        report.liabilities.forEach((acc: any) => {
            rows.push([acc.code, acc.name, acc.balance]);
        });
        rows.push(['', 'Total Liabilities', report.totals.liabilities]);
        rows.push([]);

        // Equity
        rows.push(['EQUITY']);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        report.equity.forEach((acc: any) => {
            rows.push([acc.code, acc.name, acc.balance]);
        });
        rows.push(['', 'Total Equity', report.totals.equity]);
        rows.push([]);
        rows.push(['', 'Total Liabilities + Equity', report.totals.liabilities_plus_equity]);

        const filename = generateFilenameWithTimestamp('balance-sheet', 'csv');
        exportToCSV(rows, filename, ['Account Code', 'Account Name', 'Amount']);
    };

    const handleExportExcel = () => {
        if (!report) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: any[][] = [];
        rows.push(['Balance Sheet']);
        rows.push([`As of: ${date}`]);
        rows.push([]);

        // Assets
        rows.push(['ASSETS', '', '']);
        rows.push(['Account Code', 'Account Name', 'Amount']);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        report.assets.forEach((acc: any) => {
            rows.push([acc.code, acc.name, acc.balance]);
        });
        rows.push(['', 'Total Assets', report.totals.assets]);
        rows.push([]);

        // Liabilities
        rows.push(['LIABILITIES', '', '']);
        rows.push(['Account Code', 'Account Name', 'Amount']);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        report.liabilities.forEach((acc: any) => {
            rows.push([acc.code, acc.name, acc.balance]);
        });
        rows.push(['', 'Total Liabilities', report.totals.liabilities]);
        rows.push([]);

        // Equity
        rows.push(['EQUITY', '', '']);
        rows.push(['Account Code', 'Account Name', 'Amount']);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        report.equity.forEach((acc: any) => {
            rows.push([acc.code, acc.name, acc.balance]);
        });
        rows.push(['', 'Total Equity', report.totals.equity]);
        rows.push([]);
        rows.push(['', 'Total Liabilities + Equity', report.totals.liabilities_plus_equity]);

        const filename = generateFilenameWithTimestamp('balance-sheet', 'xlsx');
        exportToExcel(rows, filename, {
            sheetName: 'Balance Sheet',
            reportTitle: 'Balance Sheet',
            dateInfo: `As of: ${date}`,
            boldRows: [0, 3, 4],
            currencyColumns: [2],
            colorRows: [{ row: 0, color: '3B82F6' }],
            freezePane: { row: 1, col: 0 },
            showTimestamp: true,
            companyName: COMPANY_NAME
        });
    };

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Link href="/accounting" className="text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="w-4 h-4" />
                        </Link>
                        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                            Balance Sheet
                        </h1>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Statement of Financial Position
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <Button
                        variant="secondary"
                        onClick={() => setShowFilters(!showFilters)}
                        className="sm:hidden"
                        size="sm"
                    >
                        <Filter className="w-4 h-4 mr-2" />
                        Filters
                    </Button>
                    <div
                        className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 ${showFilters ? "flex" : "hidden sm:flex"}`}
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">As of:</span>
                            <Input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full sm:w-40 h-10 text-sm"
                            />
                        </div>
                        <ExportDropdown
                            onExportCSV={handleExportCSV}
                            onExportExcel={handleExportExcel}
                            disabled={!report}
                            size="default"
                        />
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
            ) : report ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    // Assets
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Assets</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Account</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {report.assets.map((acc) => (
                                        <TableRow key={acc.code}>
                                            <TableCell>
                                                <span className="font-medium text-foreground">{acc.code}</span> - {acc.name}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {formatCurrency(acc.balance)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {report.assets.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-center text-muted-foreground">No assets found</TableCell>
                                        </TableRow>
                                    )}
                                    <TableRow className="font-bold bg-muted/50">
                                        <TableCell>Total Assets</TableCell>
                                        <TableCell className="text-right">{formatCurrency(report.totals.assets)}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        // Liabilities
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Liabilities</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Account</TableHead>
                                            <TableHead className="text-right">Balance</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {report.liabilities.map((acc) => (
                                            <TableRow key={acc.code}>
                                                <TableCell>
                                                    <span className="font-medium text-foreground">{acc.code}</span> - {acc.name}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {formatCurrency(acc.balance)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {report.liabilities.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={2} className="text-center text-muted-foreground">No liabilities found</TableCell>
                                            </TableRow>
                                        )}
                                        <TableRow className="font-bold bg-muted/50">
                                            <TableCell>Total Liabilities</TableCell>
                                            <TableCell className="text-right">{formatCurrency(report.totals.liabilities)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        // Equity
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Equity</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Account</TableHead>
                                            <TableHead className="text-right">Balance</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {report.equity.map((acc) => (
                                            <TableRow key={acc.code}>
                                                <TableCell>
                                                    <span className="font-medium text-foreground">{acc.code}</span> - {acc.name}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {formatCurrency(acc.balance)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {report.equity.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={2} className="text-center text-muted-foreground">No equity records found</TableCell>
                                            </TableRow>
                                        )}
                                        <TableRow className="font-bold bg-muted/50">
                                            <TableCell>Total Equity</TableCell>
                                            <TableCell className="text-right">{formatCurrency(report.totals.equity)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        // Summary
                        <Card className={report.is_balanced ? "border-green-200 bg-success/10" : "border-red-200 bg-red-50/50"}>
                            <CardContent className="pt-6">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-foreground">Total Liabilities + Equity</span>
                                    <span className={`font-bold ${report.is_balanced ? "text-green-700" : "text-red-700"}`}>
                                        {formatCurrency(report.totals.liabilities_plus_equity)}
                                    </span>
                                </div>
                                {!report.is_balanced && (
                                    <p className="text-xs text-red-600 mt-1">Warning: Balance Sheet is not balanced!</p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            ) : (
                <div className="text-center py-10 text-muted-foreground">No data available</div>
            )}
        </div>
    );
}
