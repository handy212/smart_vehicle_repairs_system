"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, PayrollPeriod } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Banknote, Plus, Filter, ArrowRight, CheckCircle2, Play, CreditCard,
    Pencil, Trash2, MoreVertical, RotateCcw,
} from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard"
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import {
    Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { TaxRulesDialog } from "./TaxRulesDialog";
import { Calculator } from "lucide-react";
import { getUserFacingError } from "@/lib/api/errors";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { sortOrderingParam, toggleSortConfig } from "@/lib/utils/table-sort";

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

export default function PayrollPage() {
    return (
        <PermissionPageGuard permission="view_payroll">
            <DynamicPageTitle title="Payroll" />
            <PayrollContent />
        </PermissionPageGuard>
    );
}

function PayrollContent() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [showCreate, setShowCreate] = useState(false);
    const [showTaxRules, setShowTaxRules] = useState(false);
    const [editingPeriod, setEditingPeriod] = useState<PayrollPeriod | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [paymentPeriod, setPaymentPeriod] = useState<PayrollPeriod | null>(null);
    const [reversingPeriod, setReversingPeriod] = useState<PayrollPeriod | null>(null);
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

    const handleSort = (field: string) => {
        setSortConfig((current) => toggleSortConfig(current, field));
    };

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "payroll-periods", statusFilter, sortConfig],
        queryFn: async () => {
            const res = await hrApi.payrollPeriods.list({
                status: statusFilter,
                ordering: sortOrderingParam(sortConfig) || "-start_date",
            });
            return res.data;
        },
    });

    const processMutation = useMutation({
        mutationFn: (id: number) => hrApi.payrollPeriods.process(id),
        onSuccess: () => {
            toast.success("Payroll processing started");
            queryClient.invalidateQueries({ queryKey: ["hr", "payroll-periods"] });
        },
        onError: (error) => toast.error(getUserFacingError(error, "Failed to process payroll")),
    });

    const approveMutation = useMutation({
        mutationFn: (id: number) => hrApi.payrollPeriods.approve(id),
        onSuccess: () => {
            toast.success("Payroll approved");
            queryClient.invalidateQueries({ queryKey: ["hr", "payroll-periods"] });
        },
        onError: (error) => toast.error(getUserFacingError(error, "Failed to approve payroll")),
    });

    const markPaidMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: { payment_date?: string; payment_reference?: string; payment_batch_reference?: string } }) =>
            hrApi.payrollPeriods.markPaid(id, data),
        onSuccess: () => {
            toast.success("Payroll marked as paid");
            queryClient.invalidateQueries({ queryKey: ["hr", "payroll-periods"] });
            setPaymentPeriod(null);
        },
        onError: (error) => toast.error(getUserFacingError(error, "Failed to mark payroll as paid")),
    });

    const reverseMutation = useMutation({
        mutationFn: ({ id, reason }: { id: number; reason: string }) => hrApi.payrollPeriods.reverse(id, { reason }),
        onSuccess: () => {
            toast.success("Payroll reversed");
            queryClient.invalidateQueries({ queryKey: ["hr", "payroll-periods"] });
            setReversingPeriod(null);
        },
        onError: (error) => toast.error(getUserFacingError(error, "Failed to reverse payroll")),
    });

    const getStatusConfig = (status: string) => {
        switch (status) {
            case "draft": return { color: "bg-muted text-muted-foreground border-border dark:border-border", label: "Draft" };
            case "processing": return { color: "bg-info/15 text-info border-info/20 dark:border-primary/30", label: "Processing" };
            case "approved": return { color: "bg-warning/15 text-warning border-warning/20 dark:border-warning/30", label: "Approved" };
            case "paid": return { color: "bg-success/15 text-success border-success/20 dark:bg-success/20 dark:text-success dark:border-success/30", label: "Paid" };
            case "reversed": return { color: "bg-destructive/10 text-destructive border-destructive/20", label: "Reversed" };
            default: return { color: "", label: status };
        }
    };

    const periods = data?.results ?? [];
    const totalNetPay = periods.reduce((sum, p) => sum + parseFloat(p.total_net_pay || "0"), 0);
    const totalPayslips = periods.reduce((sum, p) => sum + (p.total_payslips || 0), 0);

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="Payroll"
                breadcrumbs={[
                    { label: "Dashboard", href: "/dashboard" },
                    { label: "HR", href: "/hr" },
                    { label: "Payroll" },
                ]}
                actions={
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowTaxRules(true)}>
                            <Calculator className="h-4 w-4 mr-2" />
                            Tax Rules
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/hr/payroll/components">
                                <CreditCard className="h-4 w-4 mr-2" />
                                Salary Components
                            </Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/hr/payroll/my-payslips">
                                <Banknote className="h-4 w-4 mr-2" />
                                My Payslips
                            </Link>
                        </Button>
                        <PermissionGuard permission="manage_payroll">
                            <CreatePeriodDialog
                                open={showCreate}
                                onOpenChange={setShowCreate}
                                onCreated={() => {
                                    queryClient.invalidateQueries({ queryKey: ["hr", "payroll-periods"] });
                                    setShowCreate(false);
                                }}
                            />
                        </PermissionGuard>
                    </div>
                }
            />

            {/* Stats */}
            {!isLoading && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Periods</span>
                            <span className="text-lg font-bold">{data?.count ?? 0}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Payslips</span>
                            <span className="text-lg font-bold text-primary">{totalPayslips}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Net Pay</span>
                            <span className="text-lg font-bold text-success">{totalNetPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pending</span>
                            <span className="text-lg font-bold text-warning">{periods.filter(p => p.status === "draft" || p.status === "processing").length}</span>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Filter */}
            <Card className="border-none shadow-sm bg-muted/50">
                <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8">
                                    <Filter className="h-4 w-4 mr-2" />
                                    {statusFilter ? getStatusConfig(statusFilter).label : "All Status"}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setStatusFilter(undefined)}>All Status</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("draft")}>Draft</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("processing")}>Processing</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("approved")}>Approved</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("paid")}>Paid</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("reversed")}>Reversed</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </CardContent>
            </Card>

            {/* Periods Table */}
            <Card className="border-t shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/30">
                    <CardTitle className="text-sm font-semibold">Payroll Periods ({data?.count ?? 0})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="space-y-2 p-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <SortableHeader
                                        field="name"
                                        sortConfig={sortConfig}
                                        onSort={handleSort}
                                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                                    >
                                        Period Name
                                    </SortableHeader>
                                    <SortableHeader
                                        field="start_date"
                                        sortConfig={sortConfig}
                                        onSort={handleSort}
                                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                                    >
                                        Dates
                                    </SortableHeader>
                                    <SortableHeader
                                        field="branch__name"
                                        sortConfig={sortConfig}
                                        onSort={handleSort}
                                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                                    >
                                        Branch
                                    </SortableHeader>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Payslips</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Net Pay</TableHead>
                                    <SortableHeader
                                        field="status"
                                        sortConfig={sortConfig}
                                        onSort={handleSort}
                                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                                    >
                                        Status
                                    </SortableHeader>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {periods.length > 0 ? periods.map((period) => {
                                    const cfg = getStatusConfig(period.status);
                                    return (
                                        <TableRow
                                            key={period.id}
                                            className="hover:bg-muted/50 transition-colors border-b cursor-pointer"
                                            onClick={() => router.push(`/hr/payroll/${period.id}`)}
                                        >
                                            <TableCell className="px-4 py-2">
                                                <div className="text-sm font-medium text-foreground">{period.name}</div>
                                                {period.created_by_name && (
                                                    <div className="text-xs text-muted-foreground">by {period.created_by_name}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <div className="text-sm">{period.start_date}</div>
                                                <div className="text-xs text-muted-foreground">to {period.end_date}</div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-sm">{period.branch_name}</TableCell>
                                            <TableCell className="px-4 py-2 text-sm font-medium">{period.total_payslips}</TableCell>
                                            <TableCell className="px-4 py-2 text-sm font-medium">{parseFloat(period.total_net_pay || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="px-4 py-2">
                                                <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 border shadow-none", cfg.color)}>
                                                    {cfg.label}
                                                </Badge>
                                                {period.payment_batch_reference && (
                                                    <div className="mt-1 text-[10px] text-muted-foreground">{period.payment_batch_reference}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                                <PermissionGuard permissions={["process_payroll", "manage_payroll"]}>
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => router.push(`/hr/payroll/${period.id}`)}>
                                                            <ArrowRight className="h-4 w-4" />
                                                        </Button>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreVertical className="h-4 w-4" /></Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                {period.status === "draft" && (
                                                                    <DropdownMenuItem disabled={processMutation.isPending} onClick={() => processMutation.mutate(period.id)}>
                                                                        <Play className="h-4 w-4 mr-2" />Process
                                                                    </DropdownMenuItem>
                                                                )}
                                                                {period.status === "processing" && (
                                                                    <DropdownMenuItem disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(period.id)}>
                                                                        <CheckCircle2 className="h-4 w-4 mr-2" />Approve
                                                                    </DropdownMenuItem>
                                                                )}
                                                                {period.status === "approved" && (
                                                                    <DropdownMenuItem onClick={() => setPaymentPeriod(period)}>
                                                                        <CreditCard className="h-4 w-4 mr-2" />Mark Paid
                                                                    </DropdownMenuItem>
                                                                )}
                                                                {period.status === "paid" && (
                                                                    <DropdownMenuItem className="text-destructive" onClick={() => setReversingPeriod(period)}>
                                                                        <RotateCcw className="h-4 w-4 mr-2" />Reverse
                                                                    </DropdownMenuItem>
                                                                )}
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem disabled={period.status !== "draft"} onClick={() => setEditingPeriod(period)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem disabled={period.status !== "draft"} className="text-destructive" onClick={() => setDeletingId(period.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </PermissionGuard>
                                            </TableCell>
                                        </TableRow>
                                    );
                                }) : (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center">
                                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                <Banknote className="h-8 w-8 mb-2 opacity-50" />
                                                <p className="text-sm">No payroll periods found</p>
                                                <p className="text-xs mt-1">Create a new payroll period to get started</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <EditPeriodDialog
                key={editingPeriod?.id ?? "none"}
                period={editingPeriod}
                open={!!editingPeriod}
                onOpenChange={(o) => !o && setEditingPeriod(null)}
                onUpdated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "payroll-periods"] }); setEditingPeriod(null); }}
            />

            <DeleteConfirmDialog
                open={!!deletingId}
                onOpenChange={(o) => !o && setDeletingId(null)}
                id={deletingId}
                onDeleted={() => { queryClient.invalidateQueries({ queryKey: ["hr", "payroll-periods"] }); setDeletingId(null); }}
            />

            <TaxRulesDialog open={showTaxRules} onOpenChange={setShowTaxRules} />
            <MarkPaidDialog
                key={paymentPeriod?.id ?? "payment-none"}
                period={paymentPeriod}
                open={!!paymentPeriod}
                onOpenChange={(open) => !open && setPaymentPeriod(null)}
                onSubmit={(data) => paymentPeriod && markPaidMutation.mutate({ id: paymentPeriod.id, data })}
                isPending={markPaidMutation.isPending}
            />
            <ReversePayrollDialog
                key={reversingPeriod?.id ?? "reverse-none"}
                period={reversingPeriod}
                open={!!reversingPeriod}
                onOpenChange={(open) => !open && setReversingPeriod(null)}
                onSubmit={(reason) => reversingPeriod && reverseMutation.mutate({ id: reversingPeriod.id, reason })}
                isPending={reverseMutation.isPending}
            />
        </div>
    );
}

function EditPeriodDialog({ period, open, onOpenChange, onUpdated }: { period: PayrollPeriod | null, open: boolean, onOpenChange: (o: boolean) => void, onUpdated: () => void }) {
    const [name, setName] = useState(period?.name || "");
    const [startDate, setStartDate] = useState(period?.start_date || "");
    const [endDate, setEndDate] = useState(period?.end_date || "");
    const [notes, setNotes] = useState(period?.notes || "");

    const mut = useMutation({
        mutationFn: (data: Partial<PayrollPeriod>) => hrApi.payrollPeriods.update(period!.id, data),
        onSuccess: () => { toast.success("Payroll period updated"); onUpdated(); },
        onError: () => toast.error("Failed to update payroll period"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Edit Payroll Period</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
                        <div className="space-y-2"><Label>End Date</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
                    </div>
                    <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} /></div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => mut.mutate({ name, start_date: startDate, end_date: endDate, notes })} disabled={!name || !startDate || !endDate || mut.isPending}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DeleteConfirmDialog({ open, onOpenChange, id, onDeleted }: { open: boolean, onOpenChange: (o: boolean) => void, id: number | null, onDeleted: () => void }) {
    const mut = useMutation({
        mutationFn: () => hrApi.payrollPeriods.delete(id!),
        onSuccess: () => { toast.success("Payroll period deleted"); onDeleted(); },
        onError: () => toast.error("Failed to delete payroll period"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Are you sure?</DialogTitle><DialogDescription>This will permanently delete this payroll period and all associated payslips.</DialogDescription></DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending}>Delete</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function MarkPaidDialog({
    period,
    open,
    onOpenChange,
    onSubmit,
    isPending,
}: {
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
                    <DialogDescription>
                        Record the payment batch for {period?.name}.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-xs">
                        <div>
                            <p className="text-muted-foreground">Payslips</p>
                            <p className="font-semibold">{period?.total_payslips ?? 0}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-muted-foreground">Net Pay</p>
                            <p className="font-semibold">{parseFloat(period?.total_net_pay || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="payment-date">Payment Date</Label>
                        <Input id="payment-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="payment-reference">Payment Reference</Label>
                        <Input id="payment-reference" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Bank transfer reference" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="batch-reference">Batch Reference</Label>
                        <Input id="batch-reference" value={batchReference} onChange={(e) => setBatchReference(e.target.value)} placeholder="Payroll batch/file reference" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        onClick={() => onSubmit({
                            payment_date: paymentDate,
                            payment_reference: paymentReference,
                            payment_batch_reference: batchReference || paymentReference,
                        })}
                        disabled={!paymentDate || isPending}
                    >
                        {isPending ? "Posting..." : "Mark Paid"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ReversePayrollDialog({
    period,
    open,
    onOpenChange,
    onSubmit,
    isPending,
}: {
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
                    <DialogDescription>
                        Reverse {period?.name} and create the accounting reversal entry.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-2">
                    <Label htmlFor="reversal-reason">Reason</Label>
                    <Textarea
                        id="reversal-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                        placeholder="Reason for reversal"
                    />
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

function CreatePeriodDialog({
    open,
    onOpenChange,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}) {
    const [name, setName] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [notes, setNotes] = useState("");

    const createMutation = useMutation({
        mutationFn: (data: Partial<PayrollPeriod>) => hrApi.payrollPeriods.create(data),
        onSuccess: () => {
            toast.success("Payroll period created");
            onCreated();
            setName("");
            setStartDate("");
            setEndDate("");
            setNotes("");
        },
        onError: () => toast.error("Failed to create payroll period"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Period
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create Payroll Period</DialogTitle>
                    <DialogDescription>
                        Create a new payroll period then process payslips for all staff.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="period-name">Period Name</Label>
                        <Input
                            id="period-name"
                            placeholder="e.g. February 2026"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="start-date">Start Date</Label>
                            <Input
                                id="start-date"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="end-date">End Date</Label>
                            <Input
                                id="end-date"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="notes">Notes (optional)</Label>
                        <Textarea
                            id="notes"
                            placeholder="Any notes for this payroll period..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        onClick={() => createMutation.mutate({ name, start_date: startDate, end_date: endDate, notes })}
                        disabled={!name || !startDate || !endDate || createMutation.isPending}
                    >
                        {createMutation.isPending ? "Creating..." : "Create Period"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
