"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { tillApi, type Till } from "@/lib/api/till-refund";
import { RecordTillMovementDialog } from "@/components/billing/RecordTillMovementDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Clock, CheckCircle, AlertCircle, Plus, X, ArrowDownUp } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useCurrency } from "@/lib/hooks/useCurrency";

export default function TillDashboardPage() {
    const { formatCurrency } = useCurrency();
    const [movementDialogOpen, setMovementDialogOpen] = useState(false);

    const { data: currentTill, isLoading: currentLoading } = useQuery({
        queryKey: ['current-till'],
        queryFn: () => tillApi.getCurrent(),
        retry: false,
    });

    const { data: todayTills } = useQuery({
        queryKey: ['today-tills'],
        queryFn: () => tillApi.list({ date: new Date().toISOString().split('T')[0] }),
    });

    if (currentLoading) {
        return (
            <div className="p-8">
                <div className="text-center">Loading...</div>
            </div>
        );
    }

    const hasOpenTill = currentTill && currentTill.id;

    return (
        <div className="space-y-4 min-h-screen">
            <div className="flex items-center justify-between pt-2">
                <div>
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                        <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
                        <span>/</span>
                        <Link href="/billing" className="hover:text-primary transition-colors">Billing</Link>
                        <span>/</span>
                        <span className="text-foreground font-medium">Till Management</span>
                    </div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">Till Management</h1>
                </div>
                {!hasOpenTill && (
                    <Link href="/billing/tills/open">
                        <Button size="sm" className="h-9">
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            Open Till
                        </Button>
                    </Link>
                )}
            </div>

            {/* Current Till Status */}
            {hasOpenTill ? (
                <Card className="border-l-4 border-l-green-500">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <CheckCircle className="h-5 w-5 text-success" />
                                    Till #{currentTill.id} - OPEN
                                </CardTitle>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Opened {format(new Date(currentTill.opened_at), 'MMM dd, yyyy h:mm a')}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setMovementDialogOpen(true)}
                                >
                                    <ArrowDownUp className="mr-2 h-4 w-4" />
                                    Pay in / Pay out
                                </Button>
                                <Link href={`/billing/tills/${currentTill.id}/close`}>
                                    <Button variant="destructive">
                                        <X className="mr-2 h-4 w-4" />
                                        Close Till
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Opening Balance</p>
                                <p className="text-2xl font-bold">{formatCurrency(parseFloat(currentTill.opening_balance))}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Expected Cash</p>
                                <p className="text-2xl font-bold">{formatCurrency(parseFloat(currentTill.current_expected_balance || currentTill.opening_balance))}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Duration</p>
                                <p className="text-2xl font-bold">{currentTill.duration || '0h 0m'}</p>
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-3 border-t pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                                <p className="text-muted-foreground">Cash Collected</p>
                                <p className="font-mono font-semibold">{formatCurrency(parseFloat(currentTill.cash_payments_total || "0"))}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Cash Refunds</p>
                                <p className="font-mono font-semibold">{formatCurrency(parseFloat(currentTill.cash_refunds_total || "0"))}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Net pay in / pay out</p>
                                <p className={`font-mono font-semibold ${parseFloat(currentTill.till_cash_movements_net || "0") < 0 ? "text-destructive" : ""}`}>
                                    {parseFloat(currentTill.till_cash_movements_net || "0") > 0 ? "+" : ""}
                                    {formatCurrency(parseFloat(currentTill.till_cash_movements_net || "0"))}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Branch</p>
                                <p className="font-semibold">{currentTill.branch_name}</p>
                            </div>
                        </div>
                        <RecordTillMovementDialog
                            tillId={currentTill.id}
                            open={movementDialogOpen}
                            onOpenChange={setMovementDialogOpen}
                        />
                    </CardContent>
                </Card>
            ) : (
                <Card className="shadow-none border-none bg-muted/50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                                <div>
                                    <p className="font-semibold text-foreground">No Open Till</p>
                                    <p className="text-xs text-muted-foreground">Open a till to start processing cash transactions</p>
                                </div>
                            </div>
                            <Link href="/billing/tills/open">
                                <Button size="sm" className="h-8">
                                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                                    Open Till Now
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Today&apos;s Tills */}
            <Card>
                <CardHeader>
                    <CardTitle>Today&apos;s Tills</CardTitle>
                </CardHeader>
                <CardContent>
                    {todayTills && todayTills.results && todayTills.results.length > 0 ? (
                        <div className="space-y-3">
                            {todayTills.results.map((till: Till) => (
                                <div
                                    key={till.id}
                                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted hover:bg-muted/50"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col">
                                            <span className="font-semibold">Till #{till.id}</span>
                                            <span className="text-sm text-muted-foreground">{till.cashier_name}</span>
                                        </div>
                                        <Badge variant={till.status === 'open' ? 'success' : 'secondary'}>
                                            {till.status.toUpperCase()}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="text-right">
                                            <p className="text-sm text-muted-foreground">Opening</p>
                                            <p className="font-mono font-semibold">{formatCurrency(parseFloat(till.opening_balance))}</p>
                                        </div>
                                        {till.status === 'closed' && (
                                            <>
                                                <div className="text-right">
                                                    <p className="text-sm text-muted-foreground">Closing</p>
                                                    <p className="font-mono font-semibold">{formatCurrency(parseFloat(till.closing_balance || "0"))}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm text-muted-foreground">Variance</p>
                                                    <p className={`font-mono font-semibold ${till.is_balanced ? 'text-success' : 'text-destructive'
                                                        }`}>
                                                        {parseFloat(till.variance || "0") >= 0 ? "+" : ""}
                                                        {formatCurrency(parseFloat(till.variance || "0"))}
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                        <Link href={`/billing/tills/${till.id}`}>
                                            <Button variant="outline" size="sm">View</Button>
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            No tills opened today
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Quick Links */}
            <div className="grid grid-cols-3 gap-4">
                <Link href="/billing/tills/history?status=open">
                    <Card className="cursor-pointer hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                                    <CheckCircle className="h-6 w-6 text-success" />
                                </div>
                                <div>
                                    <p className="font-semibold">Open Tills</p>
                                    <p className="text-sm text-muted-foreground">View all open tills</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/billing/tills/history?status=closed">
                    <Card className="cursor-pointer hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-border rounded-lg">
                                    <Clock className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="font-semibold">Till History</p>
                                    <p className="text-sm text-muted-foreground">View closed tills</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/billing/refunds">
                    <Card className="cursor-pointer hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                                    <DollarSign className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                    <p className="font-semibold">Refunds</p>
                                    <p className="text-sm text-muted-foreground">Manage refunds</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    );
}
