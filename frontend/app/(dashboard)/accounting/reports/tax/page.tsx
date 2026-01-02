"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileText, TrendingUp, TrendingDown } from "lucide-react";
import { format, startOfYear, endOfYear } from "date-fns";
import { useCurrency } from "@/lib/hooks/useCurrency";

export default function TaxReportPage() {
    const { formatCurrency } = useCurrency();
    const [startDate, setStartDate] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
    const [endDate, setEndDate] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));

    const { data: report, isLoading, refetch } = useQuery({
        queryKey: ["accounting", "tax-report", startDate, endDate],
        queryFn: () => accountingApi.getTaxReport(startDate, endDate),
    });

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Tax Report</h1>
                    <p className="text-muted-foreground">
                        Sales Tax Collected vs Input Tax Paid
                    </p>
                </div>
                <Button onClick={() => window.print()}>
                    <FileText className="w-4 h-4 mr-2" />
                    Print Report
                </Button>
            </div>

            {/* Date Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>Report Period</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <Label htmlFor="startDate">Start Date</Label>
                            <Input
                                id="startDate"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="endDate">End Date</Label>
                            <Input
                                id="endDate"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                        <div className="flex items-end">
                            <Button onClick={() => refetch()} className="w-full">
                                Generate Report
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="flex justify-center items-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
            ) : report ? (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">Tax Collected</p>
                                        <p className="text-2xl font-bold text-green-600">
                                            {formatCurrency(report.tax_collected.total)}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {report.invoice_count} invoices
                                        </p>
                                    </div>
                                    <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                                        <TrendingUp className="w-6 h-6 text-green-600" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">Tax Paid</p>
                                        <p className="text-2xl font-bold text-orange-600">
                                            {formatCurrency(report.tax_paid.total)}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {report.bill_count} bills
                                        </p>
                                    </div>
                                    <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                                        <TrendingDown className="w-6 h-6 text-orange-600" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">Net Tax Liability</p>
                                        <p className={`text-2xl font-bold ${report.net_tax_liability >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {formatCurrency(report.net_tax_liability)}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {report.net_tax_liability >= 0 ? 'Payable' : 'Receivable'}
                                        </p>
                                    </div>
                                    <div className={`p-3 rounded-full ${report.net_tax_liability >= 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                                        <FileText className={`w-6 h-6 ${report.net_tax_liability >= 0 ? 'text-red-600' : 'text-green-600'}`} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Tax Breakdown */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Tax Collected Breakdown</CardTitle>
                            <CardDescription>
                                Detailed breakdown of sales tax collected from customers
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900 rounded">
                                    <span className="font-medium">VAT</span>
                                    <span className="font-bold">{formatCurrency(report.tax_collected.vat)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900 rounded">
                                    <span className="font-medium">NHIL</span>
                                    <span className="font-bold">{formatCurrency(report.tax_collected.nhil)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900 rounded">
                                    <span className="font-medium">GETFund</span>
                                    <span className="font-bold">{formatCurrency(report.tax_collected.getfund)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900 rounded">
                                    <span className="font-medium">COVID-19 HRL</span>
                                    <span className="font-bold">{formatCurrency(report.tax_collected.hrl)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/30 rounded border-t-2 border-blue-500">
                                    <span className="font-bold text-lg">Total Collected</span>
                                    <span className="font-bold text-lg text-green-600">{formatCurrency(report.tax_collected.total)}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : null}
        </div>
    );
}
