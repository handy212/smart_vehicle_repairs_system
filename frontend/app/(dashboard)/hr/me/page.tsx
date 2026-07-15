"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import {
    Banknote, Calendar, Clock, Download, LogIn, LogOut, User,
} from "lucide-react";
import { hrApi, LeaveBalance, LeaveRequest } from "@/lib/api/hr";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";

export default function EmployeeSelfServicePage() {
    return (
        <>
            <DynamicPageTitle title="My HR" />
            <SelfServiceContent />
        </>
    );
}

function SelfServiceContent() {
    const queryClient = useQueryClient();
    const [showLeaveDialog, setShowLeaveDialog] = useState(false);
    const currentYear = new Date().getFullYear();

    const { data: profile, isLoading: loadingProfile } = useQuery({
        queryKey: ["hr", "my-profile"],
        queryFn: async () => (await hrApi.staff.myProfile()).data,
        retry: false,
    });

    const { data: balances = [] } = useQuery({
        queryKey: ["hr", "my-balances", currentYear],
        queryFn: async () => (await hrApi.leaveBalances.myBalances(currentYear)).data,
        enabled: !!profile,
    });

    const { data: leaveRequests = [] } = useQuery({
        queryKey: ["hr", "my-leave-requests"],
        queryFn: async () => (await hrApi.leaveRequests.myRequests()).data,
        enabled: !!profile,
    });

    const { data: attendanceData } = useQuery({
        queryKey: ["hr", "my-attendance"],
        queryFn: async () => (await hrApi.attendance.myAttendance({ ordering: "-date" })).data,
        enabled: !!profile,
    });

    const { data: payslips = [] } = useQuery({
        queryKey: ["hr", "my-payslips"],
        queryFn: async () => (await hrApi.payslips.myPayslips()).data,
        enabled: !!profile,
    });

    const { data: leaveTypesData } = useQuery({
        queryKey: ["hr", "leave-types-active"],
        queryFn: async () => (await hrApi.leaveTypes.list({ ordering: "name" })).data,
        enabled: showLeaveDialog,
    });

    const clockInMutation = useMutation({
        mutationFn: () => hrApi.attendance.clockIn(),
        onSuccess: () => {
            toast.success("Clocked in");
            queryClient.invalidateQueries({ queryKey: ["hr", "my-attendance"] });
        },
        onError: () => toast.error("Failed to clock in"),
    });

    const clockOutMutation = useMutation({
        mutationFn: () => hrApi.attendance.clockOut(),
        onSuccess: () => {
            toast.success("Clocked out");
            queryClient.invalidateQueries({ queryKey: ["hr", "my-attendance"] });
        },
        onError: () => toast.error("Failed to clock out"),
    });

    const cancelLeaveMutation = useMutation({
        mutationFn: (id: number) => hrApi.leaveRequests.cancel(id),
        onSuccess: () => {
            toast.success("Leave request cancelled");
            queryClient.invalidateQueries({ queryKey: ["hr", "my-leave-requests"] });
            queryClient.invalidateQueries({ queryKey: ["hr", "my-balances"] });
        },
        onError: () => toast.error("Failed to cancel leave request"),
    });

    const handleDownloadPayslip = async (id: number, periodName: string) => {
        try {
            const response = await hrApi.payslips.downloadPdf(id);
            const blob = new Blob([response.data], { type: "application/pdf" });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `payslip-${periodName.replace(/\s+/g, "-").toLowerCase()}.pdf`;
            link.click();
            window.URL.revokeObjectURL(url);
        } catch {
            toast.error("Failed to download payslip");
        }
    };

    if (loadingProfile) {
        return <div className="h-64 rounded-lg bg-muted animate-pulse" />;
    }

    if (!profile) {
        return (
            <div className="space-y-4">
                <StaffPageHeader
                    title="My HR"
                    breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "My HR" }]}
                />
                <Card>
                    <CardContent className="p-12 text-center">
                        <User className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">
                            No employee profile is linked to your account. Contact HR if you need self-service access.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const attendanceRecords = attendanceData?.results ?? [];
    const todayRecord = attendanceRecords.find((r) => r.date === new Date().toISOString().slice(0, 10));
    const leaveTypes = leaveTypesData?.results?.filter((lt) => lt.is_active) ?? [];

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="My HR"
                breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "My HR" }]}
                actions={
                    <Button variant="outline" asChild>
                        <Link href="/hr/payroll/my-payslips">All Payslips</Link>
                    </Button>
                }
            />

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-base">My Profile</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <p className="font-semibold text-lg">{profile.full_name}</p>
                        <p className="text-muted-foreground">{profile.user_details?.email}</p>
                        <p>{profile.department_name ?? "No department"} · {profile.position_title ?? "No position"}</p>
                        <Badge variant="outline" className="capitalize">{profile.employment_status}</Badge>
                    </CardContent>
                </Card>

                <Card className="md:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base">Today&apos;s Attendance</CardTitle>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => clockInMutation.mutate()} disabled={clockInMutation.isPending || !!todayRecord?.clock_in}>
                                <LogIn className="h-4 w-4 mr-1" />Clock In
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => clockOutMutation.mutate()} disabled={clockOutMutation.isPending || !todayRecord?.clock_in || !!todayRecord?.clock_out}>
                                <LogOut className="h-4 w-4 mr-1" />Clock Out
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {todayRecord ? (
                            <div className="flex gap-6 text-sm">
                                <span>In: {todayRecord.clock_in ? new Date(todayRecord.clock_in).toLocaleTimeString() : "—"}</span>
                                <span>Out: {todayRecord.clock_out ? new Date(todayRecord.clock_out).toLocaleTimeString() : "—"}</span>
                                <Badge variant="outline" className="capitalize">{todayRecord.status_display}</Badge>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">No attendance record for today yet.</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" />Leave Balances ({currentYear})</CardTitle>
                        <Button size="sm" onClick={() => setShowLeaveDialog(true)}>Request Leave</Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Remaining</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {balances.length > 0 ? balances.map((b: LeaveBalance) => (
                                    <TableRow key={b.id}>
                                        <TableCell>{b.leave_type_name}</TableCell>
                                        <TableCell className="text-right font-mono">{b.remaining_days}</TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground h-16">No leave balances</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" />My Leave Requests</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {leaveRequests.length > 0 ? leaveRequests.slice(0, 5).map((req: LeaveRequest) => (
                            <div key={req.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                                <div>
                                    <p className="font-medium">{req.leave_type_name}</p>
                                    <p className="text-xs text-muted-foreground">{req.start_date} – {req.end_date}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="capitalize">{req.status}</Badge>
                                    {req.status === "pending" && (
                                        <Button size="sm" variant="ghost" onClick={() => cancelLeaveMutation.mutate(req.id)}>Cancel</Button>
                                    )}
                                </div>
                            </div>
                        )) : (
                            <p className="text-sm text-muted-foreground text-center py-6">No leave requests yet</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><Banknote className="h-4 w-4" />Recent Payslips</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {payslips.length > 0 ? payslips.slice(0, 3).map((slip) => (
                        <div key={slip.id} className="flex items-center justify-between border rounded-lg p-3">
                            <div>
                                <p className="text-sm font-medium">{slip.period_name}</p>
                                <p className="text-xs text-muted-foreground capitalize">{slip.status}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-success">{parseFloat(slip.net_pay || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                <Button size="sm" variant="outline" onClick={() => handleDownloadPayslip(slip.id, slip.period_name)}>
                                    <Download className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )) : (
                        <p className="text-sm text-muted-foreground text-center py-6">No payslips available</p>
                    )}
                </CardContent>
            </Card>

            <LeaveRequestDialog
                open={showLeaveDialog}
                onOpenChange={setShowLeaveDialog}
                leaveTypes={leaveTypes}
                onSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ["hr", "my-leave-requests"] });
                    queryClient.invalidateQueries({ queryKey: ["hr", "my-balances"] });
                    setShowLeaveDialog(false);
                }}
            />
        </div>
    );
}

function LeaveRequestDialog({
    open,
    onOpenChange,
    leaveTypes,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    leaveTypes: { id: number; name: string }[];
    onSaved: () => void;
}) {
    const [leaveTypeId, setLeaveTypeId] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [reason, setReason] = useState("");

    const mutation = useMutation({
        mutationFn: () => hrApi.leaveRequests.create({
            leave_type: Number(leaveTypeId),
            start_date: startDate,
            end_date: endDate,
            reason,
        }),
        onSuccess: () => {
            toast.success("Leave request submitted");
            onSaved();
            setLeaveTypeId("");
            setStartDate("");
            setEndDate("");
            setReason("");
        },
        onError: () => toast.error("Failed to submit leave request"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Request Leave</DialogTitle>
                    <DialogDescription>Submit a leave request for manager approval.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <div className="space-y-2">
                        <Label>Leave Type</Label>
                        <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                            <SelectContent>
                                {leaveTypes.map((lt) => (
                                    <SelectItem key={lt.id} value={String(lt.id)}>{lt.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
                        <div className="space-y-2"><Label>End Date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
                    </div>
                    <div className="space-y-2"><Label>Reason</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} /></div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => mutation.mutate()} disabled={!leaveTypeId || !startDate || !endDate || !reason.trim() || mutation.isPending}>
                        Submit Request
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
