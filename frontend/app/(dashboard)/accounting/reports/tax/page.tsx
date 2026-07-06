"use client";

import { AccountingReportSkeleton } from "../../components/AccountingReportSkeleton";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountingApi, type TaxReport } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, TrendingUp, TrendingDown } from "lucide-react";
import { format, startOfYear, endOfYear } from "date-fns";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { AccountingReportToolbar } from "../../components/AccountingReportToolbar";
import { AccountingReportPrintHeader } from "../../components/AccountingReportPrintHeader";

export default function TaxReportPage() {
    const { formatCurrency } = useCurrency();
    const [startDate, setStartDate] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
    const [endDate, setEndDate] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));

    const { data: report, isLoading, refetch } = useQuery<TaxReport>({
        queryKey: ["accounting", "tax-report", startDate, endDate],
        queryFn: () => accountingApi.getTaxReport(startDate, endDate),
    });

    const getExportPayload = () => {
        if (!report) return null;
        return {
            reportTitle: "Tax Report",
            filename: `tax-report_${startDate}_${endDate}`,
            dateInfo: `${startDate} to ${endDate}`,
            headers: ["Category", "Amount"],
            rows: [
                ["VAT Collected", report.tax_collected.vat],
                ["NHIL Collected", report.tax_collected.nhil],
                ["GETFund Collected", report.tax_collected.getfund],
                ["HRL Collected", report.tax_collected.hrl],
                ["Total Collected", report.tax_collected.total],
                ["Total Paid", report.tax_paid.total],
                ["Net Tax Liability", report.net_tax_liability],
            ],
            currencyColumnIndexes: [1],
        };
    };

    return (
        <div className="mx-auto max-w-5xl space-y-4">
            <div className="no-print flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Tax Report</h1>
                    <p className="text-sm text-muted-foreground">
                        Sales Tax Collected vs Input Tax Paid
                    </p>
                </div>
                <AccountingReportToolbar
                    getExportPayload={getExportPayload}
                    disabled={!report}
                    isLoading={isLoading}
                    reportPrint={{
                        slug: "tax",
                        getQueryParams: () => ({
                            start_date: startDate,
                            end_date: endDate,
                        }),
                        pdfFilename: `tax-report_${startDate}_${endDate}`,
                    }}
                />
            </div>

            <AccountingReportPrintHeader
                title="Tax Report"
                dateInfo={`${startDate} to ${endDate}`}
            />

            <Card>
                <CardHeader className="border-b bg-muted/10">
                    <CardTitle className="text-base">Report Period</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div>
                            <Label htmlFor="startDate" className="text-xs">Start Date</Label>
                            <Input
                                id="startDate"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="h-9 text-sm"
                            />
                        </div>
                        <div>
                            <Label htmlFor="endDate" className="text-xs">End Date</Label>
                            <Input
                                id="endDate"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="h-9 text-sm"
                            />
                        </div>
                        <div className="flex items-end">
                            <Button onClick={() => refetch()} className="h-9 w-full">
                                Generate Report
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <AccountingReportSkeleton />
            ) : report ? (
                <div className="print-container space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <Card>
                            <CardContent className="pt-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">Tax Collected</p>
                                        <p className="text-2xl font-semibold text-success">
                                            {formatCurrency(report?.tax_collected.total)}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {report?.invoice_count} invoices
                                        </p>
                                    </div>
                                    <div className="rounded-md border border-success/20 bg-success/10 p-2.5">
                                        <TrendingUp className="w-6 h-6 text-success" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="pt-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">Tax Paid</p>
                                        <p className="text-2xl font-semibold text-primary">
                                            {formatCurrency(report?.tax_paid.total)}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {report?.bill_count} bills
                                        </p>
                                    </div>
                                    <div className="rounded-md border border-primary/20 bg-primary/10 p-2.5">
                                        <TrendingDown className="w-6 h-6 text-primary" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="pt-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">Net Tax Liability</p>
                                        <p className={`text-2xl font-semibold ${report?.net_tax_liability >= 0 ? "text-destructive" : "text-success"}`}>
                                            {formatCurrency(report?.net_tax_liability)}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {report?.net_tax_liability >= 0 ? "Payable" : "Receivable"}
                                        </p>
                                    </div>
                                    <div className={`rounded-md border p-2.5 ${report?.net_tax_liability >= 0 ? "border-destructive/20 bg-destructive/10" : "border-success/20 bg-success/10"}`}>
                                        <FileText className={`w-6 h-6 ${report?.net_tax_liability >= 0 ? "text-destructive" : "text-success"}`} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader className="border-b bg-muted/10">
                            <CardTitle className="text-base">Tax Collected Breakdown</CardTitle>
                            <CardDescription>
                                Detailed breakdown of sales tax collected from customers
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                                    <span className="font-medium">VAT</span>
                                    <span className="font-bold">{formatCurrency(report?.tax_collected.vat)}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                                    <span className="font-medium">NHIL</span>
                                    <span className="font-bold">{formatCurrency(report?.tax_collected.nhil)}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                                    <span className="font-medium">GETFund</span>
                                    <span className="font-bold">{formatCurrency(report?.tax_collected.getfund)}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                                    <span className="font-medium">COVID-19 HRL</span>
                                    <span className="font-bold">{formatCurrency(report?.tax_collected.hrl)}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/10 p-3">
                                    <span className="text-lg font-semibold">Total Collected</span>
                                    <span className="text-lg font-semibold text-success">{formatCurrency(report?.tax_collected.total)}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : null}
        </div>
    );
}
