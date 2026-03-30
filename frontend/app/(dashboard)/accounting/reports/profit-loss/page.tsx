"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, startOfMonth } from "date-fns";
import { useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Download, Loader2 } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useBranchStore } from "@/store/branchStore";
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

type ProfitLossLine = {
    code: string;
    name: string;
    balance: number | string;
};

type ProfitLossReport = {
    income?: ProfitLossLine[];
    expenses?: ProfitLossLine[];
};

type ExportCell = string | number;

export default function ProfitLossPage() {
    const { formatCurrency } = useCurrency();
    const { activeBranchId } = useBranchStore();
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
    const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

    const { data: report, isLoading } = useQuery({
        queryKey: ["accounting", "profit-loss", startDate, endDate, activeBranchId],
        queryFn: () => accountingApi.getProfitLoss(startDate, endDate, activeBranchId || undefined) as Promise<ProfitLossReport>,
    });


    const totalIncome = report?.income?.reduce((sum, item) => sum + parseFloat(String(item.balance || 0)), 0) || 0;
    const totalExpenses = report?.expenses?.reduce((sum, item) => sum + parseFloat(String(item.balance || 0)), 0) || 0;
    const netIncome = totalIncome - totalExpenses;

    const handleExportCSV = () => {
        if (!report) return;


        const rows: ExportCell[][] = [];

        // Add header info
        rows.push(['Profit & Loss Statement']);
        rows.push([`Period: ${startDate} to ${endDate}`]);
        rows.push([]);

        // Income section
        rows.push(['INCOME']);

        report.income?.forEach((item) => {
            rows.push([item.code, item.name, parseFloat(item.balance || 0)]);
        });
        rows.push(['', 'Total Income', totalIncome]);
        rows.push([]);

        // Expenses section
        rows.push(['EXPENSES']);

        report.expenses?.forEach((item) => {
            rows.push([item.code, item.name, parseFloat(item.balance || 0)]);
        });
        rows.push(['', 'Total Expenses', totalExpenses]);
        rows.push([]);

        // Net income
        rows.push(['', 'NET INCOME', netIncome]);

        const filename = generateFilenameWithTimestamp('profit-loss', 'csv');
        exportToCSV(rows, filename, ['Account Code', 'Account Name', 'Amount']);
    };

    const handleExportExcel = () => {
        if (!report) return;


        const rows: ExportCell[][] = [];

        // Title and date
        rows.push(['Profit & Loss Statement']);
        rows.push([`Period: ${startDate} to ${endDate}`]);
        rows.push([]);

        // Income section
        rows.push(['INCOME', '', '']);
        rows.push(['Account Code', 'Account Name', 'Amount']);

        report.income?.forEach((item) => {
            rows.push([item.code, item.name, parseFloat(item.balance || 0)]);
        });
        rows.push(['', 'Total Income', totalIncome]);
        rows.push([]);

        // Expenses section
        rows.push(['EXPENSES', '', '']);
        rows.push(['Account Code', 'Account Name', 'Amount']);

        report.expenses?.forEach((item) => {
            rows.push([item.code, item.name, parseFloat(item.balance || 0)]);
        });
        rows.push(['', 'Total Expenses', totalExpenses]);
        rows.push([]);

        // Net income
        rows.push(['', 'NET INCOME', netIncome]);

        const filename = generateFilenameWithTimestamp('profit-loss', 'xlsx');

        // Bold rows: title, headers, totals
        const boldRows = [0, 4, 3 + report.income.length + 2, 3 + report.income.length + 2 + 1, rows.length - 1];

        exportToExcel(rows, filename, {
            sheetName: 'Profit & Loss',
            reportTitle: 'Profit & Loss Statement',
            dateInfo: `Period: ${startDate} to ${endDate}`,
            boldRows,
            currencyColumns: [2],
            colorRows: [
                { row: 0, color: '3B82F6' },  // Blue for title
                { row: 3, color: '10B981' },  // Green for income header
                { row: 3 + report.income.length + 2, color: 'EF4444' }, // Red for expenses header
            ],
            freezePane: { row: 1, col: 0 },
            showTimestamp: true,
            companyName: COMPANY_NAME
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center pt-2">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Profit & Loss</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Income statement for the selected period
                    </p>
                </div>
                <ExportDropdown
                    onExportCSV={handleExportCSV}
                    onExportExcel={handleExportExcel}
                    disabled={!report}
                />
            </div>

            <Card>
                <CardContent className="p-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="start_date" className="text-xs">Start Date</Label>
                            <Input
                                id="start_date"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="h-9 text-sm"
                            />
                        </div>
                        <div>
                            <Label htmlFor="end_date" className="text-xs">End Date</Label>
                            <Input
                                id="end_date"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="h-9 text-sm"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : (
                <>
                    <Card className="overflow-hidden">
                        <CardHeader className="border-b border-border bg-success/10 pb-3">
                            <CardTitle className="text-base text-success">Income</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-muted/10">
                                    <TableRow className="hover:bg-transparent border-none">
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Account</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>

                                    {report?.income?.map((item) => (
                                        <TableRow key={item.code} className="border-b border-border hover:bg-muted/20">
                                            <TableCell className="px-4 py-2 text-sm font-medium text-foreground">
                                                {item.name}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-sm text-foreground text-right font-mono">
                                                {formatCurrency(parseFloat(item.balance || 0))}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="border-t border-success/20 bg-success/10">
                                        <TableCell className="px-4 py-2 text-sm font-bold text-success">
                                            Total Income
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-right font-mono text-sm font-bold text-success">
                                            {formatCurrency(totalIncome)}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card className="overflow-hidden">
                        <CardHeader className="border-b border-border bg-destructive/10 pb-3">
                            <CardTitle className="text-base text-destructive">Expenses</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-muted/10">
                                    <TableRow className="hover:bg-transparent border-none">
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Account</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>

                                    {report?.expenses?.map((item) => (
                                        <TableRow key={item.code} className="border-b border-border hover:bg-muted/20">
                                            <TableCell className="px-4 py-2 text-sm font-medium text-foreground">
                                                {item.name}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-sm text-foreground text-right font-mono">
                                                {formatCurrency(parseFloat(item.balance || 0))}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="border-t border-destructive/20 bg-destructive/10">
                                        <TableCell className="px-4 py-2 text-sm font-bold text-destructive">
                                            Total Expenses
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-right font-mono text-sm font-bold text-destructive">
                                            {formatCurrency(totalExpenses)}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card className={netIncome >= 0 ? "border-success/20 bg-success/10" : "border-destructive/20 bg-destructive/10"}>
                        <CardContent className="p-4">
                            <div className="flex justify-between items-center">
                                <span className={`text-lg font-bold ${netIncome >= 0 ? "text-success" : "text-destructive"}`}>
                                    Net Income
                                </span>
                                <span className={`text-2xl font-bold font-mono ${netIncome >= 0 ? "text-success" : "text-destructive"}`}>
                                    {formatCurrency(netIncome)}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
