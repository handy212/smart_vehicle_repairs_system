"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
    Banknote, CheckCircle2, CreditCard, History, Lock, MoreVertical, Play,
    RotateCcw, User,
} from "lucide-react";
import { hrApi, PaySlip, PayrollPeriod } from "@/lib/api/hr";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard"
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import { toast } from "sonner";
import { PayslipDetailDialog } from "./PayslipDetailDialog";
import { getUserFacingError } from "@/lib/api/errors";

type ApiError = {
    response?: {
        data?: {
            detail?: string;
            error?: string;
            message?: string;
            non_field_errors?: string[];
        } | Record<string, unknown>;
    };
};

function money(value?: string | number | null) {
    const parsed = typeof value === "number" ? value : parseFloat(value || "0");
    return parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusConfig(status: string) {
    switch (status) {
        case "draft": return { color: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400", label: "Draft" };
        case "processing": return { color: "bg-info/10 text-blue-700 border-info/20 dark:bg-blue-900/20 dark:text-blue-400", label: "Processing" };
        case "approved": return { color: "bg-warning/10 text-amber-700 border-warning/20 dark:bg-amber-900/20 dark:text-amber-400", label: "Approved" };
        case "paid": return { color: "bg-success/10 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400", label: "Paid" };
        case "reversed": return { color: "bg-destructive/10 text-destructive border-destructive/20", label: "Reversed" };
        default: return { color: "", label: status };
    }
}

export default function PayrollPeriodDetailPage() {
    return (
        <PermissionPageGuard permission="view_payroll">
            <PayrollPeriodDetail />
        </PermissionPageGuard>
    );
}

function PayrollPeriodDetail() {
    const params = useParams();
    const periodId = Number(params.id);
    const queryClient = useQueryClient();
    const [selectedPayslip, setSelectedPayslip] = useState<PaySlip | null>(null);
    const [showPaymentDialog, setShowPaymentDialog] = useState(false);
    const [showReverseDialog, setShowReverseDialog] = useState(false);

    const { data: period, isLoading: loadingPeriod } = useQuery({
        queryKey: ["hr", "payroll-period", periodId],
        queryFn: async () => (await hrApi.payrollPeriods.get(periodId)).data,
    });

    const { data: payslipsData, isLoading: loadingPayslips } = useQuery({
        queryKey: ["hr", "payslips", periodId],
        queryFn: async () => (await hrApi.payslips.list({ payroll_period: periodId })).data,
    });

    const { data: auditData } = useQuery({
        queryKey: ["hr", "payroll-audit-logs", periodId],
        queryFn: async () => (await hrApi.payrollAuditLogs.list({ payroll_period: periodId })).data,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["hr", "payroll-period", periodId] });
        queryClient.invalidateQueries({ queryKey: ["hr", "payslips", periodId] });
        queryClient.invalidateQueries({ queryKey: ["hr", "payroll-audit-logs", periodId] });
    };

    const processMutation = useMutation({
        mutationFn: () => hrApi.payrollPeriods.process(periodId),
        onSuccess: () => {
            toast.success("Payroll processed");
            invalidate();
        },
        onError: (error) => toast.error(getUserFacingError(error, "Failed to process payroll")),
    });

    const approveMutation = useMutation({
        mutationFn: () => hrApi.payrollPeriods.approve(periodId),
        onSuccess: () => {
            toast.success("Payroll approved and payslips locked");
            invalidate();
        },
        onError: (error) => toast.error(getUserFacingError(error, "Failed to approve payroll")),
    });

    const markPaidMutation = useMutation({
        mutationFn: (data: { payment_date?: string; payment_reference?: string; payment_batch_reference?: string }) =>
            hrApi.payrollPeriods.markPaid(periodId, data),
        onSuccess: () => {
            toast.success("Payroll marked as paid");
            setShowPaymentDialog(false);
            invalidate();
        },
        onError: (error) => toast.error(getUserFacingError(error, "Failed to mark payroll as paid")),
    });

    const reverseMutation = useMutation({
        mutationFn: (reason: string) => hrApi.payrollPeriods.reverse(periodId, { reason }),
        onSuccess: () => {
            toast.success("Payroll reversed");
            setShowReverseDialog(false);
            invalidate();
        },
        onError: (error) => toast.error(getUserFacingError(error, "Failed to reverse payroll")),
    });

    const payslips = payslipsData?.results ?? [];
    const auditLogs = auditData?.results ?? [];
    const totalGross = payslips.reduce((s, p) => s + parseFloat(p.gross_pay || "0"), 0);
    const totalAdjustments = payslips.reduce(
        (s, p) => s + parseFloat(p.unpaid_leave_deduction || "0") + parseFloat(p.absence_deduction || "0"),
        0,
    );
    const totalDeductions = payslips.reduce((s, p) => {
        const componentDeductions = Object.values(p.deductions || {}).reduce((a, v) => a + parseFloat(String(v || "0")), 0);
        return s + componentDeductions + parseFloat(p.tax_amount || "0") + parseFloat(p.unpaid_leave_deduction || "0") + parseFloat(p.absence_deduction || "0");
    }, 0);
    const totalNet = payslips.reduce((s, p) => s + parseFloat(p.net_pay || "0"), 0);

    if (loadingPeriod) {
        return (
            <div className="space-y-4">
                <div className="h-12 rounded-md bg-muted animate-pulse" />
                <div className="h-24 rounded-md bg-muted animate-pulse" />
                <div className="h-64 rounded-md bg-muted animate-pulse" />
            </div>
        );
    }

    if (!period) {
        return (
            <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
                <p className="text-sm">Payroll period not found</p>
                <Button variant="outline" className="mt-4" asChild>
                    <Link href="/hr/payroll">Back to Payroll</Link>
                </Button>
            </div>
        );
    }

    const cfg = statusConfig(period.status);

    return (
        <div className="space-y-4">
            <DynamicPageTitle title={`Payroll - ${period.name}`} />
            <StaffPageHeader
                title={period.name}
                breadcrumbs={[
                    { label: "Dashboard", href: "/dashboard" },
                    { label: "HR", href: "/hr" },
                    { label: "Payroll", href: "/hr/payroll" },
                    { label: period.name },
                ]}
                actions={
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" asChild>
                            <Link href={`/hr/payroll/${periodId}/register`}>Payroll Register</Link>
                        </Button>
                        <PermissionGuard permissions={["process_payroll", "manage_payroll"]}>
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {period.status === "draft" && (
                                    <DropdownMenuItem disabled={processMutation.isPending} onClick={() => processMutation.mutate()}>
                                        <Play className="mr-2 h-4 w-4" />Process Payroll
                                    </DropdownMenuItem>
                                )}
                                {period.status === "processing" && (
                                    <DropdownMenuItem disabled={approveMutation.isPending} onClick={() => approveMutation.mutate()}>
                                        <CheckCircle2 className="mr-2 h-4 w-4" />Approve
                                    </DropdownMenuItem>
                                )}
                                {period.status === "approved" && (
                                    <DropdownMenuItem onClick={() => setShowPaymentDialog(true)}>
                                        <CreditCard className="mr-2 h-4 w-4" />Mark Paid
                                    </DropdownMenuItem>
                                )}
                                {period.status === "paid" && (
                                    <DropdownMenuItem className="text-destructive" onClick={() => setShowReverseDialog(true)}>
                                        <RotateCcw className="mr-2 h-4 w-4" />Reverse Payroll
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                    <Link href="/hr/payroll">Back to Payroll</Link>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                            </DropdownMenu>
                        </PermissionGuard>
                    </div>
                }
            />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <SummaryCard label="Status" value={cfg.label} badgeClass={cfg.color} sub={period.payment_batch_reference || undefined} />
                <SummaryCard label="Period" value={`${period.start_date} to ${period.end_date}`} sub={period.branch_name} />
                <SummaryCard label="Gross" value={money(totalGross)} />
                <SummaryCard label="Adjustments" value={money(totalAdjustments)} tone="danger" />
                <SummaryCard label="Deductions" value={money(totalDeductions)} tone="danger" />
                <SummaryCard label="Net Pay" value={money(totalNet)} tone="success" />
            </div>

            {(period.journal_entry_id || period.reversal_reason || period.paid_at || period.reversed_at) && (
                <div className="grid gap-3 md:grid-cols-3">
                    <SummaryCard label="Journal Entry" value={period.journal_entry_id ? `#${period.journal_entry_id}` : "-"} />
                    <SummaryCard label="Paid At" value={period.paid_at ? new Date(period.paid_at).toLocaleString() : "-"} />
                    <SummaryCard label="Reversal" value={period.reversal_reason || "-"} sub={period.reversed_at ? new Date(period.reversed_at).toLocaleString() : undefined} />
                </div>
            )}

            {period.notes && (
                <Card className="border shadow-sm">
                    <CardContent className="p-3">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
                        <p className="text-sm">{period.notes}</p>
                    </CardContent>
                </Card>
            )}

            <Card className="border-t shadow-sm">
                <CardHeader className="border-b bg-muted/30 px-4 py-3">
                    <CardTitle className="text-sm font-semibold">Payslips ({payslips.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loadingPayslips ? (
                        <div className="space-y-2 p-4">
                            {[1, 2, 3].map((i) => <div key={i} className="h-11 rounded-md bg-muted animate-pulse" />)}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <TableHead className="h-9 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Staff</TableHead>
                                    <TableHead className="h-9 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payslip #</TableHead>
                                    <TableHead className="h-9 px-4 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Basic</TableHead>
                                    <TableHead className="h-9 px-4 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Adjustments</TableHead>
                                    <TableHead className="h-9 px-4 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Gross</TableHead>
                                    <TableHead className="h-9 px-4 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Deductions</TableHead>
                                    <TableHead className="h-9 px-4 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Net</TableHead>
                                    <TableHead className="h-9 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                                    <TableHead className="h-9 px-4 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payslips.length > 0 ? payslips.map((slip) => {
                                    const slipAdjustments = parseFloat(slip.unpaid_leave_deduction || "0") + parseFloat(slip.absence_deduction || "0");
                                    const slipDeductions = parseFloat(slip.gross_pay || "0") - parseFloat(slip.net_pay || "0");
                                    return (
                                        <TableRow key={slip.id} className="border-b hover:bg-muted/50">
                                            <TableCell className="px-4 py-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                                                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                                                    </div>
                                                    <span className="text-sm font-medium">{slip.staff_name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 font-mono text-xs text-muted-foreground">{slip.payslip_number || `#${slip.id}`}</TableCell>
                                            <TableCell className="px-4 py-2 text-right font-mono text-sm">{money(slip.basic_salary)}</TableCell>
                                            <TableCell className="px-4 py-2 text-right font-mono text-sm text-destructive">{money(slipAdjustments)}</TableCell>
                                            <TableCell className="px-4 py-2 text-right font-mono text-sm font-medium">{money(slip.gross_pay)}</TableCell>
                                            <TableCell className="px-4 py-2 text-right font-mono text-sm text-destructive">{money(slipDeductions)}</TableCell>
                                            <TableCell className="px-4 py-2 text-right font-mono text-sm font-bold text-success">{money(slip.net_pay)}</TableCell>
                                            <TableCell className="px-4 py-2">
                                                <div className="flex items-center gap-1.5">
                                                    <Badge variant="outline" className={cn("border px-2 py-0.5 text-[10px] capitalize shadow-none", statusConfig(slip.status).color)}>
                                                        {slip.status}
                                                    </Badge>
                                                    {slip.is_locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right">
                                                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSelectedPayslip(slip)}>View</Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                }) : (
                                    <TableRow>
                                        <TableCell colSpan={9} className="h-32 text-center">
                                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                <Banknote className="mb-2 h-8 w-8 opacity-50" />
                                                <p className="text-sm">No payslips generated yet</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Card className="border-t shadow-sm">
                <CardHeader className="border-b bg-muted/30 px-4 py-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        <History className="h-4 w-4" />
                        Payroll Audit Trail
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="h-9 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                                <TableHead className="h-9 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Action</TableHead>
                                <TableHead className="h-9 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">User</TableHead>
                                <TableHead className="h-9 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Details</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {auditLogs.length > 0 ? auditLogs.map((log) => (
                                <TableRow key={log.id} className="border-b">
                                    <TableCell className="px-4 py-2 text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</TableCell>
                                    <TableCell className="px-4 py-2 text-sm font-medium capitalize">{log.action.replaceAll("_", " ")}</TableCell>
                                    <TableCell className="px-4 py-2 text-sm">{log.performed_by_name || "-"}</TableCell>
                                    <TableCell className="max-w-xl truncate px-4 py-2 text-xs text-muted-foreground">
                                        {Object.entries(log.changes || {}).map(([key, value]) => `${key}: ${String(value)}`).join(" | ") || "-"}
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">No payroll audit events yet</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <PayslipDetailDialog payslip={selectedPayslip} open={!!selectedPayslip} onOpenChange={(open) => !open && setSelectedPayslip(null)} />
            <MarkPaidDialog period={period} open={showPaymentDialog} onOpenChange={setShowPaymentDialog} onSubmit={(data) => markPaidMutation.mutate(data)} isPending={markPaidMutation.isPending} />
            <ReversePayrollDialog period={period} open={showReverseDialog} onOpenChange={setShowReverseDialog} onSubmit={(reason) => reverseMutation.mutate(reason)} isPending={reverseMutation.isPending} />
        </div>
    );
}

function SummaryCard({ label, value, sub, tone, badgeClass }: { label: string; value: string; sub?: string; tone?: "success" | "danger"; badgeClass?: string }) {
    return (
        <Card className="border shadow-sm">
            <CardContent className="p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                {badgeClass ? (
                    <Badge variant="outline" className={cn("mt-1 border px-2 py-0.5 text-[10px] shadow-none", badgeClass)}>{value}</Badge>
                ) : (
                    <p className={cn("mt-1 truncate text-sm font-semibold", tone === "success" && "text-success", tone === "danger" && "text-destructive")}>{value}</p>
                )}
                {sub && <p className="mt-1 truncate text-[10px] text-muted-foreground">{sub}</p>}
            </CardContent>
        </Card>
    );
}

function MarkPaidDialog({ period, open, onOpenChange, onSubmit, isPending }: {
    period: PayrollPeriod | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: { payment_date?: string; payment_reference?: string; payment_batch_reference?: string }) => void;
    isPending: boolean;
}) {
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
    const [paymentReference, setPaymentReference] = useState("");
    const [batchReference, setBatchReference] = useState("");

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Mark Payroll Paid</DialogTitle>
                    <DialogDescription>Record payment details for {period?.name}.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-xs">
                        <div><p className="text-muted-foreground">Payslips</p><p className="font-semibold">{period?.total_payslips ?? 0}</p></div>
                        <div className="text-right"><p className="text-muted-foreground">Net Pay</p><p className="font-semibold">{money(period?.total_net_pay)}</p></div>
                    </div>
                    <div className="space-y-1.5"><Label htmlFor="payment-date">Payment Date</Label><Input id="payment-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label htmlFor="payment-ref">Payment Reference</Label><Input id="payment-ref" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Bank transfer reference" /></div>
                    <div className="space-y-1.5"><Label htmlFor="batch-ref">Batch Reference</Label><Input id="batch-ref" value={batchReference} onChange={(e) => setBatchReference(e.target.value)} placeholder="Payroll batch/file reference" /></div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => onSubmit({ payment_date: paymentDate, payment_reference: paymentReference, payment_batch_reference: batchReference || paymentReference })} disabled={!paymentDate || isPending}>
                        {isPending ? "Posting..." : "Mark Paid"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ReversePayrollDialog({ period, open, onOpenChange, onSubmit, isPending }: {
    period: PayrollPeriod | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (reason: string) => void;
    isPending: boolean;
}) {
    const [reason, setReason] = useState("");

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Reverse Payroll</DialogTitle>
                    <DialogDescription>Reverse {period?.name} and create the accounting reversal entry.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-2">
                    <Label htmlFor="reversal-reason">Reason</Label>
                    <Textarea id="reversal-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for reversal" />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={() => onSubmit(reason)} disabled={!reason.trim() || isPending}>
                        {isPending ? "Reversing..." : "Reverse Payroll"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
