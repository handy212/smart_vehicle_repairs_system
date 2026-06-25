"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { hrApi, AttendancePolicy } from "@/lib/api/hr";
import { branchesApi } from "@/lib/api/branches";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export default function AttendancePoliciesPage() {
    return (
        <PermissionPageGuard permission="view_attendance">
            <DynamicPageTitle title="Attendance Policies" />
            <AttendancePoliciesContent />
        </PermissionPageGuard>
    );
}

function AttendancePoliciesContent() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<AttendancePolicy | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AttendancePolicy | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "attendance-policies"],
        queryFn: async () => (await hrApi.attendancePolicies.list()).data,
    });

    const policies = data?.results ?? [];

    const deleteMutation = useMutation({
        mutationFn: (id: number) => hrApi.attendancePolicies.delete(id),
        onSuccess: () => {
            toast.success("Policy deleted");
            queryClient.invalidateQueries({ queryKey: ["hr", "attendance-policies"] });
            setDeleteTarget(null);
        },
        onError: () => toast.error("Failed to delete policy"),
    });

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="Attendance Policies"
                breadcrumbs={[
                    { label: "HR", href: "/hr" },
                    { label: "Attendance", href: "/hr/attendance" },
                    { label: "Policies" },
                ]}
                actions={
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href="/hr/attendance"><ArrowLeft className="h-4 w-4 mr-2" />Back</Link>
                        </Button>
                        <PermissionGuard permission="manage_attendance">
                            <Button onClick={() => { setEditing(null); setShowForm(true); }}>
                                <Plus className="h-4 w-4 mr-2" />Add Policy
                            </Button>
                        </PermissionGuard>
                    </div>
                }
            />

            <Card>
                <CardHeader><CardTitle>Branch Policies</CardTitle></CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Branch</TableHead>
                                <TableHead>Hours</TableHead>
                                <TableHead>Late Threshold</TableHead>
                                <TableHead>Default</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                [1, 2].map((i) => <TableRow key={i}><TableCell colSpan={7}><div className="h-10 bg-muted animate-pulse rounded" /></TableCell></TableRow>)
                            ) : policies.length > 0 ? policies.map((policy) => (
                                <TableRow key={policy.id}>
                                    <TableCell className="font-medium">{policy.name}</TableCell>
                                    <TableCell>{policy.branch_name}</TableCell>
                                    <TableCell className="text-sm">{policy.work_start_time} – {policy.work_end_time}</TableCell>
                                    <TableCell>{policy.late_threshold_minutes} min</TableCell>
                                    <TableCell>{policy.is_default ? "Yes" : "No"}</TableCell>
                                    <TableCell>
                                        <Badge variant={policy.is_active ? "success" : "secondary"} className="text-[10px]">
                                            {policy.is_active ? "Active" : "Inactive"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <PermissionGuard permission="manage_attendance">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditing(policy); setShowForm(true); }}>
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteTarget(policy)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </PermissionGuard>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                        No attendance policies configured.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <PolicyFormDialog
                open={showForm}
                onOpenChange={(open) => { if (!open) { setShowForm(false); setEditing(null); } }}
                editing={editing}
                onSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ["hr", "attendance-policies"] });
                    setShowForm(false);
                    setEditing(null);
                }}
            />

            <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete policy?</DialogTitle>
                        <DialogDescription>This will permanently remove &ldquo;{deleteTarget?.name}&rdquo;.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}>
                            {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function PolicyFormDialog({
    open,
    onOpenChange,
    editing,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editing: AttendancePolicy | null;
    onSaved: () => void;
}) {
    const [name, setName] = useState("");
    const [branchId, setBranchId] = useState("");
    const [workStart, setWorkStart] = useState("08:00");
    const [workEnd, setWorkEnd] = useState("17:00");
    const [lateThreshold, setLateThreshold] = useState(15);
    const [halfDayHours, setHalfDayHours] = useState(4);
    const [overtimeMultiplier, setOvertimeMultiplier] = useState("1.5");
    const [isDefault, setIsDefault] = useState(false);
    const [isActive, setIsActive] = useState(true);

    const { data: branchesData } = useQuery({
        queryKey: ["branches"],
        queryFn: async () => {
            const res = await branchesApi.list({ is_active: true });
            const data = res as { results?: { id: number; name: string }[] } | { id: number; name: string }[];
            return Array.isArray(data) ? data : data.results ?? [];
        },
        enabled: open,
    });

    const mutation = useMutation({
        mutationFn: (payload: Partial<AttendancePolicy>) =>
            editing ? hrApi.attendancePolicies.update(editing.id, payload) : hrApi.attendancePolicies.create(payload),
        onSuccess: () => {
            toast.success(editing ? "Policy updated" : "Policy created");
            onSaved();
        },
        onError: () => toast.error(editing ? "Failed to update" : "Failed to create"),
    });

    const handleOpen = (isOpen: boolean) => {
        if (!isOpen) {
            onOpenChange(false);
            return;
        }
        if (editing) {
            setName(editing.name);
            setBranchId(String(editing.branch));
            setWorkStart(editing.work_start_time.slice(0, 5));
            setWorkEnd(editing.work_end_time.slice(0, 5));
            setLateThreshold(editing.late_threshold_minutes);
            setHalfDayHours(editing.half_day_hours);
            setOvertimeMultiplier(String(editing.overtime_multiplier));
            setIsDefault(editing.is_default);
            setIsActive(editing.is_active);
        } else {
            setName("");
            setBranchId("");
            setWorkStart("08:00");
            setWorkEnd("17:00");
            setLateThreshold(15);
            setHalfDayHours(4);
            setOvertimeMultiplier("1.5");
            setIsDefault(false);
            setIsActive(true);
        }
    };

    if (open && editing && name === "" && editing.name) {
        handleOpen(true);
    }

    return (
        <Dialog open={open} onOpenChange={handleOpen}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{editing ? "Edit Policy" : "New Attendance Policy"}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                    <div className="space-y-2">
                        <Label>Branch</Label>
                        <Select value={branchId} onValueChange={setBranchId}>
                            <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                            <SelectContent>
                                {(branchesData ?? []).map((b: { id: number; name: string }) => (
                                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Work Start</Label><Input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} /></div>
                        <div className="space-y-2"><Label>Work End</Label><Input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Late Threshold (min)</Label><Input type="number" value={lateThreshold} onChange={(e) => setLateThreshold(Number(e.target.value))} /></div>
                        <div className="space-y-2"><Label>Half Day Hours</Label><Input type="number" value={halfDayHours} onChange={(e) => setHalfDayHours(Number(e.target.value))} /></div>
                    </div>
                    <div className="space-y-2"><Label>Overtime Multiplier</Label><Input value={overtimeMultiplier} onChange={(e) => setOvertimeMultiplier(e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-3 rounded-lg border"><Label>Default</Label><Switch checked={isDefault} onCheckedChange={setIsDefault} /></div>
                        <div className="flex items-center justify-between p-3 rounded-lg border"><Label>Active</Label><Switch checked={isActive} onCheckedChange={setIsActive} /></div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        onClick={() => mutation.mutate({
                            name,
                            branch: Number(branchId),
                            work_start_time: workStart,
                            work_end_time: workEnd,
                            late_threshold_minutes: lateThreshold,
                            half_day_hours: halfDayHours,
                            overtime_multiplier: Number(overtimeMultiplier),
                            is_default: isDefault,
                            is_active: isActive,
                        })}
                        disabled={!name.trim() || !branchId || mutation.isPending}
                    >
                        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {editing ? "Save" : "Create"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
