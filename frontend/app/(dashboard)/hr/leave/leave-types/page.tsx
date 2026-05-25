"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, LeaveType } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";

export default function LeaveTypesPage() {
    return (
        <PermissionPageGuard permission="view_hr">
            <DynamicPageTitle title="Leave Types" />
            <LeaveTypesContent />
        </PermissionPageGuard>
    );
}

function LeaveTypesContent() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<LeaveType | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<LeaveType | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "leave-types"],
        queryFn: async () => (await hrApi.leaveTypes.list()).data,
    });

    const leaveTypes = data?.results ?? [];

    const deleteMutation = useMutation({
        mutationFn: (id: number) => hrApi.leaveTypes.delete(id),
        onSuccess: () => {
            toast.success("Leave type deleted");
            queryClient.invalidateQueries({ queryKey: ["hr", "leave-types"] });
            setDeleteTarget(null);
        },
        onError: () => toast.error("Failed to delete leave type"),
    });

    const handleEdit = (lt: LeaveType) => {
        setEditing(lt);
        setShowForm(true);
    };

    const handleFormClose = () => {
        setShowForm(false);
        setEditing(null);
    };

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="Leave Types"
                breadcrumbs={[
                    { label: "Dashboard", href: "/dashboard" },
                    { label: "HR", href: "/hr" },
                    { label: "Leave", href: "/hr/leave" },
                    { label: "Leave Types" },
                ]}
                actions={
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href="/hr/leave"><ArrowLeft className="h-4 w-4 mr-2" />Back to Leave</Link>
                        </Button>
                        <Button onClick={() => { setEditing(null); setShowForm(true); }}>
                            <Plus className="h-4 w-4 mr-2" />Add Leave Type
                        </Button>
                    </div>
                }
            />

            <Card>
                <CardHeader>
                    <CardTitle>All Leave Types</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Days Allowed</TableHead>
                                <TableHead>Paid</TableHead>
                                <TableHead>Carry Forward</TableHead>
                                <TableHead>Max Carry</TableHead>
                                <TableHead>Requires Doc</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                [1, 2, 3].map(i => (
                                    <TableRow key={i}><TableCell colSpan={8}><div className="h-10 bg-muted animate-pulse rounded" /></TableCell></TableRow>
                                ))
                            ) : leaveTypes.length > 0 ? (
                                leaveTypes.map(lt => (
                                    <TableRow key={lt.id}>
                                        <TableCell>
                                            <div>
                                                <span className="font-medium">{lt.name}</span>
                                                {lt.description && <p className="text-xs text-muted-foreground mt-0.5">{lt.description}</p>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono">{lt.days_allowed}</TableCell>
                                        <TableCell>
                                            <Badge variant={lt.is_paid ? "success" : "secondary"} className="text-[10px]">
                                                {lt.is_paid ? "Yes" : "No"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={lt.carry_forward ? "info" : "secondary"} className="text-[10px]">
                                                {lt.carry_forward ? "Yes" : "No"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-mono">{lt.max_carry_forward}</TableCell>
                                        <TableCell>{lt.requires_document ? "Yes" : "No"}</TableCell>
                                        <TableCell>
                                            <Badge variant={lt.is_active ? "success" : "secondary"} className="text-[10px]">
                                                {lt.is_active ? "Active" : "Inactive"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex gap-1 justify-end">
                                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(lt)} aria-label={`Edit leave type ${lt.name}`}>
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(lt)} aria-label={`Delete leave type ${lt.name}`}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                        No leave types configured yet. Click "Add Leave Type" to get started.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <LeaveTypeFormDialog
                open={showForm}
                onOpenChange={handleFormClose}
                editing={editing}
                onSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ["hr", "leave-types"] });
                    handleFormClose();
                }}
            />

            <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove this leave type. Existing leave requests of this type will not be affected.
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

function LeaveTypeFormDialog({
    open,
    onOpenChange,
    editing,
    onSaved,
}: {
    open: boolean;
    onOpenChange: () => void;
    editing: LeaveType | null;
    onSaved: () => void;
}) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [daysAllowed, setDaysAllowed] = useState(21);
    const [isPaid, setIsPaid] = useState(true);
    const [carryForward, setCarryForward] = useState(false);
    const [maxCarryForward, setMaxCarryForward] = useState(0);
    const [requiresDocument, setRequiresDocument] = useState(false);
    const [isActive, setIsActive] = useState(true);

    // Reset form when dialog opens
    const handleOpen = (isOpen: boolean) => {
        if (!isOpen) {
            onOpenChange();
            return;
        }
        if (editing) {
            setName(editing.name);
            setDescription(editing.description || "");
            setDaysAllowed(editing.days_allowed);
            setIsPaid(editing.is_paid);
            setCarryForward(editing.carry_forward);
            setMaxCarryForward(editing.max_carry_forward);
            setRequiresDocument(editing.requires_document);
            setIsActive(editing.is_active);
        } else {
            setName("");
            setDescription("");
            setDaysAllowed(21);
            setIsPaid(true);
            setCarryForward(false);
            setMaxCarryForward(0);
            setRequiresDocument(false);
            setIsActive(true);
        }
    };

    // Initialize on open
    if (open && name === "" && editing) {
        handleOpen(true);
    }

    const mutation = useMutation({
        mutationFn: (data: Partial<LeaveType>) =>
            editing ? hrApi.leaveTypes.update(editing.id, data) : hrApi.leaveTypes.create(data),
        onSuccess: () => {
            toast.success(editing ? "Leave type updated" : "Leave type created");
            onSaved();
        },
        onError: () => toast.error(editing ? "Failed to update" : "Failed to create"),
    });

    const handleSubmit = () => {
        if (!name.trim()) return;
        mutation.mutate({
            name,
            description,
            days_allowed: daysAllowed,
            is_paid: isPaid,
            carry_forward: carryForward,
            max_carry_forward: maxCarryForward,
            requires_document: requiresDocument,
            is_active: isActive,
        });
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(); }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{editing ? "Edit Leave Type" : "New Leave Type"}</DialogTitle>
                    <DialogDescription>
                        {editing ? "Update the leave type settings." : "Create a new leave type for your organization."}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label>Name *</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Annual Leave" />
                    </div>
                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" rows={2} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Days Allowed *</Label>
                            <Input type="number" min={0} value={daysAllowed} onChange={e => setDaysAllowed(Number(e.target.value))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Max Carry Forward</Label>
                            <Input type="number" min={0} value={maxCarryForward} onChange={e => setMaxCarryForward(Number(e.target.value))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-3 rounded-lg border">
                            <Label className="cursor-pointer">Paid Leave</Label>
                            <Switch checked={isPaid} onCheckedChange={setIsPaid} />
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg border">
                            <Label className="cursor-pointer">Carry Forward</Label>
                            <Switch checked={carryForward} onCheckedChange={setCarryForward} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-3 rounded-lg border">
                            <Label className="cursor-pointer">Requires Document</Label>
                            <Switch checked={requiresDocument} onCheckedChange={setRequiresDocument} />
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg border">
                            <Label className="cursor-pointer">Active</Label>
                            <Switch checked={isActive} onCheckedChange={setIsActive} />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onOpenChange}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={!name.trim() || mutation.isPending}>
                        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {editing ? "Save Changes" : "Create"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
