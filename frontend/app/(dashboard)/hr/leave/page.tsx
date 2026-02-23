"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, LeaveRequest } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Calendar, CheckCircle2, XCircle, Clock, Filter, Search, Settings } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { Input } from "@/components/ui/input";
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
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { useEffect } from "react";
import Link from "next/link";

export default function LeavePage() {
    return (
        <PermissionGuard permission="view_leave">
            <DynamicPageTitle title="Leave Management" />
            <LeaveContent />
        </PermissionGuard>
    );
}

function LeaveContent() {
    const queryClient = useQueryClient();
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [showApply, setShowApply] = useState(false);
    const [editingRequest, setEditingRequest] = useState<LeaveRequest | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "leave-requests", statusFilter],
        queryFn: async () => {
            const res = await hrApi.leaveRequests.list({ status: statusFilter });
            return res.data;
        },
    });

    const approveMutation = useMutation({
        mutationFn: (id: number) => hrApi.leaveRequests.approve(id),
        onSuccess: () => {
            toast.success("Leave request approved");
            queryClient.invalidateQueries({ queryKey: ["hr", "leave-requests"] });
        },
        onError: () => toast.error("Failed to approve leave request"),
    });

    const rejectMutation = useMutation({
        mutationFn: (id: number) => hrApi.leaveRequests.reject(id),
        onSuccess: () => {
            toast.success("Leave request rejected");
            queryClient.invalidateQueries({ queryKey: ["hr", "leave-requests"] });
        },
        onError: () => toast.error("Failed to reject leave request"),
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case "pending": return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800";
            case "approved": return "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800";
            case "rejected": return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800";
            case "cancelled": return "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700";
            default: return "";
        }
    };

    const requests = data?.results ?? [];
    const pendingCount = requests.filter(r => r.status === "pending").length;
    const approvedCount = requests.filter(r => r.status === "approved").length;
    const rejectedCount = requests.filter(r => r.status === "rejected").length;

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="Leave Management"
                breadcrumbs={[
                    { label: "Dashboard", href: "/dashboard" },
                    { label: "HR", href: "/hr" },
                    { label: "Leave Management" },
                ]}
                actions={
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/hr/leave/leave-types"><Settings className="h-4 w-4 mr-2" />Leave Types</Link>
                        </Button>
                        <PermissionGuard permission="manage_leave">
                            <Button size="sm" onClick={() => setShowApply(true)}>
                                <Plus className="h-4 w-4 mr-2" />Apply Leave
                            </Button>
                        </PermissionGuard>
                    </div>
                }
            />

            {/* Stats */}
            {!isLoading && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
                            <span className="text-lg font-bold">{data?.count ?? 0}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pending</span>
                            <span className="text-lg font-bold text-amber-600">{pendingCount}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Approved</span>
                            <span className="text-lg font-bold text-green-600">{approvedCount}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rejected</span>
                            <span className="text-lg font-bold text-red-600">{rejectedCount}</span>
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
                                    {statusFilter ? statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1) : "All Status"}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setStatusFilter(undefined)}>All Status</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("pending")}>Pending</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("approved")}>Approved</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("rejected")}>Rejected</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("cancelled")}>Cancelled</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card className="border-t shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/30">
                    <CardTitle className="text-sm font-semibold">Leave Requests ({data?.count ?? 0})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="space-y-2 p-4">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Staff</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Leave Type</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Dates</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Days</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.length > 0 ? requests.map((req) => (
                                    <TableRow key={req.id} className="hover:bg-muted/50 transition-colors border-b">
                                        <TableCell className="px-4 py-2 text-sm font-medium">{req.staff_name}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm">{req.leave_type_name}</TableCell>
                                        <TableCell className="px-4 py-2">
                                            <div className="text-sm">{req.start_date}</div>
                                            <div className="text-xs text-muted-foreground">to {req.end_date}</div>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-sm font-medium">{req.days_count}</TableCell>
                                        <TableCell className="px-4 py-2">
                                            <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 capitalize border shadow-none", getStatusColor(req.status))}>
                                                {req.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {req.status === "pending" && (
                                                    <PermissionGuard permission="approve_leave">
                                                        <div className="flex items-center gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                                                onClick={() => approveMutation.mutate(req.id)}
                                                                disabled={approveMutation.isPending}
                                                            >
                                                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                                                Approve
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                                onClick={() => rejectMutation.mutate(req.id)}
                                                                disabled={rejectMutation.isPending}
                                                            >
                                                                <XCircle className="h-4 w-4 mr-1" />
                                                                Reject
                                                            </Button>
                                                        </div>
                                                    </PermissionGuard>
                                                )}
                                                <PermissionGuard permission="manage_leave">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => setEditingRequest(req)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                                                            <DropdownMenuItem className="text-red-600" onClick={() => setDeletingId(req.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </PermissionGuard>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center">
                                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                <Calendar className="h-8 w-8 mb-2 opacity-50" />
                                                <p className="text-sm">No leave requests found</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <ApplyLeaveDialog
                open={showApply}
                onOpenChange={setShowApply}
                onCreated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "leave-requests"] }); setShowApply(false); }}
            />

            <EditLeaveDialog
                request={editingRequest}
                open={!!editingRequest}
                onOpenChange={(o) => !o && setEditingRequest(null)}
                onUpdated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "leave-requests"] }); setEditingRequest(null); }}
            />

            <DeleteConfirmDialog
                open={!!deletingId}
                onOpenChange={(o) => !o && setDeletingId(null)}
                id={deletingId}
                type="leave_request"
                onDeleted={() => { queryClient.invalidateQueries({ queryKey: ["hr", "leave-requests"] }); setDeletingId(null); }}
            />
        </div>
    );
}

function ApplyLeaveDialog({ open, onOpenChange, onCreated }: { open: boolean, onOpenChange: (o: boolean) => void, onCreated: () => void }) {
    const [staffId, setStaffId] = useState("");
    const [leaveTypeId, setLeaveTypeId] = useState("");
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [reason, setReason] = useState("");

    const { data: staff } = useQuery({ queryKey: ["hr", "staff-list"], queryFn: async () => (await hrApi.staff.list()).data });
    const { data: leaveTypes } = useQuery({ queryKey: ["hr", "leave-types"], queryFn: async () => (await hrApi.leaveTypes.list()).data });

    const mut = useMutation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutationFn: (data: any) => hrApi.leaveRequests.create(data),
        onSuccess: () => { toast.success("Leave applied successfully"); onCreated(); },
        onError: () => toast.error("Failed to apply leave"),
    });

return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
            <DialogHeader><DialogTitle>Apply for Leave</DialogTitle><DialogDescription>Submit a leave request on behalf of a staff member.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label>Staff</Label>
                    <Select value={staffId} onValueChange={setStaffId}>
                        <SelectTrigger><SelectValue placeholder="Select Staff" /></SelectTrigger>
                        <SelectContent>
                            {staff?.results?.map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.full_name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>Leave Type</Label>
                    <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
                        <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                        <SelectContent>
                            {leaveTypes?.results?.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
                    <div className="space-y-2"><Label>End Date</Label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>Reason</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} /></div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={() => mut.mutate({ staff: Number(staffId), leave_type: Number(leaveTypeId), start_date: start, end_date: end, reason, status: "pending" })} disabled={!staffId || !leaveTypeId || !start || !end || mut.isPending}>Apply</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
);
}

function EditLeaveDialog({ request, open, onOpenChange, onUpdated }: { request: LeaveRequest | null, open: boolean, onOpenChange: (o: boolean) => void, onUpdated: () => void }) {
    const [leaveTypeId, setLeaveTypeId] = useState("");
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [reason, setReason] = useState("");
    const [status, setStatus] = useState("");

    const { data: leaveTypes } = useQuery({ queryKey: ["hr", "leave-types"], queryFn: async () => (await hrApi.leaveTypes.list()).data });

    useEffect(() => {
        if (request) {
            setLeaveTypeId(request.leave_type.toString());
            setStart(request.start_date);
            setEnd(request.end_date);
            setReason(request.reason || "");
            setStatus(request.status);
        }
    }, [request]);

    const mut = useMutation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutationFn: (data: any) => hrApi.leaveRequests.update(request!.id, data),
        onSuccess: () => { toast.success("Leave request updated"); onUpdated(); },
        onError: () => toast.error("Failed to update leave request"),
    });

return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
            <DialogHeader><DialogTitle>Edit Leave Request</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label>Leave Type</Label>
                    <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {leaveTypes?.results?.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
                    <div className="space-y-2"><Label>End Date</Label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2"><Label>Reason</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} /></div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={() => mut.mutate({ leave_type: Number(leaveTypeId), start_date: start, end_date: end, reason, status })} disabled={!leaveTypeId || !start || !end || mut.isPending}>Save Changes</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DeleteConfirmDialog({ open, onOpenChange, type, id, onDeleted }: { open: boolean, onOpenChange: (o: boolean) => void, type: string, id: number | null, onDeleted: () => void }) {
    const mut = useMutation({
        mutationFn: () => hrApi.leaveRequests.delete(id!),
        onSuccess: () => { toast.success("Leave request deleted"); onDeleted(); },
        onError: () => toast.error("Failed to delete leave request"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Are you sure?</DialogTitle><DialogDescription>This will permanently delete this leave request record.</DialogDescription></DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending}>Delete</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
