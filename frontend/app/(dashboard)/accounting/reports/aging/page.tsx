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

export default function AgingReportPage() {
    const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [activeTab, setActiveTab] = useState("ar"); // 'ar' or 'ap'
    const { formatCurrency } = useCurrency();

    const { data: report, isLoading, isError } = useQuery({
        queryKey: ["accounting", "aging", activeTab, date],
        queryFn: () => accountingApi.getAgingReport(activeTab as 'ar' | 'ap', date),
    });

    const handleExportCSV = () => {
        if (!report) return;


        const rows: any[][] = [];
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

        report.details.forEach((item: any) => {
            rows.push([item.number, item.entity, item.date, item.due_date || 'N/A', item.bucket, item.amount]);
        });

        const filename = generateFilenameWithTimestamp(`aging-${activeTab}`, 'csv');
        exportToCSV(rows, filename, ['Number', 'Entity', 'Date', 'Due Date', 'Bucket', 'Amount']);
    };

    const handleExportExcel = () => {
        if (!report) return;


        const rows: any[][] = [];

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

        report.details.forEach((item: any) => {
            rows.push([item.number, item.entity, item.date, item.due_date || 'N/A', item.bucket, item.amount]);
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
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/accounting">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Aging Report</h1>
                        <p className="text-muted-foreground">
                            For {format(new Date(date), "MMMM d, yyyy")}
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
                    ) : isError ? (
                        <div className="p-4 text-red-500">Error loading report</div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                <Card className="bg-muted border-border">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Current</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-bold">{formatCurrency(report.summary.current)}</div>
                                    </CardContent>
                                </Card>
                                <Card className="bg-warning/10 border-yellow-200">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-yellow-600">1-30 Days</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-bold text-yellow-700">{formatCurrency(report.summary['1-30'])}</div>
                                    </CardContent>
                                </Card>
                                <Card className="bg-orange-50 border-orange-200">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-primary">31-60 Days</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-bold text-primary">{formatCurrency(report.summary['31-60'])}</div>
                                    </CardContent>
                                </Card>
                                <Card className="bg-red-50 border-red-200">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-red-600">61-90 Days</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-bold text-red-700">{formatCurrency(report.summary['61-90'])}</div>
                                    </CardContent>
                                </Card>
                                <Card className="bg-red-100 border-red-300">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-red-800">90+ Days</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-bold text-red-900">{formatCurrency(report.summary['90+'])}</div>
                                    </CardContent>
                                </Card>
                                <Card className="bg-muted border-border">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-foreground">Total</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-bold">{formatCurrency(report.summary.total)}</div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* // Detailed Table */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Details</CardTitle>
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

                                                report.details.map((item: any) => (
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
