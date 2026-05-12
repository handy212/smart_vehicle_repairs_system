"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { tillApi, type CashCount, type TillCashMovement } from "@/lib/api/till-refund";
import { RecordTillMovementDialog } from "@/components/billing/RecordTillMovementDialog";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, ArrowDownUp } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { exportMultiSheetXlsx } from "@/lib/utils/export";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useCurrency } from "@/lib/hooks/useCurrency";

export default function TillDetailPage() {
    const { formatCurrency } = useCurrency();
    const params = useParams();
    const router = useRouter();
    const tillId = parseInt(params.id as string);

    const { user } = useAuthStore();
    const [movementDialogOpen, setMovementDialogOpen] = useState(false);

    const { data: till, isLoading } = useQuery({
        queryKey: ['till-detail', tillId],
        queryFn: () => tillApi.get(tillId),
    });

    const { data: movements = [] } = useQuery({
        queryKey: ["till-movements", tillId],
        queryFn: () => tillApi.listMovements(tillId),
        enabled: Number.isFinite(tillId) && tillId > 0,
    });

    const handleExport = () => {
        if (!till) return;

        const summary: Record<string, unknown> = {
            id: till.id,
            cashier_name: till.cashier_name,
            branch_name: till.branch_name,
            status: till.status,
            opening_balance: till.opening_balance,
            cash_payments_total: till.cash_payments_total ?? "0",
            cash_refunds_total: till.cash_refunds_total ?? "0",
            till_cash_movements_net: till.till_cash_movements_net ?? "0",
            current_expected_balance: till.current_expected_balance ?? "",
            expected_balance: till.expected_balance ?? "",
            closing_balance: till.closing_balance ?? "",
            variance: till.variance ?? "",
            opened_at: till.opened_at,
            closed_at: till.closed_at ?? "",
            duration: till.duration ?? "",
            notes: till.notes ?? "",
        };

        const movementRows: Record<string, unknown>[] = movements.map((m) => ({
            id: m.id,
            created_at: m.created_at,
            movement_type: m.movement_type,
            amount: m.amount,
            recorded_by_name: m.recorded_by_name,
            reason: m.reason || "",
        }));

        exportMultiSheetXlsx(
            [
                {
                    name: "Till summary",
                    headers: [
                        { key: "id", label: "Till ID" },
                        { key: "cashier_name", label: "Cashier" },
                        { key: "branch_name", label: "Branch" },
                        { key: "status", label: "Status" },
                        { key: "opening_balance", label: "Opening Balance" },
                        { key: "cash_payments_total", label: "Cash Collected" },
                        { key: "cash_refunds_total", label: "Cash Refunded" },
                        { key: "till_cash_movements_net", label: "Net pay in / pay out" },
                        { key: "current_expected_balance", label: "Expected (book) at export" },
                        { key: "expected_balance", label: "Expected at close" },
                        { key: "closing_balance", label: "Closing Balance" },
                        { key: "variance", label: "Variance" },
                        { key: "opened_at", label: "Opened At" },
                        { key: "closed_at", label: "Closed At" },
                        { key: "duration", label: "Duration" },
                        { key: "notes", label: "Notes" },
                    ],
                    rows: [summary],
                },
                {
                    name: "Drawer movements",
                    headers: [
                        { key: "id", label: "Movement ID" },
                        { key: "created_at", label: "When" },
                        { key: "movement_type", label: "Type" },
                        { key: "amount", label: "Amount" },
                        { key: "recorded_by_name", label: "Recorded by" },
                        { key: "reason", label: "Reason" },
                    ],
                    rows: movementRows.length > 0 ? movementRows : [],
                },
            ],
            `till_report_${till.id}`
        );
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

    const netMove = parseFloat(till.till_cash_movements_net || "0");
    const canRecordMovement =
        till.status === "open" && user?.id === till.cashier;

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
                <div className="flex flex-wrap gap-2">
                    {canRecordMovement && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setMovementDialogOpen(true)}
                        >
                            <ArrowDownUp className="mr-2 h-4 w-4" />
                            Pay in / Pay out
                        </Button>
                    )}
                    <Badge variant={till.status === 'open' ? 'success' : 'secondary'} className="px-4 py-1 text-sm">
                        {till.status.toUpperCase()}
                    </Badge>
                    <Button variant="outline" onClick={() => handleExport()} title="Download Excel with Till summary and Drawer movements sheets">
                        <Download className="mr-2 h-4 w-4" />
                        Export Excel
                    </Button>
                </div>
            </div>

            {/* Summary + times (compact tiles, estimate-style) */}
            <Card className="border shadow-sm">
                <CardContent className="py-4 px-4 sm:px-6">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                        <div className="rounded-md border bg-muted/30 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Opening
                            </p>
                            <p className="mt-1.5 text-sm font-semibold tabular-nums">
                                {formatCurrency(parseFloat(till.opening_balance))}
                            </p>
                        </div>
                        <div className="rounded-md border bg-muted/30 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Collected
                            </p>
                            <p className="mt-1.5 text-sm font-semibold tabular-nums">
                                {formatCurrency(parseFloat(till.cash_payments_total || "0"))}
                            </p>
                        </div>
                        <div className="rounded-md border bg-muted/30 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Refunded
                            </p>
                            <p className="mt-1.5 text-sm font-semibold tabular-nums">
                                {formatCurrency(parseFloat(till.cash_refunds_total || "0"))}
                            </p>
                        </div>
                        <div className="rounded-md border bg-muted/30 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Net pay in / out
                            </p>
                            <p
                                className={`mt-1.5 text-sm font-semibold tabular-nums ${
                                    netMove < 0 ? "text-destructive" : ""
                                }`}
                            >
                                {netMove > 0 ? "+" : ""}
                                {formatCurrency(netMove)}
                            </p>
                        </div>
                        {till.status === "open" && (
                            <div className="rounded-md border bg-muted/30 p-3 col-span-2 sm:col-span-1">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Expected (book)
                                </p>
                                <p className="mt-1.5 text-sm font-semibold tabular-nums">
                                    {formatCurrency(
                                        parseFloat(
                                            till.current_expected_balance || till.opening_balance
                                        )
                                    )}
                                </p>
                            </div>
                        )}
                        {till.status === "closed" && (
                            <>
                                <div className="rounded-md border bg-muted/30 p-3">
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                        Closing
                                    </p>
                                    <p className="mt-1.5 text-sm font-semibold tabular-nums">
                                        {formatCurrency(parseFloat(till.closing_balance || "0"))}
                                    </p>
                                </div>
                                <div className="rounded-md border bg-muted/30 p-3">
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                        Expected at close
                                    </p>
                                    <p className="mt-1.5 text-sm font-semibold tabular-nums">
                                        {formatCurrency(parseFloat(till.expected_balance || "0"))}
                                    </p>
                                </div>
                                <div
                                    className={`rounded-md border p-3 ${
                                        till.is_balanced
                                            ? "border-green-500/40 bg-green-500/5"
                                            : "border-destructive/40 bg-destructive/5"
                                    }`}
                                >
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                        Variance
                                    </p>
                                    <p
                                        className={`mt-1.5 text-sm font-semibold tabular-nums ${
                                            till.is_balanced ? "text-success" : "text-destructive"
                                        }`}
                                    >
                                        {till.variance && parseFloat(till.variance) >= 0 ? "+" : ""}
                                        {formatCurrency(parseFloat(till.variance || "0"))}
                                    </p>
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                        {till.is_balanced ? "Balanced" : "Not balanced"}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
                        <span>
                            Opened{" "}
                            <span className="font-medium text-foreground">
                                {format(new Date(till.opened_at), "MMM d, yyyy h:mm a")}
                            </span>
                        </span>
                        {till.closed_at && (
                            <span>
                                Closed{" "}
                                <span className="font-medium text-foreground">
                                    {format(new Date(till.closed_at), "MMM d, yyyy h:mm a")}
                                </span>
                            </span>
                        )}
                        <span>
                            Duration{" "}
                            <span className="font-medium text-foreground">{till.duration || "—"}</span>
                        </span>
                    </div>
                </CardContent>
            </Card>

            {canRecordMovement && (
                <RecordTillMovementDialog
                    tillId={till.id}
                    open={movementDialogOpen}
                    onOpenChange={setMovementDialogOpen}
                />
            )}

            {/* Pay in / pay out audit */}
            <Card>
                <CardHeader className="py-3 px-4 sm:px-6 border-b">
                    <CardTitle className="text-base">Drawer movements</CardTitle>
                    <p className="text-sm text-muted-foreground font-normal">
                        Pay in and pay out entries for this till. Use <strong>Export Excel</strong> above to
                        download summary and this list.
                    </p>
                </CardHeader>
                <CardContent>
                    {movements.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No movements recorded.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>When</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead>By</TableHead>
                                    <TableHead>Reason</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {movements.map((m: TillCashMovement) => (
                                    <TableRow key={m.id}>
                                        <TableCell className="whitespace-nowrap text-sm">
                                            {format(new Date(m.created_at), "MMM d, yyyy h:mm a")}
                                        </TableCell>
                                        <TableCell>
                                            {m.movement_type === "pay_in" ? "Pay in" : "Pay out"}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            {m.movement_type === "pay_in" ? "+" : "−"}
                                            {formatCurrency(parseFloat(m.amount))}
                                        </TableCell>
                                        <TableCell className="text-sm">{m.recorded_by_name}</TableCell>
                                        <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                                            {m.reason || "—"}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Cash counts */}
            {till.cash_counts && till.cash_counts.length > 0 && (
                <Card>
                    <CardHeader className="py-3 px-4 sm:px-6 border-b">
                        <CardTitle className="text-base">Cash counts</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">

                            {till.cash_counts.map((count: CashCount) => (
                                <div key={count.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="flex items-center gap-4">
                                        <span className="font-semibold">{formatCurrency(parseFloat(count.denomination))}</span>
                                        <span className="text-muted-foreground">×</span>
                                        <span className="font-mono">{count.quantity}</span>
                                    </div>
                                    <span className="font-mono font-bold">{formatCurrency(parseFloat(count.total))}</span>
                                </div>
                            ))}
                            <div className="border-t pt-3 flex justify-between items-center">
                                <span className="font-semibold">Total Counted:</span>
                                <span className="text-lg font-bold">

                                    {formatCurrency(till.cash_counts.reduce((sum: number, c: CashCount) => sum + parseFloat(c.total), 0))}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {till.notes && (
                <Card>
                    <CardHeader className="py-3 px-4 sm:px-6 border-b">
                        <CardTitle className="text-base">Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm">{till.notes}</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
