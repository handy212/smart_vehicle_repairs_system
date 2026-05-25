"use client";

import { AccountingReportSkeleton } from "../../components/AccountingReportSkeleton";

import { cn } from "@/lib/utils/cn";
import { ACCOUNTING_TABLE_HEAD_CLASS } from "@/lib/constants/table-typography";


import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, startOfMonth } from "date-fns";
import { useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue} from "@/components/ui/select";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Download } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useBranchStore } from "@/store/branchStore";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow} from "@/components/ui/table";
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
    const { formatCurrency, currencySymbol } = useCurrency();
    const { activeBranchId } = useBranchStore();
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
    const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [comparison, setComparison] = useState<"none" | "mom" | "yoy">("none");

    const { data: report, isLoading } = useQuery({
        queryKey: ["accounting", "profit-loss", startDate, endDate, activeBranchId],
        queryFn: () => accountingApi.getProfitLoss(startDate, endDate, activeBranchId || undefined) as Promise<ProfitLossReport>,
        enabled: comparison === "none"});

    const { data: comparative, isLoading: loadingComparative } = useQuery({
        queryKey: ["accounting", "profit-loss-comparative", startDate, endDate, activeBranchId, comparison],
        queryFn: () =>
            accountingApi.getProfitLossComparative(
                startDate,
                endDate,
                comparison as "mom" | "yoy",
                activeBranchId || undefined
            ),
        enabled: comparison !== "none"});

    const displayReport =
        comparison === "none"
            ? report
            : (comparative as { current?: ProfitLossReport })?.current;
    const variance = (comparative as {
        variance?: {
            net_income?: { change_percent?: number; change?: number };
            income?: { change_percent?: number };
        };
    })?.variance;
    const isLoadingReport = comparison === "none" ? isLoading : loadingComparative;


    const totalIncome = displayReport?.income?.reduce((sum, item) => sum + Number(item.balance || 0), 0) || 0;
    const totalExpenses = displayReport?.expenses?.reduce((sum, item) => sum + Number(item.balance || 0), 0) || 0;
    const netIncome = totalIncome - totalExpenses;

    const handleExportCSV = () => {
        if (!displayReport) return;


        const rows: ExportCell[][] = [];

        // Add header info
        rows.push(['Profit & Loss Statement']);
        rows.push([`Period: ${startDate} to ${endDate}`]);
        rows.push([]);

        // Income section
        rows.push(['INCOME']);

        displayReport?.income?.forEach((item) => {
            rows.push([item.code, item.name, Number(item.balance || 0)]);
        });
        rows.push(['', 'Total Income', totalIncome]);
        rows.push([]);

        // Expenses section
        rows.push(['EXPENSES']);

        displayReport?.expenses?.forEach((item) => {
            rows.push([item.code, item.name, Number(item.balance || 0)]);
        });
        rows.push(['', 'Total Expenses', totalExpenses]);
        rows.push([]);

        // Net income
        rows.push(['', 'NET INCOME', netIncome]);

        const filename = generateFilenameWithTimestamp('profit-loss', 'csv');
        exportToCSV(rows, filename, ['Account Code', 'Account Name', 'Amount']);
    };

    const handleExportExcel = () => {
        if (!displayReport) return;


        const rows: ExportCell[][] = [];

        // Title and date
        rows.push(['Profit & Loss Statement']);
        rows.push([`Period: ${startDate} to ${endDate}`]);
        rows.push([]);

        // Income section
        rows.push(['INCOME', '', '']);
        rows.push(['Account Code', 'Account Name', 'Amount']);

        displayReport?.income?.forEach((item) => {
            rows.push([item.code, item.name, Number(item.balance || 0)]);
        });
        rows.push(['', 'Total Income', totalIncome]);
        rows.push([]);

        // Expenses section
        rows.push(['EXPENSES', '', '']);
        rows.push(['Account Code', 'Account Name', 'Amount']);

        displayReport?.expenses?.forEach((item) => {
            rows.push([item.code, item.name, Number(item.balance || 0)]);
        });
        rows.push(['', 'Total Expenses', totalExpenses]);
        rows.push([]);

        // Net income
        rows.push(['', 'NET INCOME', netIncome]);

        const filename = generateFilenameWithTimestamp('profit-loss', 'xlsx');

        // Bold rows: title, headers, totals
        const incomeLength = displayReport?.income?.length || 0;
        const boldRows = [0, 4, 3 + incomeLength + 2, 3 + incomeLength + 2 + 1, rows.length - 1];

        exportToExcel(rows, filename, {
            sheetName: 'Profit & Loss',
            reportTitle: 'Profit & Loss Statement',
            dateInfo: `Period: ${startDate} to ${endDate}`,
            boldRows,
            currencyColumns: [2],
            colorRows: [
                { row: 0, color: '3B82F6' },  // Blue for title
                { row: 3, color: '10B981' },  // Green for income header
                { row: 3 + (displayReport?.income?.length || 0) + 2, color: 'EF4444' }, // Red for expenses header
            ],
            freezePane: { row: 1, col: 0 },
            showTimestamp: true,
            currencySymbol,
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
                    disabled={!displayReport}
                />
            </div>

            <Card>
                <CardContent className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                        <div>
                            <Label className="text-xs">Compare</Label>
                            <Select
                                value={comparison}
                                onValueChange={(v) => setComparison(v as "none" | "mom" | "yoy")}
                            >
                                <SelectTrigger className="h-9 text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No comparison</SelectItem>
                                    <SelectItem value="mom">Month over month</SelectItem>
                                    <SelectItem value="yoy">Year over year</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    {comparison !== "none" && variance?.net_income && (
                        <p className="text-xs text-muted-foreground mt-3">
                            Net income vs prior period:{" "}
                            <span
                                className={
                                    (variance.net_income.change ?? 0) >= 0
                                        ? "text-success font-medium"
                                        : "text-destructive font-medium"
                                }
                            >
                                {(variance.net_income.change_percent ?? 0) > 0 ? "+" : ""}
                                {variance.net_income.change_percent}%
                            </span>{" "}
                            ({formatCurrency(variance.net_income.change ?? 0)})
                        </p>
                    )}
                </CardContent>
            </Card>

            {isLoadingReport ? (
                <AccountingReportSkeleton />
      ) : !displayReport ? (
                <div className="flex justify-center p-12 text-destructive">
                    Report data not available
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
                                        <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Account</TableHead>
                                        <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>

                                    {displayReport?.income?.map((item) => (
                                        <TableRow key={item.code} className="border-b border-border hover:bg-muted/20">
                                            <TableCell className="px-4 py-2 text-sm font-medium text-foreground">
                                                {item.name}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-sm text-foreground text-right font-mono">
                                                {formatCurrency(Number(item.balance || 0))}
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
                                        <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Account</TableHead>
                                        <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>

                                    {displayReport?.expenses?.map((item) => (
                                        <TableRow key={item.code} className="border-b border-border hover:bg-muted/20">
                                            <TableCell className="px-4 py-2 text-sm font-medium text-foreground">
                                                {item.name}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-sm text-foreground text-right font-mono">
                                                {formatCurrency(Number(item.balance || 0))}
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
