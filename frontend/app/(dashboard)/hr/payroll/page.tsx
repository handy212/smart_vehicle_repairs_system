"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, PayrollPeriod } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Banknote, Plus, Filter, ArrowRight, CheckCircle2, Play, CreditCard,
    Pencil, Trash2, MoreHorizontal,
} from "lucide-react";
import { useEffect } from "react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
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
import { toast } from "sonner";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { TaxRulesDialog } from "./TaxRulesDialog";
import { Calculator } from "lucide-react";

export default function PayrollPage() {
    return (
        <PermissionGuard permission="view_payroll">
            <DynamicPageTitle title="Payroll" />
            <PayrollContent />
        </PermissionGuard>
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

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "payroll-periods", statusFilter],
        queryFn: async () => {
            const res = await hrApi.payrollPeriods.list({ status: statusFilter });
            return res.data;
        },
    });

    const processMutation = useMutation({
        mutationFn: (id: number) => hrApi.payrollPeriods.process(id),
        onSuccess: () => {
            toast.success("Payroll processing started");
            queryClient.invalidateQueries({ queryKey: ["hr", "payroll-periods"] });
        },
        onError: () => toast.error("Failed to process payroll"),
    });

    const approveMutation = useMutation({
        mutationFn: (id: number) => hrApi.payrollPeriods.approve(id),
        onSuccess: () => {
            toast.success("Payroll approved");
            queryClient.invalidateQueries({ queryKey: ["hr", "payroll-periods"] });
        },
        onError: () => toast.error("Failed to approve payroll"),
    });

    const markPaidMutation = useMutation({
        mutationFn: (id: number) => hrApi.payrollPeriods.markPaid(id),
        onSuccess: () => {
            toast.success("Payroll marked as paid");
            queryClient.invalidateQueries({ queryKey: ["hr", "payroll-periods"] });
        },
        onError: () => toast.error("Failed to mark payroll as paid"),
    });

    const getStatusConfig = (status: string) => {
        switch (status) {
            case "draft": return { color: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700", label: "Draft" };
            case "processing": return { color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800", label: "Processing" };
            case "approved": return { color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800", label: "Approved" };
            case "paid": return { color: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800", label: "Paid" };
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
                            <span className="text-lg font-bold text-blue-600">{totalPayslips}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Net Pay</span>
                            <span className="text-lg font-bold text-green-600">{totalNetPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pending</span>
                            <span className="text-lg font-bold text-amber-600">{periods.filter(p => p.status === "draft" || p.status === "processing").length}</span>
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
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Period Name</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Dates</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Branch</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Payslips</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Net Pay</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
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
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                                <PermissionGuard permission="process_payroll">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {period.status === "draft" && (
                                                            <Button
                                                                variant="ghost" size="sm"
                                                                className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                                onClick={() => processMutation.mutate(period.id)}
                                                                disabled={processMutation.isPending}
                                                            >
                                                                <Play className="h-3.5 w-3.5 mr-1" />
                                                                Process
                                                            </Button>
                                                        )}
                                                        {period.status === "processing" && (
                                                            <Button
                                                                variant="ghost" size="sm"
                                                                className="h-7 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                                                onClick={() => approveMutation.mutate(period.id)}
                                                                disabled={approveMutation.isPending}
                                                            >
                                                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                                                Approve
                                                            </Button>
                                                        )}
                                                        {period.status === "approved" && (
                                                            <Button
                                                                variant="ghost" size="sm"
                                                                className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                                                onClick={() => markPaidMutation.mutate(period.id)}
                                                                disabled={markPaidMutation.isPending}
                                                            >
                                                                <CreditCard className="h-3.5 w-3.5 mr-1" />
                                                                Mark Paid
                                                            </Button>
                                                        )}
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => router.push(`/hr/payroll/${period.id}`)}>
                                                            <ArrowRight className="h-4 w-4" />
                                                        </Button>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onClick={() => setEditingPeriod(period)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem className="text-red-600" onClick={() => setDeletingId(period.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
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
        </div>
    );
}

function EditPeriodDialog({ period, open, onOpenChange, onUpdated }: { period: PayrollPeriod | null, open: boolean, onOpenChange: (o: boolean) => void, onUpdated: () => void }) {
    const [name, setName] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [notes, setNotes] = useState("");

    useEffect(() => {
        if (period) {
            setName(period.name);
            setStartDate(period.start_date);
            setEndDate(period.end_date);
            setNotes(period.notes || "");
        }
    }, [period]);

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
