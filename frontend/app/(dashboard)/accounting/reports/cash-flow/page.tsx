"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { format, startOfYear, endOfMonth } from "date-fns";
import { useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Download, Loader2, ArrowLeft } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { exportToCSV, generateFilenameWithTimestamp } from "@/lib/utils/export-utils";
import { exportToExcel } from "@/lib/utils/excel-export";
import { ExportDropdown } from "@/components/ui/export-dropdown";
import { COMPANY_NAME } from "@/lib/constants";

export default function CashFlowPage() {
    const [startDate, setStartDate] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
    const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const { formatCurrency } = useCurrency();

    const { data: report, isLoading, isError } = useQuery({
        queryKey: ["accounting", "cash-flow", startDate, endDate],
        queryFn: () => accountingApi.getCashFlowStatement(startDate, endDate),
    });

    const handleExportCSV = () => {
        if (!report) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: any[][] = [];
        rows.push(['Cash Flow Statement']);
        rows.push([`Period: ${startDate} to ${endDate}`]);
        rows.push([]);
        rows.push(['Opening Balance', report.opening_balance]);
        rows.push([]);

        // Operating Activities
        rows.push(['Operating Activities']);
        rows.push(['Cash Inflows', report.operating_activities.inflows]);
        rows.push(['Cash Outflows', report.operating_activities.outflows]);
        rows.push(['Net Cash from Operating', report.operating_activities.net]);
        rows.push([]);

        // Investing Activities
        rows.push(['Investing Activities']);
        rows.push(['Cash Inflows', report.investing_activities.inflows]);
        rows.push(['Cash Outflows', report.investing_activities.outflows]);
        rows.push(['Net Cash from Investing', report.investing_activities.net]);
        rows.push([]);

        // Financing Activities
        rows.push(['Financing Activities']);
        rows.push(['Cash Inflows', report.financing_activities.inflows]);
        rows.push(['Cash Outflows', report.financing_activities.outflows]);
        rows.push(['Net Cash from Financing', report.financing_activities.net]);
        rows.push([]);

        rows.push(['Net Increase/Decrease in Cash', report.net_increase_decrease]);
        rows.push(['Closing Balance', report.closing_balance]);

        const filename = generateFilenameWithTimestamp('cash-flow', 'csv');
        exportToCSV(rows, filename, ['Item', 'Amount']);
    };

    const handleExportExcel = () => {
        if (!report) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: any[][] = [];

        // Summary
        rows.push(['Opening Balance', report.opening_balance]);
        rows.push([]);

        // Operating Activities
        rows.push(['OPERATING ACTIVITIES', '']);
        rows.push(['Cash Inflows', report.operating_activities.inflows]);
        rows.push(['Cash Outflows', report.operating_activities.outflows]);
        rows.push(['Net Cash from Operating', report.operating_activities.net]);
        rows.push([]);

        // Investing Activities
        rows.push(['INVESTING ACTIVITIES', '']);
        rows.push(['Cash Inflows', report.investing_activities.inflows]);
        rows.push(['Cash Outflows', report.investing_activities.outflows]);
        rows.push(['Net Cash from Investing', report.investing_activities.net]);
        rows.push([]);

        // Financing Activities
        rows.push(['FINANCING ACTIVITIES', '']);
        rows.push(['Cash Inflows', report.financing_activities.inflows]);
        rows.push(['Cash Outflows', report.financing_activities.outflows]);
        rows.push(['Net Cash from Financing', report.financing_activities.net]);
        rows.push([]);

        rows.push(['Net Increase/Decrease in Cash', report.net_increase_decrease]);
        rows.push(['Closing Balance', report.closing_balance]);

        const filename = generateFilenameWithTimestamp('cash-flow', 'xlsx');
        exportToExcel(rows, filename, {
            sheetName: 'Cash Flow',
            reportTitle: 'Statement of Cash Flows',
            dateInfo: `Period: ${format(new Date(startDate), 'MMM d, yyyy')} - ${format(new Date(endDate), 'MMM d, yyyy')}`,
            boldRows: [0, 2, 7, 12, rows.length - 2, rows.length - 1],
            currencyColumns: [1],
            colorRows: [
                { row: 2, color: '3B82F6' },
                { row: 7, color: '10B981' },
                { row: 12, color: 'F59E0B' }
            ],
            freezePane: { row: 1, col: 0 },
            showTimestamp: true,
            companyName: COMPANY_NAME
        });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ActivitySection = ({ title, data }: { title: string, data: any }) => (
        <div className="space-y-2">
            <h3 className="font-semibold text-lg">{title}</h3>
            <div className="grid grid-cols-2 gap-4 pl-4 text-sm">
                <div className="text-muted-foreground">Cash Inflows</div>
                <div className="text-right text-success font-medium">{formatCurrency(data.inflows)}</div>

                <div className="text-muted-foreground">Cash Outflows</div>
                <div className="text-right text-red-600 font-medium">({formatCurrency(data.outflows)})</div>

                <div className="font-semibold pt-2 border-t">Net Cash from {title}</div>
                <div className={cn(
                    "text-right font-bold pt-2 border-t",
                    data.net >= 0 ? "text-green-700" : "text-red-700"
                )}>
                    {formatCurrency(data.net)}
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/accounting">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Statement of Cash Flows</h1>
                        <p className="text-muted-foreground">
                            {format(new Date(startDate), "MMM d, yyyy")} - {format(new Date(endDate), "MMM d, yyyy")}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-40"
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-40"
                    />
                    <ExportDropdown
                        onExportCSV={handleExportCSV}
                        onExportExcel={handleExportExcel}
                        disabled={!report}
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
            ) : isError ? (
                <div className="p-4 text-red-500">Error loading report</div>
            ) : (
                <Card>
                    <CardHeader className="bg-muted border-b">
                        <div className="flex justify-between items-center">
                            <CardTitle>Cash Flow Summary</CardTitle>
                            <div className="text-sm font-medium">
                                Opening Balance: <span className="text-primary">{formatCurrency(report.opening_balance)}</span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-8 pt-6">

                        <ActivitySection title="Operating Activities" data={report.operating_activities} />
                        <Separator />

                        <ActivitySection title="Investing Activities" data={report.investing_activities} />
                        <Separator />

                        <ActivitySection title="Financing Activities" data={report.financing_activities} />
                        <Separator />

                        <div className="flex justify-between items-center p-4 bg-muted rounded-lg border">
                            <span className="font-bold text-lg">Net Increase / Decrease in Cash</span>
                            <span className={cn(
                                "font-bold text-xl",
                                report.net_increase_decrease >= 0 ? "text-green-700" : "text-red-700"
                            )}>
                                {formatCurrency(report.net_increase_decrease)}
                            </span>
                        </div>

                        <div className="flex justify-between items-center p-4 bg-primary/10 rounded-lg border border-orange-100">
                            <span className="font-bold text-lg text-orange-900">Closing Cash Balance</span>
                            <span className="font-bold text-xl text-primary">
                                {formatCurrency(report.closing_balance)}
                            </span>
                        </div>

                    </CardContent>
                </Card>
            )}
        </div>
    );
}
