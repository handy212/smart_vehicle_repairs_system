"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hrApi, LeaveBalance } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, ArrowLeft, Loader2 } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import Link from "next/link";

export default function LeaveBalancesPage() {
    return (
        <PermissionPageGuard permission="view_leave">
            <DynamicPageTitle title="Leave Balances" />
            <LeaveBalancesContent />
        </PermissionPageGuard>
    );
}

function LeaveBalancesContent() {
    const queryClient = useQueryClient();
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(String(currentYear));
    const [staffFilter, setStaffFilter] = useState<string>("all");
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<LeaveBalance | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<LeaveBalance | null>(null);

    const { data: staffData } = useQuery({
        queryKey: ["hr", "staff-list-active"],
        queryFn: async () => (await hrApi.staff.list({ employment_status: "active" })).data,
    });

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "leave-balances", year, staffFilter],
        queryFn: async () => (await hrApi.leaveBalances.list({
            year: Number(year),
            ...(staffFilter !== "all" ? { staff: Number(staffFilter) } : {}),
        })).data,
    });

    const balances = data?.results ?? [];

    const deleteMutation = useMutation({
        mutationFn: (id: number) => hrApi.leaveBalances.delete(id),
        onSuccess: () => {
            toast.success("Leave balance deleted");
            queryClient.invalidateQueries({ queryKey: ["hr", "leave-balances"] });
            setDeleteTarget(null);
        },
        onError: () => toast.error("Failed to delete leave balance"),
    });

    const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="Leave Balances"
                breadcrumbs={[
                    { label: "Dashboard", href: "/dashboard" },
                    { label: "HR", href: "/hr" },
                    { label: "Leave", href: "/hr/leave" },
                    { label: "Balances" },
                ]}
                actions={
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href="/hr/leave"><ArrowLeft className="h-4 w-4 mr-2" />Back to Leave</Link>
                        </Button>
                        <PermissionGuard permission="manage_leave">
                            <Button onClick={() => { setEditing(null); setShowForm(true); }}>
                                <Plus className="h-4 w-4 mr-2" />Add Balance
                            </Button>
                        </PermissionGuard>
                    </div>
                }
            />

            <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                    <CardTitle>Staff Leave Balances</CardTitle>
                    <div className="flex flex-wrap gap-2">
                        <Select value={year} onValueChange={setYear}>
                            <SelectTrigger className="w-[120px]"><SelectValue placeholder="Year" /></SelectTrigger>
                            <SelectContent>
                                {yearOptions.map((y) => (
                                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={staffFilter} onValueChange={setStaffFilter}>
                            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Staff" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All staff</SelectItem>
                                {staffData?.results?.map((s) => (
                                    <SelectItem key={s.id} value={String(s.id)}>{s.full_name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Staff</TableHead>
                                <TableHead>Leave Type</TableHead>
                                <TableHead>Year</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Used</TableHead>
                                <TableHead className="text-right">Carried</TableHead>
                                <TableHead className="text-right">Remaining</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                [1, 2, 3].map((i) => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={8}>
                                            <div className="h-10 bg-muted animate-pulse rounded" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : balances.length > 0 ? (
                                balances.map((b) => (
                                    <TableRow key={b.id}>
                                        <TableCell className="font-medium">{b.staff_name}</TableCell>
                                        <TableCell>{b.leave_type_name}</TableCell>
                                        <TableCell>{b.year}</TableCell>
                                        <TableCell className="text-right font-mono">{b.total_days}</TableCell>
                                        <TableCell className="text-right font-mono">{b.used_days}</TableCell>
                                        <TableCell className="text-right font-mono">{b.carried_forward}</TableCell>
                                        <TableCell className="text-right font-mono font-semibold">{b.remaining_days}</TableCell>
                                        <TableCell className="text-right">
                                            <PermissionGuard permission="manage_leave">
                                                <div className="flex gap-1 justify-end">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0"
                                                        onClick={() => { setEditing(b); setShowForm(true); }}
                                                        aria-label={`Edit balance for ${b.staff_name}`}
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                                        onClick={() => setDeleteTarget(b)}
                                                        aria-label={`Delete balance for ${b.staff_name}`}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </PermissionGuard>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                        No leave balances for this filter. Add a balance or seed leave types for staff.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <LeaveBalanceFormDialog
                open={showForm}
                onOpenChange={() => { setShowForm(false); setEditing(null); }}
                editing={editing}
                defaultYear={Number(year)}
                staffOptions={staffData?.results ?? []}
                onSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ["hr", "leave-balances"] });
                    setShowForm(false);
                    setEditing(null);
                }}
            />

            <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete leave balance?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Remove {deleteTarget?.leave_type_name} balance for {deleteTarget?.staff_name} ({deleteTarget?.year}).
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                        >
                            {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function LeaveBalanceFormDialog({
    open,
    onOpenChange,
    editing,
    defaultYear,
    staffOptions,
    onSaved,
}: {
    open: boolean;
    onOpenChange: () => void;
    editing: LeaveBalance | null;
    defaultYear: number;
    staffOptions: { id: number; full_name: string }[];
    onSaved: () => void;
}) {
    const [staffId, setStaffId] = useState("");
    const [leaveTypeId, setLeaveTypeId] = useState("");
    const [year, setYear] = useState(String(defaultYear));
    const [totalDays, setTotalDays] = useState("0");
    const [usedDays, setUsedDays] = useState("0");
    const [carriedForward, setCarriedForward] = useState("0");

    const { data: leaveTypes } = useQuery({
        queryKey: ["hr", "leave-types"],
        queryFn: async () => (await hrApi.leaveTypes.list({ ordering: "name" })).data,
        enabled: open,
    });

    useEffect(() => {
        if (!open) return;
        if (editing) {
            setStaffId(String(editing.staff));
            setLeaveTypeId(String(editing.leave_type));
            setYear(String(editing.year));
            setTotalDays(String(editing.total_days));
            setUsedDays(String(editing.used_days));
            setCarriedForward(String(editing.carried_forward));
        } else {
            setStaffId("");
            setLeaveTypeId("");
            setYear(String(defaultYear));
            setTotalDays("0");
            setUsedDays("0");
            setCarriedForward("0");
        }
    }, [open, editing, defaultYear]);

    const mutation = useMutation({
        mutationFn: (data: Partial<LeaveBalance>) =>
            editing ? hrApi.leaveBalances.update(editing.id, data) : hrApi.leaveBalances.create(data),
        onSuccess: () => {
            toast.success(editing ? "Leave balance updated" : "Leave balance created");
            onSaved();
        },
        onError: () => toast.error(editing ? "Failed to update balance" : "Failed to create balance"),
    });

    const handleSubmit = () => {
        if (!staffId || !leaveTypeId) return;
        mutation.mutate({
            staff: Number(staffId),
            leave_type: Number(leaveTypeId),
            year: Number(year),
            total_days: Number(totalDays),
            used_days: Number(usedDays),
            carried_forward: Number(carriedForward),
        });
    };

    const handleClose = () => {
        setStaffId("");
        setLeaveTypeId("");
        setYear(String(defaultYear));
        setTotalDays("0");
        setUsedDays("0");
        setCarriedForward("0");
        onOpenChange();
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{editing ? "Adjust Leave Balance" : "Add Leave Balance"}</DialogTitle>
                    <DialogDescription>
                        Set entitlement, usage, and carry-forward for a staff member.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label>Staff *</Label>
                        <Select value={staffId} onValueChange={setStaffId} disabled={!!editing}>
                            <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                            <SelectContent>
                                {staffOptions.map((s) => (
                                    <SelectItem key={s.id} value={String(s.id)}>{s.full_name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Leave Type *</Label>
                        <Select value={leaveTypeId} onValueChange={setLeaveTypeId} disabled={!!editing}>
                            <SelectTrigger><SelectValue placeholder="Select leave type" /></SelectTrigger>
                            <SelectContent>
                                {leaveTypes?.results?.map((t) => (
                                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Year *</Label>
                        <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} disabled={!!editing} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                            <Label>Total days</Label>
                            <Input type="number" min={0} step="0.5" value={totalDays} onChange={(e) => setTotalDays(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Used days</Label>
                            <Input type="number" min={0} step="0.5" value={usedDays} onChange={(e) => setUsedDays(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Carried forward</Label>
                            <Input type="number" min={0} step="0.5" value={carriedForward} onChange={(e) => setCarriedForward(e.target.value)} />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={!staffId || !leaveTypeId || mutation.isPending}>
                        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {editing ? "Save Changes" : "Create"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
