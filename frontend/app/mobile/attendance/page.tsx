"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, LogIn, LogOut, RefreshCw } from "lucide-react";
import { hrApi } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { toast } from "@/lib/toast";
import { getUserFacingError } from "@/lib/api/apiErrors";

function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}

function formatTime(value?: string | null) {
    if (!value) return "—";
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MobileAttendancePage() {
    const queryClient = useQueryClient();
    const today = todayIsoDate();

    const { data: profile, isLoading: loadingProfile, isError: profileError } = useQuery({
        queryKey: ["hr", "my-profile"],
        queryFn: async () => (await hrApi.staff.myProfile()).data,
        retry: false,
    });

    const { data: attendanceData, isLoading: loadingAttendance, refetch } = useQuery({
        queryKey: ["hr", "my-attendance"],
        queryFn: async () => (await hrApi.attendance.myAttendance({ ordering: "-date" })).data,
        enabled: !!profile,
    });

    const records = attendanceData?.results ?? [];
    const todayRecord = records.find((r) => r.date === today);
    const recent = records.slice(0, 10);

    const clockInMutation = useMutation({
        mutationFn: () => hrApi.attendance.clockIn(),
        onSuccess: () => {
            toast.success("Clocked in for the day");
            queryClient.invalidateQueries({ queryKey: ["hr", "my-attendance"] });
        },
        onError: (error) => toast.error(getUserFacingError(error, "Failed to clock in")),
    });

    const clockOutMutation = useMutation({
        mutationFn: () => hrApi.attendance.clockOut(),
        onSuccess: () => {
            toast.success("Clocked out for the day");
            queryClient.invalidateQueries({ queryKey: ["hr", "my-attendance"] });
        },
        onError: (error) => toast.error(getUserFacingError(error, "Failed to clock out")),
    });

    const busy = clockInMutation.isPending || clockOutMutation.isPending;

    return (
        <MobilePageShell title="Attendance" className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-foreground">HR Attendance</h2>
                    <p className="text-sm text-muted-foreground">
                        Day clock for payroll/leave when HR enables it on your staff profile.
                        Work-order labor time is separate (More → Labor Time).
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => refetch()}
                    disabled={loadingAttendance}
                    aria-label="Refresh attendance"
                >
                    <RefreshCw className={`h-4 w-4 ${loadingAttendance ? "animate-spin" : ""}`} />
                </Button>
            </div>

            {loadingProfile ? (
                <div className="h-32 animate-pulse rounded-lg bg-muted" />
            ) : profileError || !profile ? (
                <Card>
                    <CardContent className="py-8 text-center text-sm text-muted-foreground">
                        No employee profile found. Ask HR to set up your staff record.
                    </CardContent>
                </Card>
            ) : !profile.can_use_hr_attendance ? (
                <Card>
                    <CardContent className="space-y-2 py-8 text-center text-sm text-muted-foreground">
                        <p>HR attendance time tracking is disabled for your profile.</p>
                        <p>Ask HR to enable it on your staff record. Work-order labor time is separate.</p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <Card className={todayRecord?.clock_in && !todayRecord?.clock_out ? "border-primary/30 bg-primary/5" : undefined}>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Clock className="h-5 w-5 text-primary" />
                                Today
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p className="text-xs uppercase text-muted-foreground">Clock in</p>
                                    <p className="font-medium">{formatTime(todayRecord?.clock_in)}</p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase text-muted-foreground">Clock out</p>
                                    <p className="font-medium">{formatTime(todayRecord?.clock_out)}</p>
                                </div>
                            </div>
                            {todayRecord?.status && (
                                <Badge variant="secondary" className="capitalize">{todayRecord.status}</Badge>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    onClick={() => clockInMutation.mutate()}
                                    disabled={busy || !!todayRecord?.clock_in}
                                >
                                    <LogIn className="mr-2 h-4 w-4" />
                                    Clock In
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => clockOutMutation.mutate()}
                                    disabled={busy || !todayRecord?.clock_in || !!todayRecord?.clock_out}
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Clock Out
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Recent days</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {recent.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No attendance records yet.</p>
                            ) : (
                                recent.map((r) => (
                                    <div
                                        key={r.id}
                                        className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                                    >
                                        <div>
                                            <p className="font-medium">{r.date}</p>
                                            <p className="text-xs text-muted-foreground capitalize">{r.status}</p>
                                        </div>
                                        <p className="font-mono text-xs text-muted-foreground">
                                            {formatTime(r.clock_in)} – {formatTime(r.clock_out)}
                                        </p>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </MobilePageShell>
    );
}
