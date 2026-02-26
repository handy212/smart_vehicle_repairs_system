"use client";

import { useQuery } from "@tanstack/react-query";
import { tillApi } from "@/lib/api/till-refund";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { exportToCSV } from "@/lib/utils/export";

import { useCurrency } from "@/lib/hooks/useCurrency";
export default function TillDetailPage() {
    const { formatCurrency } = useCurrency();
    const params = useParams();
    const router = useRouter();
    const tillId = parseInt(params.id as string);

    const { data: till, isLoading } = useQuery({
        queryKey: ['till-detail', tillId],
        queryFn: () => tillApi.get(tillId),
    });

    const handleExport = () => {
        if (!till) return;
        exportToCSV([till], `till_report_${till.id}`, [
            { key: "id", label: "Till ID" },
            { key: "cashier_name", label: "Cashier" },
            { key: "branch_name", label: "Branch" },
            { key: "status", label: "Status" },
            { key: "opening_balance", label: "Opening Balance" },
            { key: "closing_balance", label: "Closing Balance" },
            { key: "expected_balance", label: "Expected Balance" },
            { key: "variance", label: "Variance" },
            { key: "opened_at", label: "Opened At" },
            { key: "closed_at", label: "Closed At" },
        ]);
    };

    if (isLoading) {
        return (
            <div className="p-8 space-y-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }

    if (!till) {
        return (
            <div className="p-8">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-center text-muted-foreground">Till not found</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-6">
            <Button variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Tills
            </Button>

            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Till #{till.id}</h1>
                    <p className="text-muted-foreground mt-1">{till.cashier_name} • {till.branch_name}</p>
                </div>
                <div className="flex gap-2">
                    <Badge variant={till.status === 'open' ? 'success' : 'secondary'} className="px-4 py-1 text-sm">
                        {till.status.toUpperCase()}
                    </Badge>
                    <Button variant="outline" onClick={handleExport}>
                        <Download className="mr-2 h-4 w-4" />
                        Export
                    </Button>
                </div>
            </div>

            {/* Till Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm text-muted-foreground">Opening Balance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold">${parseFloat(till.opening_balance).toLocaleString()}</p>
                    </CardContent>
                </Card>

                {till.status === 'closed' && (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm text-muted-foreground">Closing Balance</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">${parseFloat(till.closing_balance || '0').toLocaleString()}</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm text-muted-foreground">Expected Balance</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">${parseFloat(till.expected_balance || '0').toLocaleString()}</p>
                            </CardContent>
                        </Card>

                        <Card className={till.is_balanced ? 'border-green-500' : 'border-red-500'}>
                            <CardHeader>
                                <CardTitle className="text-sm text-muted-foreground">Variance</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className={`text-3xl font-bold ${till.is_balanced ? 'text-success' : 'text-red-600'}`}>
                                    {till.variance && parseFloat(till.variance) >= 0 ? '+' : ''}${parseFloat(till.variance || '0').toLocaleString()}
                                </p>
                                <p className="text-sm mt-2">
                                    {till.is_balanced ? '✓ Balanced' : '✗ Not Balanced'}
                                </p>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            {/* Times */}
            <Card>
                <CardHeader>
                    <CardTitle>Times</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                            <p className="text-sm text-muted-foreground">Opened At</p>
                            <p className="font-semibold">{format(new Date(till.opened_at), 'MMM dd, yyyy h:mm a')}</p>
                        </div>
                        {till.closed_at && (
                            <div>
                                <p className="text-sm text-muted-foreground">Closed At</p>
                                <p className="font-semibold">{format(new Date(till.closed_at), 'MMM dd, yyyy h:mm a')}</p>
                            </div>
                        )}
                        <div>
                            <p className="text-sm text-muted-foreground">Duration</p>
                            <p className="font-semibold">{till.duration || 'N/A'}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Cash Counts */}
            {till.cash_counts && till.cash_counts.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Cash Counts</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">

                            {till.cash_counts.map((count: any) => (
                                <div key={count.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="flex items-center gap-4">
                                        <span className="font-semibold">{formatCurrency(parseFloat(count.denomination))}</span>
                                        <span className="text-muted-foreground">×</span>
                                        <span className="font-mono">{count.quantity}</span>
                                    </div>
                                    <span className="font-mono font-bold">${parseFloat(count.total).toLocaleString()}</span>
                                </div>
                            ))}
                            <div className="border-t pt-3 flex justify-between items-center">
                                <span className="font-semibold">Total Counted:</span>
                                <span className="text-2xl font-bold">

                                    ${till.cash_counts.reduce((sum: number, c: any) => sum + parseFloat(c.total), 0).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Notes */}
            {till.notes && (
                <Card>
                    <CardHeader>
                        <CardTitle>Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm">{till.notes}</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
