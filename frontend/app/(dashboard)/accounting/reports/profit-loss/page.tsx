"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, startOfMonth } from "date-fns";
import { useState } from "react";
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

export default function ProfitLossPage() {
    const { formatCurrency } = useCurrency();
    const { activeBranchId } = useBranchStore();
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
    const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

    const { data: report, isLoading } = useQuery({
        queryKey: ["accounting", "profit-loss", startDate, endDate, activeBranchId],
        queryFn: () => accountingApi.getProfitLoss(startDate, endDate, activeBranchId || undefined),
    });

    const totalIncome = report?.income?.reduce((sum: number, item: any) => sum + parseFloat(item.balance || 0), 0) || 0;
    const totalExpenses = report?.expenses?.reduce((sum: number, item: any) => sum + parseFloat(item.balance || 0), 0) || 0;
    const netIncome = totalIncome - totalExpenses;

    const handleExportCSV = () => {
        if (!report) return;

        const rows: any[][] = [];

        // Add header info
        rows.push(['Profit & Loss Statement']);
        rows.push([`Period: ${startDate} to ${endDate}`]);
        rows.push([]);

        // Income section
        rows.push(['INCOME']);
        report.income?.forEach((item: any) => {
            rows.push([item.code, item.name, parseFloat(item.balance || 0)]);
        });
        rows.push(['', 'Total Income', totalIncome]);
        rows.push([]);

        // Expenses section
        rows.push(['EXPENSES']);
        report.expenses?.forEach((item: any) => {
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

        const rows: any[][] = [];

        // Title and date
        rows.push(['Profit & Loss Statement']);
        rows.push([`Period: ${startDate} to ${endDate}`]);
        rows.push([]);

        // Income section
        rows.push(['INCOME', '', '']);
        rows.push(['Account Code', 'Account Name', 'Amount']);
        report.income?.forEach((item: any) => {
            rows.push([item.code, item.name, parseFloat(item.balance || 0)]);
        });
        rows.push(['', 'Total Income', totalIncome]);
        rows.push([]);

        // Expenses section
        rows.push(['EXPENSES', '', '']);
        rows.push(['Account Code', 'Account Name', 'Amount']);
        report.expenses?.forEach((item: any) => {
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
            {/* Compact Header */}
            <div className="flex justify-between items-center pt-2">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Profit & Loss</h1>
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

            {/* Filters - Compact */}
            <Card className="border shadow-sm">
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
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
            ) : (
                <>
                    {/* Income Section - Compact */}
                    <Card className="border-none shadow-sm overflow-hidden ring-1 ring-gray-200 dark:ring-gray-800">
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800 bg-green-50/50 dark:bg-green-900/10">
                            <CardTitle className="text-base text-green-700 dark:text-green-400">Income</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-gray-50/30 dark:bg-gray-800/30">
                                    <TableRow className="hover:bg-transparent border-none">
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Account</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4 text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {report?.income?.map((item: any) => (
                                        <TableRow key={item.code} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                                            <TableCell className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                                                {item.name}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 text-right font-mono">
                                                {formatCurrency(parseFloat(item.balance || 0))}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="bg-green-50/50 dark:bg-green-900/20 border-t-2 border-green-200 dark:border-green-800">
                                        <TableCell className="px-4 py-2 text-sm font-bold text-green-700 dark:text-green-400">
                                            Total Income
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-sm font-bold text-green-700 dark:text-green-400 text-right font-mono">
                                            {formatCurrency(totalIncome)}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Expenses Section - Compact */}
                    <Card className="border-none shadow-sm overflow-hidden ring-1 ring-gray-200 dark:ring-gray-800">
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800 bg-red-50/50 dark:bg-red-900/10">
                            <CardTitle className="text-base text-red-700 dark:text-red-400">Expenses</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-gray-50/30 dark:bg-gray-800/30">
                                    <TableRow className="hover:bg-transparent border-none">
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Account</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4 text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {report?.expenses?.map((item: any) => (
                                        <TableRow key={item.code} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                                            <TableCell className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                                                {item.name}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 text-right font-mono">
                                                {formatCurrency(parseFloat(item.balance || 0))}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="bg-red-50/50 dark:bg-red-900/20 border-t-2 border-red-200 dark:border-red-800">
                                        <TableCell className="px-4 py-2 text-sm font-bold text-red-700 dark:text-red-400">
                                            Total Expenses
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-sm font-bold text-red-700 dark:text-red-400 text-right font-mono">
                                            {formatCurrency(totalExpenses)}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Net Income Summary - Compact */}
                    <Card className={`border-2 ${netIncome >= 0 ? 'border-green-200 bg-green-50 dark:bg-green-900/20' : 'border-red-200 bg-red-50 dark:bg-red-900/20'}`}>
                        <CardContent className="p-4">
                            <div className="flex justify-between items-center">
                                <span className={`text-lg font-bold ${netIncome >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                    Net Income
                                </span>
                                <span className={`text-2xl font-bold font-mono ${netIncome >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
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
