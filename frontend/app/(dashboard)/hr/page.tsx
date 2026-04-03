"use client";

import { useQuery } from "@tanstack/react-query";
import { hrApi } from "@/lib/api/hr";
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
    Target,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Shield,
    AlertTriangle,
    CheckCircle2,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    TrendingUp,
    Briefcase,
    GraduationCap,
} from "lucide-react";
import { useTheme } from "@/lib/hooks/useTheme";
import { cn } from "@/lib/utils/cn";

export default function HRPage() {
    return (
        <PermissionGuard permission="view_hr">
            <DynamicPageTitle title="HR Management" />
            <HRDashboardContent />
        </PermissionGuard>
    );
}

function HRKpiCards({ loadingStaff, staffSummary, loadingLeave, pendingLeave, loadingAttendance, attendanceSummary, loadingCompliance, expiringDocs }: {
    loadingStaff: boolean; staffSummary: any;
    loadingLeave: boolean; pendingLeave: any;
    loadingAttendance: boolean; attendanceSummary: any;
    loadingCompliance: boolean; expiringDocs: any;
}) {
    const { theme: activeTheme } = useTheme();
    const isPerfex = activeTheme === "perfex";

    const cards = [
        {
            label: "Total Staff", icon: Users,
            value: loadingStaff ? "—" : staffSummary?.total_staff ?? 0,
            sub: !loadingStaff && staffSummary ? `${staffSummary.active} active, ${staffSummary.probation} probation` : null,
            color: "text-primary", bgColor: "bg-info/10 dark:bg-blue-900/20",
        },
        {
            label: "Pending Leave", icon: Calendar,
            value: loadingLeave ? "—" : pendingLeave?.length ?? 0,
            sub: "Awaiting approval",
            color: "text-warning", bgColor: "bg-warning/10 dark:bg-amber-900/20",
        },
        {
            label: "Today's Attendance", icon: Clock,
            value: loadingAttendance ? "—" : `${attendanceSummary?.attendance_rate ?? 0}%`,
            sub: !loadingAttendance && attendanceSummary ? `${attendanceSummary.present} present, ${attendanceSummary.late} late` : null,
            color: "text-success", bgColor: "bg-success/10 dark:bg-green-900/20",
        },
        {
            label: "Expiring Docs", icon: AlertTriangle,
            value: loadingCompliance ? "—" : expiringDocs?.length ?? 0,
            sub: "Within 30 days",
            color: "text-destructive", bgColor: "bg-destructive/10 dark:bg-red-900/20",
        },
    ];

    if (isPerfex) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {cards.map((card) => (
                    <Card key={card.label} className="border border-border bg-card rounded-md shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]">
                        <CardContent className="p-3 flex items-center gap-3">
                            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", card.bgColor)}>
                                <card.icon className={cn("h-4 w-4", card.color)} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-lg font-bold leading-none text-foreground">{card.value}</p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{card.label}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {cards.map((card) => (
                <Card key={card.label} className="shadow-sm border bg-card">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{card.label}</p>
                                <p className="text-2xl font-bold text-foreground mt-1">{card.value}</p>
                            </div>
                            <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", card.bgColor)}>
                                <card.icon className={cn("h-5 w-5", card.color)} />
                            </div>
                        </div>
                        {card.sub && <p className="text-xs text-muted-foreground mt-2">{card.sub}</p>}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
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

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="HR Management"
                breadcrumbs={[
                    { label: "Dashboard", href: "/dashboard" },
                    { label: "HR Management" },
                ]}
                actions={
                    <div className="flex gap-2">
                        <PermissionGuard permission="manage_staff">
                            <Button size="sm" asChild>
                                <Link href="/hr/staff/new">
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Add Staff
                                </Link>
                            </Button>
                        </PermissionGuard>
                    </div>
                }
            />

            {/* KPI Cards */}
            <HRKpiCards
                loadingStaff={loadingStaff} staffSummary={staffSummary}
                loadingLeave={loadingLeave} pendingLeave={pendingLeave}
                loadingAttendance={loadingAttendance} attendanceSummary={attendanceSummary}
                loadingCompliance={loadingCompliance} expiringDocs={expiringDocs}
            />

            {/* Quick Actions + Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Quick Actions */}
                <Card className="shadow-sm border">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {[
                            { label: "View Staff", href: "/hr/staff", icon: Users, color: "text-primary" },
                            { label: "Manage Leave", href: "/hr/leave", icon: Calendar, color: "text-warning" },
                            { label: "View Attendance", href: "/hr/attendance", icon: Clock, color: "text-success" },
                            { label: "Payroll", href: "/hr/payroll", icon: Banknote, color: "text-primary" },
                            { label: "Recruitment", href: "/hr/recruitment", icon: Briefcase, color: "text-info" },
                            { label: "Departments", href: "/hr/departments", icon: Building2, color: "text-primary" },
                            { label: "Performance Reviews", href: "/hr/performance", icon: Target, color: "text-destructive" },
                            { label: "Training", href: "/hr/training", icon: GraduationCap, color: "text-teal-600" },
                        ].map((action) => (
                            <Link
                                key={action.href}
                                href={action.href}
                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/80 transition-colors group"
                            >
                                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center group-hover:bg-background transition-colors">
                                    <action.icon className={`h-4 w-4 ${action.color}`} />
                                </div>
                                <span className="text-sm font-medium text-foreground">{action.label}</span>
                            </Link>
                        ))}
                    </CardContent>
                </Card>

                {/* Pending Leave Requests */}
                <Card className="shadow-sm border lg:col-span-2">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-semibold">Pending Leave Requests</CardTitle>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/hr/leave">View All</Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {loadingLeave ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                                ))}
                            </div>
                        ) : pendingLeave && pendingLeave.length > 0 ? (
                            <div className="space-y-2">
                                {pendingLeave.slice(0, 5).map((req) => (
                                    <div
                                        key={req.id}
                                        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">
                                                {req.staff_name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {req.leave_type_name} • {req.start_date} to {req.end_date} ({req.days_count} days)
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 ml-4">
                                            <Badge
                                                variant="outline"
                                                className="text-[10px] px-2 py-0.5 bg-warning/10 text-amber-700 border-warning/20 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
                                            >
                                                Pending
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <CheckCircle2 className="h-8 w-8 text-success mb-2" />
                                <p className="text-sm text-muted-foreground">No pending leave requests</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Department Breakdown */}
            {!loadingStaff && staffSummary?.by_department && staffSummary.by_department.length > 0 && (
                <Card className="shadow-sm border">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-semibold">Staff by Department</CardTitle>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/hr/departments">Manage Departments</Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {staffSummary.by_department.map((dept) => (
                                <div
                                    key={dept.department__name}
                                    className="flex flex-col items-center p-3 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors"
                                >
                                    <Building2 className="h-5 w-5 text-muted-foreground mb-1" />
                                    <p className="text-lg font-bold text-foreground">{dept.count}</p>
                                    <p className="text-xs text-muted-foreground text-center truncate w-full">
                                        {dept.department__name || "Unassigned"}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
