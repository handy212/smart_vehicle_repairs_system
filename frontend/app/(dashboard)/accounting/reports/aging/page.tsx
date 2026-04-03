"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Badge } from "@/components/ui/badge";
import { exportToCSV, generateFilenameWithTimestamp } from "@/lib/utils/export-utils";
import { exportToExcel } from "@/lib/utils/excel-export";
import { ExportDropdown } from "@/components/ui/export-dropdown";
import { COMPANY_NAME } from "@/lib/constants";

type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

type AgingSummary = {
    current: number;
    "1-30": number;
    "31-60": number;
    "61-90": number;
    "90+": number;
    total: number;
};

type AgingDetail = {
    id: number | string;
    number: string;
    entity: string;
    date: string;
    due_date?: string | null;
    bucket: AgingBucket;
    amount: number;
};

type AgingReport = {
    summary: AgingSummary;
    details: AgingDetail[];
};

type ExportCell = string | number;

const bucketCardStyles = {
    current: "border-border bg-muted/20 text-foreground",
    soon: "border-warning/20 bg-warning/10 text-warning-foreground",
    elevated: "border-primary/20 bg-primary/10 text-primary",
    overdue: "border-destructive/15 bg-destructive/10 text-destructive",
    critical: "border-destructive/20 bg-destructive/15 text-destructive",
};

export default function AgingReportPage() {
    const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [activeTab, setActiveTab] = useState("ar"); // 'ar' or 'ap'
    const { formatCurrency } = useCurrency();

    const { data: report, isLoading, isError } = useQuery({
        queryKey: ["accounting", "aging", activeTab, date],
        queryFn: () => accountingApi.getAgingReport(activeTab as "ar" | "ap", date) as Promise<AgingReport>,
    });

    const handleExportCSV = () => {
        if (!report) return;


        const rows: ExportCell[][] = [];
        rows.push([`${activeTab.toUpperCase()} Aging Report`]);
        rows.push([`As of: ${date}`]);
        rows.push([]);

        // Summary
        rows.push(['Summary']);
        rows.push(['Current', report.summary.current]);
        rows.push(['1-30 Days', report.summary['1-30']]);
        rows.push(['31-60 Days', report.summary['31-60']]);
        rows.push(['61-90 Days', report.summary['61-90']]);
        rows.push(['90+ Days', report.summary['90+']]);
        rows.push(['Total', report.summary.total]);
        rows.push([]);

        // Details
        rows.push(['Details']);

        report.details.forEach((item) => {
            rows.push([item.number, item.entity, item.date, item.due_date || "N/A", item.bucket, item.amount]);
        });

        const filename = generateFilenameWithTimestamp(`aging-${activeTab}`, 'csv');
        exportToCSV(rows, filename, ['Number', 'Entity', 'Date', 'Due Date', 'Bucket', 'Amount']);
    };

    const handleExportExcel = () => {
        if (!report) return;


        const rows: ExportCell[][] = [];

        // Summary section
        rows.push(['SUMMARY', '', '', '', '', '']);
        rows.push(['Aging Bucket', 'Amount', '', '', '', '']);
        rows.push(['Current', report.summary.current, '', '', '', '']);
        rows.push(['1-30 Days', report.summary['1-30'], '', '', '', '']);
        rows.push(['31-60 Days', report.summary['31-60'], '', '', '', '']);
        rows.push(['61-90 Days', report.summary['61-90'], '', '', '', '']);
        rows.push(['90+ Days', report.summary['90+'], '', '', '', '']);
        rows.push(['Total', report.summary.total, '', '', '', '']);
        rows.push([]);

        // Details section
        rows.push(['DETAILS', '', '', '', '', '']);
        rows.push(['Number', 'Entity', 'Date', 'Due Date', 'Bucket', 'Amount']);

        report.details.forEach((item) => {
            rows.push([item.number, item.entity, item.date, item.due_date || "N/A", item.bucket, item.amount]);
        });

        const filename = generateFilenameWithTimestamp(`aging-${activeTab}`, 'xlsx');
        exportToExcel(rows, filename, {
            sheetName: `${activeTab.toUpperCase()} Aging`,
            reportTitle: `${activeTab.toUpperCase()} Aging Report`,
            dateInfo: `As of: ${format(new Date(date), 'MMMM d, yyyy')}`,
            boldRows: [0, 1, 9, 10],
            currencyColumns: [1, 5],
            colorRows: [
                { row: 0, color: '6366F1' },
                { row: 9, color: '6366F1' }
            ],
            freezePane: { row: 1, col: 0 },
            showTimestamp: true,
            companyName: COMPANY_NAME
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
                <div className="flex items-center gap-3">
                    <Link href="/accounting">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">Aging Report</h1>
                        <p className="text-sm text-muted-foreground">
                            For {format(new Date(date), "MMMM d, yyyy")}
                        </p>
                    </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <Input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full sm:w-40"
                    />
                    <ExportDropdown
                        onExportCSV={handleExportCSV}
                        onExportExcel={handleExportExcel}
                        disabled={!report}
                    />
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="ar">Accounts Receivable (Invoices)</TabsTrigger>
                    <TabsTrigger value="ap">Accounts Payable (Bills)</TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="space-y-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="w-8 h-8 animate-spin" />
                        </div>
                    ) : isError || !report ? (
                        <div className="p-4 text-destructive">Error loading report</div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                                <Card className={bucketCardStyles.current}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Current</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-semibold">{formatCurrency(report.summary.current)}</div>
                                    </CardContent>
                                </Card>
                                <Card className={bucketCardStyles.soon}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">1-30 Days</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-semibold">{formatCurrency(report.summary["1-30"])}</div>
                                    </CardContent>
                                </Card>
                                <Card className={bucketCardStyles.elevated}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">31-60 Days</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-semibold">{formatCurrency(report.summary["31-60"])}</div>
                                    </CardContent>
                                </Card>
                                <Card className={bucketCardStyles.overdue}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">61-90 Days</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-semibold">{formatCurrency(report.summary["61-90"])}</div>
                                    </CardContent>
                                </Card>
                                <Card className={bucketCardStyles.critical}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">90+ Days</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-semibold">{formatCurrency(report.summary["90+"])}</div>
                                    </CardContent>
                                </Card>
                                <Card className={bucketCardStyles.current}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-foreground">Total</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-semibold">{formatCurrency(report.summary.total)}</div>
                                    </CardContent>
                                </Card>
                            </div>

                            <Card>
                                <CardHeader className="border-b bg-muted/10">
                                    <CardTitle className="text-base">Details</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Number</TableHead>
                                                <TableHead>Entity</TableHead>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Due Date</TableHead>
                                                <TableHead>Bucket</TableHead>
                                                <TableHead className="text-right">Amount Due</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {report.details.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                                        No {activeTab.toUpperCase()} records found.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (

                                                report.details.map((item) => (
                                                    <TableRow key={item.id}>
                                                        <TableCell className="font-medium">{item.number}</TableCell>
                                                        <TableCell>{item.entity}</TableCell>
                                                        <TableCell>{item.date}</TableCell>
                                                        <TableCell>{item.due_date || 'N/A'}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={
                                                                item.bucket === 'current' ? 'outline' :
                                                                    item.bucket === '1-30' ? 'secondary' :
                                                                        'danger'
                                                            }>
                                                                {item.bucket}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium">
                                                            {formatCurrency(item.amount)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
