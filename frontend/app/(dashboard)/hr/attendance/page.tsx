"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, AttendanceRecord } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Filter, LogIn, LogOut, Search } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { useEffect } from "react";

export default function AttendancePage() {
    return (
        <PermissionGuard permission="view_attendance">
            <DynamicPageTitle title="Attendance" />
            <AttendanceContent />
        </PermissionGuard>
    );
}

function AttendanceContent() {
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [showManual, setShowManual] = useState(false);
    const [editingRec, setEditingRec] = useState<AttendanceRecord | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const { data: summary, isLoading: loadingSummary } = useQuery({
        queryKey: ["hr", "attendance-today-summary"],
        queryFn: async () => {
            const res = await hrApi.attendance.todaySummary();
            return res.data;
        },
    });

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "attendance", searchQuery, statusFilter],
        queryFn: async () => {
            const res = await hrApi.attendance.list({
                search: searchQuery,
                status: statusFilter,
            });
            return res.data;
        },
    });

    const clockInMutation = useMutation({
        mutationFn: () => hrApi.attendance.clockIn(),
        onSuccess: () => {
            toast.success("Clocked in successfully");
            queryClient.invalidateQueries({ queryKey: ["hr", "attendance"] });
        },
        onError: () => toast.error("Failed to clock in"),
    });

    const clockOutMutation = useMutation({
        mutationFn: () => hrApi.attendance.clockOut(),
        onSuccess: () => {
            toast.success("Clocked out successfully");
            queryClient.invalidateQueries({ queryKey: ["hr", "attendance"] });
        },
        onError: () => toast.error("Failed to clock out"),
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case "present": return "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800";
            case "late": return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800";
            case "absent": return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800";
            case "half_day": return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800";
            case "on_leave": return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800";
            default: return "";
        }
    };

    const records = data?.results ?? [];

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="Attendance"
                breadcrumbs={[
                    { label: "Dashboard", href: "/dashboard" },
                    { label: "HR", href: "/hr" },
                    { label: "Attendance" },
                ]}
                actions={
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => clockInMutation.mutate()}
                            disabled={clockInMutation.isPending}
                            className="text-green-600 border-green-200 hover:bg-green-50"
                        >
                            <LogIn className="h-4 w-4 mr-2" />
                            Clock In
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => clockOutMutation.mutate()}
                            disabled={clockOutMutation.isPending}
                            className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                            <LogOut className="h-4 w-4 mr-2" />
                            Clock Out
                        </Button>
                        <PermissionGuard permission="manage_attendance">
                            <Button size="sm" onClick={() => setShowManual(true)}>
                                <Plus className="h-4 w-4 mr-2" />Manual Entry
                            </Button>
                        </PermissionGuard>
                    </div>
                }
            />

            {/* Today's Summary */}
            {!loadingSummary && summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
                            <span className="text-lg font-bold">{summary.total}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Present</span>
                            <span className="text-lg font-bold text-green-600">{summary.present}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Late</span>
                            <span className="text-lg font-bold text-amber-600">{summary.late}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Absent</span>
                            <span className="text-lg font-bold text-red-600">{summary.absent}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">On Leave</span>
                            <span className="text-lg font-bold text-blue-600">{summary.on_leave}</span>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Filters */}
            <Card className="border-none shadow-sm bg-muted/50">
                <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <Input
                                placeholder="Search staff..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-8 w-64 pl-9 text-sm bg-card transition-all focus:w-80"
                            />
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8">
                                    <Filter className="h-4 w-4 mr-2" />
                                    {statusFilter ? statusFilter.replace("_", " ").charAt(0).toUpperCase() + statusFilter.replace("_", " ").slice(1) : "All Status"}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setStatusFilter(undefined)}>All Status</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("present")}>Present</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("late")}>Late</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("absent")}>Absent</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("half_day")}>Half Day</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("on_leave")}>On Leave</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card className="border-t shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/30">
                    <CardTitle className="text-sm font-semibold">Attendance Records ({data?.count ?? 0})</CardTitle>
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
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Date</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Clock In</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Clock Out</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Hours</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Overtime</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {records.length > 0 ? records.map((rec) => (
                                    <TableRow key={rec.id} className="hover:bg-muted/50 transition-colors border-b">
                                        <TableCell className="px-4 py-2 text-sm font-medium">{rec.staff_name}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm">{rec.date}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm">{rec.clock_in ? new Date(rec.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm">{rec.clock_out ? new Date(rec.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm font-medium">{rec.total_hours != null ? `${Number(rec.total_hours).toFixed(1)}h` : "—"}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm">
                                            {Number(rec.overtime_hours) > 0 ? (
                                                <span className="text-amber-600 font-medium">{Number(rec.overtime_hours).toFixed(1)}h</span>
                                            ) : (
                                                "—"
                                            )}
                                        </TableCell>
                                        <TableCell className="px-4 py-2">
                                            <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 capitalize border shadow-none", getStatusColor(rec.status))}>
                                                {rec.status?.replace("_", " ")}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-right">
                                            <PermissionGuard permission="manage_attendance">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => setEditingRec(rec)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                                                        <DropdownMenuItem className="text-red-600" onClick={() => setDeletingId(rec.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </PermissionGuard>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center">
                                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                <Clock className="h-8 w-8 mb-2 opacity-50" />
                                                <p className="text-sm">No attendance records found</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <ManualAttendanceDialog
                open={showManual}
                onOpenChange={setShowManual}
                onCreated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "attendance"] }); setShowManual(false); }}
            />

            <EditAttendanceDialog
                record={editingRec}
                open={!!editingRec}
                onOpenChange={(o) => !o && setEditingRec(null)}
                onUpdated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "attendance"] }); setEditingRec(null); }}
            />

            <DeleteConfirmDialog
                open={!!deletingId}
                onOpenChange={(o) => !o && setDeletingId(null)}
                id={deletingId}
                onDeleted={() => { queryClient.invalidateQueries({ queryKey: ["hr", "attendance"] }); setDeletingId(null); }}
            />
        </div>
    );
}

function ManualAttendanceDialog({ open, onOpenChange, onCreated }: { open: boolean, onOpenChange: (o: boolean) => void, onCreated: () => void }) {
    const [staffId, setStaffId] = useState("");
    const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
    const [clockIn, setClockIn] = useState("09:00");
    const [clockOut, setClockOut] = useState("17:00");
    const [status, setStatus] = useState("present");

    const { data: staff } = useQuery({ queryKey: ["hr", "staff-list"], queryFn: async () => (await hrApi.staff.list()).data });

    const mut = useMutation({

        mutationFn: (data: any) => hrApi.attendance.create(data),
        onSuccess: () => { toast.success("Attendance record created"); onCreated(); },
        onError: () => toast.error("Failed to create record"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Manual Attendance Entry</DialogTitle></DialogHeader>
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
                    <div className="space-y-2"><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Clock In</Label><Input type="time" value={clockIn} onChange={e => setClockIn(e.target.value)} /></div>
                        <div className="space-y-2"><Label>Clock Out</Label><Input type="time" value={clockOut} onChange={e => setClockOut(e.target.value)} /></div>
                    </div>
                    <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="present">Present</SelectItem>
                                <SelectItem value="late">Late</SelectItem>
                                <SelectItem value="half_day">Half Day</SelectItem>
                                <SelectItem value="absent">Absent</SelectItem>
                                <SelectItem value="on_leave">On Leave</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => mut.mutate({ staff: Number(staffId), date, clock_in: `${date}T${clockIn}:00`, clock_out: `${date}T${clockOut}:00`, status })} disabled={!staffId || !date || mut.isPending}>Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EditAttendanceDialog({ record, open, onOpenChange, onUpdated }: { record: AttendanceRecord | null, open: boolean, onOpenChange: (o: boolean) => void, onUpdated: () => void }) {
    const [clockIn, setClockIn] = useState("");
    const [clockOut, setClockOut] = useState("");
    const [status, setStatus] = useState("");

    useEffect(() => {
        if (record) {
            setClockIn(record.clock_in ? new Date(record.clock_in).toTimeString().slice(0, 5) : "");
            setClockOut(record.clock_out ? new Date(record.clock_out).toTimeString().slice(0, 5) : "");
            setStatus(record.status);
        }
    }, [record]);

    const mut = useMutation({

        mutationFn: (data: any) => hrApi.attendance.update(record!.id, data),
        onSuccess: () => { toast.success("Attendance updated"); onUpdated(); },
        onError: () => toast.error("Failed to update record"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Edit Attendance</DialogTitle></DialogHeader>
                {record && (
                    <div className="space-y-4 py-4">
                        <div className="text-sm font-medium">{record.staff_name} - {record.date}</div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>Clock In</Label><Input type="time" value={clockIn} onChange={e => setClockIn(e.target.value)} /></div>
                            <div className="space-y-2"><Label>Clock Out</Label><Input type="time" value={clockOut} onChange={e => setClockOut(e.target.value)} /></div>
                        </div>
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="present">Present</SelectItem>
                                    <SelectItem value="late">Late</SelectItem>
                                    <SelectItem value="half_day">Half Day</SelectItem>
                                    <SelectItem value="absent">Absent</SelectItem>
                                    <SelectItem value="on_leave">On Leave</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => mut.mutate({
                        clock_in: clockIn ? `${record?.date}T${clockIn}:00` : null,
                        clock_out: clockOut ? `${record?.date}T${clockOut}:00` : null,
                        status
                    })} disabled={mut.isPending}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DeleteConfirmDialog({ open, onOpenChange, id, onDeleted }: { open: boolean, onOpenChange: (o: boolean) => void, id: number | null, onDeleted: () => void }) {
    const mut = useMutation({
        mutationFn: () => hrApi.attendance.delete(id!),
        onSuccess: () => { toast.success("Attendance record deleted"); onDeleted(); },
        onError: () => toast.error("Failed to delete record"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Are you sure?</DialogTitle><DialogDescription>This will permanently delete this attendance record.</DialogDescription></DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending}>Delete</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
