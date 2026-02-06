"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import apiClient from "@/lib/api/client";
import { useParams } from "next/navigation";

export default function BudgetReportPage() {
    const params = useParams();
    const budgetId = params.id;

    const { data: report, isLoading } = useQuery({
        queryKey: ["budget-vs-actual", budgetId],
        queryFn: async () => {
            const response = await apiClient.get(`/accounting/reports/budget-vs-actual/?budget_id=${budgetId}`);
            return response.data;
        },
        enabled: !!budgetId
    });

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-GH', {
            style: 'currency',
            currency: 'GHS'
        }).format(amount);
    };

    const getVarianceIcon = (status: string) => {
        if (status === 'over') return <TrendingUp className="w-4 h-4 text-red-600" />;
        if (status === 'under') return <TrendingDown className="w-4 h-4 text-success" />;
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">
                    {report?.budget?.name || "Budget Report"}
                </h1>
                <p className="text-muted-foreground">
                    FY{report?.budget?.fiscal_year} - {report?.budget?.branch_name}
                </p>
            </div>

            {/* Summary Cards */}
            {report && (
                <div className="grid grid-cols-3 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Budget</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-primary">
                                {formatCurrency(report.summary.total_budget)}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Actual Spend</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-primary">
                                {formatCurrency(report.summary.total_actual)}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Variance</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${report.summary.total_variance >= 0 ? 'text-red-600' : 'text-success'}`}>
                                {formatCurrency(report.summary.total_variance)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {report.summary.variance_percent.toFixed(1)}%
                            </p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Detailed Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Budget vs Actual Details</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Account</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Period</TableHead>
                                    <TableHead className="text-right">Budget</TableHead>
                                    <TableHead className="text-right">Actual</TableHead>
                                    <TableHead className="text-right">Variance</TableHead>
                                    <TableHead className="text-right">%</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {report?.lines?.map((line: any, idx: number) => (
                                    <TableRow key={idx}>
                                        <TableCell>
                                            <div className="font-medium">{line.account_code}</div>
                                            <div className="text-sm text-muted-foreground">{line.account_name}</div>
                                        </TableCell>
                                        <TableCell className="capitalize">{line.account_type}</TableCell>
                                        <TableCell className="uppercase">{line.period}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(line.budget)}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(line.actual)}</TableCell>
                                        <TableCell className={`text-right font-semibold ${line.variance >= 0 ? 'text-red-600' : 'text-success'}`}>
                                            {formatCurrency(line.variance)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <span className={`font-semibold ${Math.abs(line.variance_percent) > 10 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                                {line.variance_percent.toFixed(1)}%
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                {getVarianceIcon(line.status)}
                                                <span className="text-sm capitalize">{line.status.replace('_', ' ')}</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {(!report?.lines || report.lines.length === 0) && (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                                            No budget lines found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
