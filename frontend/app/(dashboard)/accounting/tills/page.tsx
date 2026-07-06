"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, CheckCircle, Loader2, Lock, Plus, RefreshCw, XCircle } from "lucide-react";
import { format } from "date-fns";
import { accountingApi, type Account, type Till, type TillReconciliationRow } from "@/lib/api/accounting";
import { ACCOUNTING_TABLE_HEAD_CLASS } from "@/lib/constants/table-typography";
import { cn } from "@/lib/utils/cn";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { sortClientRecords, toggleSortConfig } from "@/lib/utils/table-sort";
import { getUserFacingError } from "@/lib/api/errors";

type ApiError = { response?: { data?: { error?: string; detail?: string; payment_method?: string[] } }; message?: string };
const DENOMINATIONS = ["200", "100", "50", "20", "10", "5", "2", "1", "0.50", "0.20", "0.10"];

export default function AccountingTillManagementPage() {
    const { formatCurrency } = useCurrency();
    const { success, error: toastError } = useToast();
    const queryClient = useQueryClient();
    const today = new Date().toISOString().split("T")[0];
    const [openDialog, setOpenDialog] = useState(false);
    const [closeTill, setCloseTill] = useState<Till | null>(null);
    const [movementTill, setMovementTill] = useState<Till | null>(null);
    const [selectedAccount, setSelectedAccount] = useState("");
    const [openingBalance, setOpeningBalance] = useState("");
    const [countedAmount, setCountedAmount] = useState("");
    const [useDenominationCount, setUseDenominationCount] = useState(false);
    const [denominationQuantities, setDenominationQuantities] = useState<Record<string, string>>({});
    const [varianceReason, setVarianceReason] = useState("");
    const [movementType, setMovementType] = useState<"pay_in" | "pay_out">("pay_in");
    const [movementAmount, setMovementAmount] = useState("");
    const [movementReason, setMovementReason] = useState("");
    const [reportDate, setReportDate] = useState(today);
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

    const handleSort = (field: string) => {
        setSortConfig((current) => toggleSortConfig(current, field));
    };

    const { data: accounts = [] } = useQuery({
        queryKey: ["accounting", "till-enabled-accounts"],
        queryFn: () => accountingApi.getTillEnabledAccounts(),
    });

    const { data: tills = [], isLoading: tillsLoading } = useQuery({
        queryKey: ["accounting", "tills", reportDate],
        queryFn: () => accountingApi.getTills({ date: reportDate }),
    });

    const { data: report, isLoading: reportLoading } = useQuery({
        queryKey: ["accounting", "till-reconciliation", reportDate],
        queryFn: () => accountingApi.getTillReconciliationReport({ date: reportDate }),
    });

    const openTills = useMemo(() => tills.filter((till) => till.status === "open"), [tills]);

    const sortedTills = useMemo(
        () => sortClientRecords(tills, sortConfig, {
            till_account__name: (till) => till.till_account_name ?? "",
            cashier__last_name: (till) => till.cashier_name ?? "",
            opened_at: (till) => till.opened_at,
            expected_balance: (till) => Number(till.current_expected_balance || till.expected_balance || till.opening_balance || 0),
            status: (till) => till.status,
        }),
        [tills, sortConfig],
    );

    const openMutation = useMutation({
        mutationFn: () => accountingApi.openTill({ till_account: selectedAccount, opening_balance: openingBalance || "0.00" }),
        onSuccess: () => {
            invalidateTillQueries();
            setOpenDialog(false);
            setSelectedAccount("");
            setOpeningBalance("");
            success("Till opened.");
        },
        onError: (error: unknown) => toastError(getUserFacingError(error, "Failed to open till")),
    });

    const closeMutation = useMutation({
        mutationFn: () => {
            const cash_counts = DENOMINATIONS
                .map((denomination) => ({
                    denomination,
                    quantity: Number(denominationQuantities[denomination] || 0),
                }))
                .filter((row) => row.quantity > 0);
            return accountingApi.closeTill(
                closeTill!.id,
                useDenominationCount
                    ? { cash_counts, counted_amount: countedAmount, notes: varianceReason }
                    : { counted_amount: countedAmount, notes: varianceReason }
            );
        },
        onSuccess: (data) => {
            invalidateTillQueries();
            success(`Till closed. Variance: ${formatCurrency(data.variance)}`);
            setCloseTill(null);
            setCountedAmount("");
            setVarianceReason("");
            setUseDenominationCount(false);
            setDenominationQuantities({});
        },
        onError: (error: unknown) => toastError(getUserFacingError(error, "Failed to close till")),
    });

    const movementMutation = useMutation({
        mutationFn: () => accountingApi.recordTillMovement(movementTill!.id, {
            movement_type: movementType,
            amount: movementAmount,
            reason: movementReason,
        }),
        onSuccess: () => {
            invalidateTillQueries();
            success("Cash movement recorded.");
            setMovementTill(null);
            setMovementAmount("");
            setMovementReason("");
            setMovementType("pay_in");
        },
        onError: (error: unknown) => toastError(getUserFacingError(error, "Failed to record cash movement")),
    });

    const approveVarianceMutation = useMutation({
        mutationFn: (tillId: number) => accountingApi.approveTillVariance(tillId),
        onSuccess: () => {
            invalidateTillQueries();
            success("Till variance approved.");
        },
        onError: (error: unknown) => toastError(getUserFacingError(error, "Failed to approve variance")),
    });

    function invalidateTillQueries() {
        queryClient.invalidateQueries({ queryKey: ["accounting", "tills"] });
        queryClient.invalidateQueries({ queryKey: ["accounting", "till-reconciliation"] });
    }

    const closeExpected = closeTill ? Number(closeTill.current_expected_balance || closeTill.expected_balance || closeTill.opening_balance || 0) : 0;
    const provisionalVariance = closeTill ? Number(countedAmount || 0) - closeExpected : 0;
    function updateDenomination(denomination: string, quantity: string) {
        const next = { ...denominationQuantities, [denomination]: quantity };
        setDenominationQuantities(next);
        const total = DENOMINATIONS.reduce((sum, denom) => {
            return sum + Number(denom) * Number(next[denom] || 0);
        }, 0);
        setCountedAmount(total ? total.toFixed(2) : "");
    }
    const MoneyCell = ({ value, emphasis = false }: { value: string; emphasis?: boolean }) => (
        <TableCell className={cn("px-4 py-2 text-right font-mono text-sm", emphasis && "font-semibold text-destructive")}>
            {value ? formatCurrency(value) : "-"}
        </TableCell>
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-col justify-between gap-3 border-b border-border pb-3 md:flex-row md:items-center">
                <div>
                    <h1 className="text-lg font-semibold tracking-tight text-foreground">Till Management</h1>
                    <p className="mt-0.5 text-xs text-muted-foreground">Open, monitor, and reconcile Cash & Bank till sessions</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="h-9 w-40" />
                    <Button variant="outline" size="icon" onClick={invalidateTillQueries} className="h-9 w-9"><RefreshCw className="h-4 w-4" /></Button>
                    <Button size="sm" className="h-9" onClick={() => setOpenDialog(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Open Till
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <SummaryTile title="Open Tills" value={openTills.length.toString()} />
                <SummaryTile title="Cash Received" value={formatCurrency(report?.totals.cash_received || "0")} />
                <SummaryTile title="Shortage / Excess" value={`${formatCurrency(report?.totals.shortage || "0")} / ${formatCurrency(report?.totals.excess || "0")}`} />
            </div>

            <Card>
                <CardHeader className="border-b border-border pb-3">
                    <CardTitle className="text-base">Today&apos;s Till Sessions</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/30">
                            <TableRow>
                                <SortableHeader field="till_account__name" sortConfig={sortConfig} onSort={handleSort} className={ACCOUNTING_TABLE_HEAD_CLASS}>Till Account</SortableHeader>
                                <SortableHeader field="cashier__last_name" sortConfig={sortConfig} onSort={handleSort} className={ACCOUNTING_TABLE_HEAD_CLASS}>Responsible</SortableHeader>
                                <SortableHeader field="opened_at" sortConfig={sortConfig} onSort={handleSort} className={ACCOUNTING_TABLE_HEAD_CLASS}>Opened</SortableHeader>
                                <SortableHeader field="expected_balance" sortConfig={sortConfig} onSort={handleSort} className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Expected</SortableHeader>
                                <SortableHeader field="status" sortConfig={sortConfig} onSort={handleSort} className={ACCOUNTING_TABLE_HEAD_CLASS}>Status</SortableHeader>
                                <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tillsLoading ? (
                                <TableRow><TableCell colSpan={6} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                            ) : sortedTills.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No till sessions found.</TableCell></TableRow>
                            ) : sortedTills.map((till) => (
                                <TableRow key={till.id}>
                                    <TableCell className="px-4 py-2">
                                        <Link
                                            href={`/accounting/tills/${till.id}`}
                                            className="font-medium text-primary hover:underline"
                                        >
                                            {till.till_account_code} - {till.till_account_name}
                                        </Link>
                                        <div className="text-xs text-muted-foreground">{till.branch_name}</div>
                                    </TableCell>
                                    <TableCell className="px-4 py-2 text-sm">{till.cashier_name}</TableCell>
                                    <TableCell className="px-4 py-2 text-sm">{format(new Date(till.opened_at), "MMM d, h:mm a")}</TableCell>
                                    <TableCell className="px-4 py-2 text-right font-mono text-sm">{formatCurrency(till.current_expected_balance || till.expected_balance || till.opening_balance)}</TableCell>
                                    <TableCell className="px-4 py-2"><StatusBadge till={till} /></TableCell>
                                    <TableCell className="px-4 py-2 text-right">
                                        {till.status === "open" ? (
                                            <div className="flex justify-end gap-2">
                                                <Button variant="outline" size="sm" onClick={() => setMovementTill(till)}><ArrowDownUp className="mr-2 h-4 w-4" />Move</Button>
                                                <Button variant="destructive" size="sm" onClick={() => setCloseTill(till)}><Lock className="mr-2 h-4 w-4" />Close</Button>
                                            </div>
                                        ) : till.variance_approval_status === "supervisor_required" ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={approveVarianceMutation.isPending}
                                                onClick={() => approveVarianceMutation.mutate(till.id)}
                                            >
                                                Approve Variance
                                            </Button>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">Closed</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="border-b border-border pb-3">
                    <CardTitle className="text-base">Daily Reconciliation</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/30">
                            <TableRow>
                                <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Account</TableHead>
                                <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Opening</TableHead>
                                <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Received</TableHead>
                                <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Paid Out</TableHead>
                                <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Expected</TableHead>
                                <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Actual</TableHead>
                                <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Variance</TableHead>
                                <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Approval</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reportLoading ? (
                                <TableRow><TableCell colSpan={8} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                            ) : (report?.results || []).length === 0 ? (
                                <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">No reconciliation rows for this date.</TableCell></TableRow>
                            ) : report!.results.map((row: TillReconciliationRow) => (
                                <TableRow key={row.id}>
                                    <TableCell className="px-4 py-2">
                                        <div className="font-medium">{row.till_account_code} - {row.till_account_name}</div>
                                        <div className="text-xs text-muted-foreground">{row.opened_by}</div>
                                    </TableCell>
                                    <MoneyCell value={row.opening_balance} />
                                    <MoneyCell value={row.cash_received} />
                                    <MoneyCell value={row.cash_paid_out} />
                                    <MoneyCell value={row.expected_balance} />
                                    <MoneyCell value={row.actual_counted_balance || "0"} />
                                    <MoneyCell value={row.variance || "0"} emphasis={Number(row.variance || 0) !== 0} />
                                    <TableCell className="px-4 py-2"><Badge variant="outline">{row.variance_approval_status.replace(/_/g, " ")}</Badge></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Open Till</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <Label className="mb-2 block">Cash Account</Label>
                            <select className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
                                <option value="">Select account</option>
                                {accounts.map((account: Account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label className="mb-2 block">Opening Balance</Label>
                            <Input type="number" min="0" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancel</Button>
                        <Button disabled={!selectedAccount || openMutation.isPending} onClick={() => openMutation.mutate()}>{openMutation.isPending ? "Opening..." : "Open Till"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(closeTill)} onOpenChange={(open) => !open && setCloseTill(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Close Till</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-3 gap-3 text-sm">
                            <MiniMetric label="Expected" value={formatCurrency(closeExpected)} />
                            <MiniMetric label="Counted" value={formatCurrency(countedAmount || "0")} />
                            <MiniMetric label="Variance" value={formatCurrency(provisionalVariance)} warning={Math.abs(provisionalVariance) > 0} />
                        </div>
                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <Label>Physical Cash Count</Label>
                                <Button variant="outline" size="sm" type="button" onClick={() => setUseDenominationCount((value) => !value)}>
                                    {useDenominationCount ? "Use total" : "Use denominations"}
                                </Button>
                            </div>
                            {useDenominationCount ? (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    {DENOMINATIONS.map((denomination) => (
                                        <div key={denomination} className="space-y-1">
                                            <Label className="text-xs">GHS {denomination}</Label>
                                            <Input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={denominationQuantities[denomination] || ""}
                                                onChange={(event) => updateDenomination(denomination, event.target.value)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <Input type="number" min="0" step="0.01" value={countedAmount} onChange={(e) => setCountedAmount(e.target.value)} />
                            )}
                        </div>
                        <div>
                            <Label className="mb-2 block">Variance Reason</Label>
                            <Textarea value={varianceReason} onChange={(e) => setVarianceReason(e.target.value)} rows={3} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCloseTill(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={!countedAmount || closeMutation.isPending} onClick={() => closeMutation.mutate()}>{closeMutation.isPending ? "Closing..." : "Close Till"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(movementTill)} onOpenChange={(open) => !open && setMovementTill(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Pay In / Pay Out</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <Label className="mb-2 block">Movement Type</Label>
                            <select className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm" value={movementType} onChange={(e) => setMovementType(e.target.value as "pay_in" | "pay_out")}>
                                <option value="pay_in">Pay in</option>
                                <option value="pay_out">Pay out</option>
                            </select>
                        </div>
                        <div>
                            <Label className="mb-2 block">Amount</Label>
                            <Input type="number" min="0.01" step="0.01" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} />
                        </div>
                        <div>
                            <Label className="mb-2 block">Reason</Label>
                            <Textarea value={movementReason} onChange={(e) => setMovementReason(e.target.value)} rows={3} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMovementTill(null)}>Cancel</Button>
                        <Button disabled={!movementAmount || movementMutation.isPending} onClick={() => movementMutation.mutate()}>{movementMutation.isPending ? "Saving..." : "Record"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function SummaryTile({ title, value }: { title: string; value: string }) {
    return (
        <Card>
            <CardContent className="p-4">
                <p className="text-xs uppercase text-muted-foreground">{title}</p>
                <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
            </CardContent>
        </Card>
    );
}

function MiniMetric({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
    return (
        <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
            <p className={cn("mt-1 font-mono text-sm font-semibold", warning && "text-destructive")}>{value}</p>
        </div>
    );
}

function StatusBadge({ till }: { till: Till }) {
    if (till.status === "open") {
        return <Badge variant="outline" className="border-success/20 bg-success/10 text-success"><CheckCircle className="mr-1 h-3 w-3" />Open</Badge>;
    }
    const variance = Number(till.variance || 0);
    return (
        <Badge variant="outline" className={variance === 0 ? "" : "border-destructive/20 bg-destructive/10 text-destructive"}>
            {variance === 0 ? <CheckCircle className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
            Closed
        </Badge>
    );
}
