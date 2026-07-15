"use client";

import { useQuery } from "@tanstack/react-query";
import { hrApi } from "@/lib/api/hr";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard"
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
    Users,
    Building2,
    Calendar,
    Clock,
    Banknote,
    UserPlus,
    AlertTriangle,
    CheckCircle2,
    Briefcase,
    FileCheck,
    ArrowRight,
    UserCheck,
    UserX,
    Coffee,
    Timer,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { format, differenceInDays, parseISO } from "date-fns";

export default function HRPage() {
    return (
        <PermissionPageGuard permission="view_hr">
            <DynamicPageTitle title="HR Management" />
            <HRDashboardContent />
        </PermissionPageGuard>
    );
}

function StatBar({ label, value, total, colorClass }: {
    label: string;
    value: number;
    total: number;
    colorClass: string;
}) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold text-foreground">{value} <span className="font-normal text-muted-foreground">({pct}%)</span></span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                    className={cn("h-full rounded-full transition-all duration-500", colorClass)}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

function Skeleton({ className }: { className?: string }) {
    return <div className={cn("rounded bg-muted animate-pulse", className)} />;
}

function HRDashboardContent() {
    const { data: staffSummary, isLoading: loadingStaff } = useQuery({
        queryKey: ["hr", "staff-summary"],
        queryFn: async () => {
            const res = await hrApi.staff.summary();
            return res.data;
        },
    });

    const { data: pendingLeave, isLoading: loadingLeave } = useQuery({
        queryKey: ["hr", "pending-leave"],
        queryFn: async () => {
            const res = await hrApi.leaveRequests.pending();
            return res.data;
        },
    });

    const { data: attendanceSummary, isLoading: loadingAttendance } = useQuery({
        queryKey: ["hr", "attendance-today"],
        queryFn: async () => {
            const res = await hrApi.attendance.todaySummary();
            return res.data;
        },
    });

    const { data: expiringDocs, isLoading: loadingCompliance } = useQuery({
        queryKey: ["hr", "expiring-docs"],
        queryFn: async () => {
            const res = await hrApi.complianceDocuments.expiringSoon();
            return res.data;
        },
    });

    const { data: openJobsData, isLoading: loadingJobs } = useQuery({
        queryKey: ["hr", "open-jobs"],
        queryFn: async () => {
            const res = await hrApi.jobOpenings.list({ status: "open" });
            return res.data;
        },
    });

    const openJobs = openJobsData?.results ?? [];

    // KPI values
    const totalStaff = staffSummary?.total_staff ?? 0;
    const activeStaff = staffSummary?.active ?? 0;
    const probationStaff = staffSummary?.probation ?? 0;
    const terminatedStaff = staffSummary?.terminated ?? 0;
    const resignedStaff = staffSummary?.resigned ?? 0;
    const pendingLeaveCount = pendingLeave?.length ?? 0;
    const attendanceRate = attendanceSummary?.attendance_rate ?? 0;
    const presentCount = attendanceSummary?.present ?? 0;
    const lateCount = attendanceSummary?.late ?? 0;
    const absentCount = attendanceSummary?.absent ?? 0;
    const onLeaveCount = attendanceSummary?.on_leave ?? 0;
    const attendanceTotal = attendanceSummary?.total ?? totalStaff;
    const expiringCount = expiringDocs?.length ?? 0;

    const kpis = [
        {
            label: "Total Staff",
            value: loadingStaff ? null : totalStaff,
            sub: loadingStaff ? null : `${activeStaff} active · ${probationStaff} probation`,
            icon: Users,
            iconBg: "bg-primary/5 dark:bg-primary/15",
            iconColor: "text-primary dark:text-primary",
            href: "/hr/staff",
        },
        {
            label: "Pending Leave",
            value: loadingLeave ? null : pendingLeaveCount,
            sub: "Awaiting approval",
            icon: Calendar,
            iconBg: "bg-warning/10 dark:bg-warning/15",
            iconColor: "text-warning dark:text-warning",
            href: "/hr/leave",
        },
        {
            label: "Today's Attendance",
            value: loadingAttendance ? null : `${attendanceRate}%`,
            sub: loadingAttendance ? null : `${presentCount} present · ${lateCount} late`,
            icon: Clock,
            iconBg: "bg-success/10 dark:bg-success/15",
            iconColor: "text-success dark:text-success",
            href: "/hr/attendance",
        },
        {
            label: "Expiring Docs",
            value: loadingCompliance ? null : expiringCount,
            sub: "Within 30 days",
            icon: AlertTriangle,
            iconBg: expiringCount > 0 ? "bg-destructive/5 dark:bg-destructive/15" : "bg-muted",
            iconColor: expiringCount > 0 ? "text-destructive dark:text-destructive" : "text-muted-foreground",
            href: "/hr/compliance",
        },
    ];

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="HR Management"
                breadcrumbs={[
                    { label: "Dashboard", href: "/dashboard" },
                    { label: "HR Management" },
                ]}
                actions={
                    <PermissionGuard permission="manage_staff">
                        <Button size="sm" asChild>
                            <Link href="/hr/staff/new">
                                <UserPlus className="h-4 w-4 mr-2" />
                                Add Staff
                            </Link>
                        </Button>
                    </PermissionGuard>
                }
            />

            {/* KPI Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {kpis.map((kpi) => (
                    <Link key={kpi.label} href={kpi.href} className="block group">
                        <Card className="border border-border bg-card shadow-sm h-full transition-shadow hover:shadow-md">
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
                                        {kpi.value === null ? (
                                            <Skeleton className="h-7 w-16 mt-1" />
                                        ) : (
                                            <p className="text-2xl font-bold text-foreground mt-0.5 leading-none">{kpi.value}</p>
                                        )}
                                        {kpi.sub && (
                                            <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{kpi.sub}</p>
                                        )}
                                    </div>
                                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", kpi.iconBg)}>
                                        <kpi.icon className={cn("h-4 w-4", kpi.iconColor)} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>

            {/* Main content: 3-column grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* Staff Status Breakdown */}
                <Card className="border border-border bg-card shadow-sm">
                    <CardHeader className="pb-3 pt-4 px-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold">Staff Breakdown</CardTitle>
                            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" asChild>
                                <Link href="/hr/staff">View all <ArrowRight className="ml-1 h-3 w-3" /></Link>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-4">
                        {loadingStaff ? (
                            <div className="space-y-3">
                                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-6 w-full" />)}
                            </div>
                        ) : (
                            <>
                                <div className="space-y-3">
                                    <StatBar label="Active" value={activeStaff} total={totalStaff} colorClass="bg-success" />
                                    <StatBar label="Probation" value={probationStaff} total={totalStaff} colorClass="bg-warning" />
                                    <StatBar label="Terminated" value={terminatedStaff} total={totalStaff} colorClass="bg-destructive" />
                                    <StatBar label="Resigned" value={resignedStaff} total={totalStaff} colorClass="bg-muted-foreground" />
                                </div>

                                {staffSummary?.by_department && staffSummary.by_department.length > 0 && (
                                    <div className="pt-2 border-t border-border">
                                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">By Department</p>
                                        <div className="space-y-1.5">
                                            {staffSummary.by_department.slice(0, 5).map((dept) => (
                                                <div key={dept.department__name} className="flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                                                        <span className="text-muted-foreground truncate">{dept.department__name || "Unassigned"}</span>
                                                    </div>
                                                    <span className="font-semibold text-foreground ml-2 shrink-0">{dept.count}</span>
                                                </div>
                                            ))}
                                            {staffSummary.by_department.length > 5 && (
                                                <p className="text-[11px] text-muted-foreground pt-1">
                                                    +{staffSummary.by_department.length - 5} more departments
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Today's Attendance Detail */}
                <Card className="border border-border bg-card shadow-sm">
                    <CardHeader className="pb-3 pt-4 px-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold">Today's Attendance</CardTitle>
                            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" asChild>
                                <Link href="/hr/attendance">Details <ArrowRight className="ml-1 h-3 w-3" /></Link>
                            </Button>
                        </div>
                        {!loadingAttendance && attendanceSummary && (
                            <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
                        )}
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        {loadingAttendance ? (
                            <div className="space-y-4">
                                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Rate circle + summary */}
                                <div className="flex items-center gap-4 pb-3 border-b border-border">
                                    <div className="relative flex items-center justify-center h-14 w-14 shrink-0">
                                        <svg className="h-14 w-14 -rotate-90" viewBox="0 0 36 36">
                                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted/40" />
                                            <circle
                                                cx="18" cy="18" r="15.9" fill="none"
                                                stroke="currentColor" strokeWidth="2.5"
                                                strokeDasharray={`${attendanceRate} ${100 - attendanceRate}`}
                                                strokeLinecap="round"
                                                className="text-success"
                                            />
                                        </svg>
                                        <span className="absolute text-xs font-bold text-foreground">{attendanceRate}%</span>
                                    </div>
                                    <div className="text-sm">
                                        <p className="font-semibold text-foreground">{attendanceRate >= 90 ? "Excellent" : attendanceRate >= 75 ? "Good" : attendanceRate >= 60 ? "Fair" : "Low"}</p>
                                        <p className="text-muted-foreground text-xs">{attendanceTotal} staff total</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { icon: UserCheck, label: "Present", value: presentCount, color: "text-success", bg: "bg-success/10 dark:bg-success/15" },
                                        { icon: Timer, label: "Late", value: lateCount, color: "text-warning", bg: "bg-warning/10 dark:bg-warning/15" },
                                        { icon: UserX, label: "Absent", value: absentCount, color: "text-destructive", bg: "bg-destructive/5 dark:bg-destructive/15" },
                                        { icon: Coffee, label: "On Leave", value: onLeaveCount, color: "text-primary", bg: "bg-primary/5 dark:bg-primary/15" },
                                    ].map((item) => (
                                        <div key={item.label} className={cn("flex items-center gap-2 p-2.5 rounded-lg", item.bg)}>
                                            <item.icon className={cn("h-4 w-4 shrink-0", item.color)} />
                                            <div>
                                                <p className={cn("text-sm font-bold leading-none", item.color)}>{item.value}</p>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">{item.label}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Pending Leave Requests */}
                <Card className="border border-border bg-card shadow-sm">
                    <CardHeader className="pb-3 pt-4 px-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold">
                                Pending Leave
                                {pendingLeaveCount > 0 && (
                                    <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 bg-warning/15 text-warning dark:bg-warning/20 dark:text-warning">
                                        {pendingLeaveCount}
                                    </Badge>
                                )}
                            </CardTitle>
                            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" asChild>
                                <Link href="/hr/leave">View all <ArrowRight className="ml-1 h-3 w-3" /></Link>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        {loadingLeave ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                            </div>
                        ) : pendingLeave && pendingLeave.length > 0 ? (
                            <div className="space-y-2">
                                {pendingLeave.slice(0, 5).map((req) => (
                                    <Link
                                        key={req.id}
                                        href="/hr/leave"
                                        className="flex items-start gap-3 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors group"
                                    >
                                        <div className="h-8 w-8 rounded-full bg-warning/15 dark:bg-warning/20 flex items-center justify-center shrink-0 text-warning dark:text-warning text-xs font-bold">
                                            {req.staff_name?.charAt(0)?.toUpperCase() ?? "?"}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-foreground truncate">{req.staff_name}</p>
                                            <p className="text-[11px] text-muted-foreground leading-snug">
                                                {req.leave_type_name} · {req.days_count}d
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                                {req.start_date} → {req.end_date}
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                                {pendingLeave.length > 5 && (
                                    <p className="text-xs text-center text-muted-foreground pt-1">
                                        +{pendingLeave.length - 5} more requests
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <CheckCircle2 className="h-8 w-8 text-success mb-2" />
                                <p className="text-sm font-medium text-foreground">All clear</p>
                                <p className="text-xs text-muted-foreground mt-0.5">No pending leave requests</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Bottom row: Compliance + Recruitment */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Expiring Compliance Docs */}
                <Card className="border border-border bg-card shadow-sm">
                    <CardHeader className="pb-3 pt-4 px-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-sm font-semibold">Expiring Compliance Docs</CardTitle>
                                {expiringCount > 0 && (
                                    <Badge variant="danger" className="text-[10px] px-1.5 py-0">
                                        {expiringCount}
                                    </Badge>
                                )}
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" asChild>
                                <Link href="/hr/compliance">Manage <ArrowRight className="ml-1 h-3 w-3" /></Link>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        {loadingCompliance ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                            </div>
                        ) : expiringDocs && expiringDocs.length > 0 ? (
                            <div className="space-y-2">
                                {expiringDocs.slice(0, 6).map((doc) => {
                                    const daysLeft = doc.days_until_expiry ?? (doc.expiry_date
                                        ? differenceInDays(parseISO(doc.expiry_date), new Date())
                                        : null);
                                    const isExpired = daysLeft !== null && daysLeft < 0;
                                    const isCritical = daysLeft !== null && daysLeft <= 7 && !isExpired;
                                    return (
                                        <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card">
                                            <div className={cn(
                                                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                                                isExpired ? "bg-destructive/10 dark:bg-destructive/15" :
                                                    isCritical ? "bg-warning/15 dark:bg-warning/15" : "bg-warning/10 dark:bg-warning/15"
                                            )}>
                                                <FileCheck className={cn("h-4 w-4", isExpired ? "text-destructive" : isCritical ? "text-warning" : "text-warning")} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold text-foreground truncate">{doc.staff_name}</p>
                                                <p className="text-[11px] text-muted-foreground truncate">{doc.name || doc.document_type}</p>
                                            </div>
                                            <Badge variant="outline" className={cn(
                                                "text-[10px] px-1.5 shrink-0",
                                                isExpired ? "border-destructive/40 text-destructive bg-destructive/5 dark:bg-destructive/15 dark:text-destructive" :
                                                    isCritical ? "border-warning/40 text-warning bg-warning/10 dark:bg-warning/15 dark:text-warning" :
                                                        "border-warning/40 text-warning bg-warning/10 dark:bg-warning/15 dark:text-warning"
                                            )}>
                                                {isExpired ? "Expired" : daysLeft !== null ? `${daysLeft}d left` : "Expiring"}
                                            </Badge>
                                        </div>
                                    );
                                })}
                                {expiringDocs.length > 6 && (
                                    <Link href="/hr/compliance" className="text-xs text-center text-muted-foreground hover:text-foreground block pt-1 transition-colors">
                                        +{expiringDocs.length - 6} more documents →
                                    </Link>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <CheckCircle2 className="h-8 w-8 text-success mb-2" />
                                <p className="text-sm font-medium text-foreground">All documents valid</p>
                                <p className="text-xs text-muted-foreground mt-0.5">No documents expiring within 30 days</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Open Job Openings */}
                <Card className="border border-border bg-card shadow-sm">
                    <CardHeader className="pb-3 pt-4 px-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-sm font-semibold">Open Positions</CardTitle>
                                {openJobs.length > 0 && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary">
                                        {openJobs.length}
                                    </Badge>
                                )}
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" asChild>
                                <Link href="/hr/recruitment">All jobs <ArrowRight className="ml-1 h-3 w-3" /></Link>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        {loadingJobs ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                            </div>
                        ) : openJobs.length > 0 ? (
                            <div className="space-y-2">
                                {openJobs.slice(0, 6).map((job) => (
                                    <Link
                                        key={job.id}
                                        href={`/hr/recruitment/${job.id}`}
                                        className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors group"
                                    >
                                        <div className="h-8 w-8 rounded-lg bg-primary/5 dark:bg-primary/15 flex items-center justify-center shrink-0">
                                            <Briefcase className="h-4 w-4 text-primary dark:text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">{job.title}</p>
                                            <p className="text-[11px] text-muted-foreground">
                                                {job.department_name} · {job.applicant_count} applicant{job.applicant_count !== 1 ? "s" : ""}
                                            </p>
                                        </div>
                                        <Badge variant="outline" className="text-[10px] px-1.5 shrink-0 border-success/40 text-success bg-success/10 dark:bg-success/15 dark:text-success">
                                            Open
                                        </Badge>
                                    </Link>
                                ))}
                                {openJobs.length > 6 && (
                                    <Link href="/hr/recruitment" className="text-xs text-center text-muted-foreground hover:text-foreground block pt-1 transition-colors">
                                        +{openJobs.length - 6} more positions →
                                    </Link>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <Briefcase className="h-8 w-8 text-muted-foreground mb-2" />
                                <p className="text-sm font-medium text-foreground">No open positions</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Post a job to start hiring</p>
                                <Button size="sm" variant="outline" className="mt-3" asChild>
                                    <Link href="/hr/recruitment/new">
                                        <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                                        Post a Job
                                    </Link>
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Payroll quick link footer strip */}
            <Card className="border border-border bg-card shadow-sm">
                <CardContent className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">Quick access</span>
                        {[
                            { label: "Payroll", href: "/hr/payroll", icon: Banknote },
                            { label: "Performance", href: "/hr/performance", icon: Users },
                            { label: "Training", href: "/hr/training", icon: Users },
                            { label: "Departments", href: "/hr/departments", icon: Building2 },
                        ].map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-muted/70 border border-transparent hover:border-border"
                            >
                                <item.icon className="h-3.5 w-3.5" />
                                {item.label}
                            </Link>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
