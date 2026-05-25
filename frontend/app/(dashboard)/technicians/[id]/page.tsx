"use client";

import { useQuery } from "@tanstack/react-query";
import { techniciansApi, Technician } from "@/lib/api/technicians";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
    MapPin,
    Mail,
    Phone,
    Calendar,
    Award,
    Briefcase,
    Map as MapIcon,
    Loader2,
    Edit,
    User
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { ShiftSchedule } from "@/components/technicians/ShiftSchedule";
import { JobHistory } from "@/components/technicians/JobHistory";
import { Certifications } from "@/components/technicians/Certifications";
import { PerformanceMetrics } from "@/components/technicians/PerformanceMetrics";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard"
import { PermissionGuard } from "@/components/auth/PermissionGuard";

export default function TechnicianProfilePage() {
    return (
        <PermissionPageGuard permission="view_technicians">
            <TechnicianProfileContent />
        </PermissionPageGuard>
    );
}

function TechnicianProfileContent() {
    const params = useParams();
    const id = Number(params?.id);

    const { data: technician, isLoading } = useQuery({
        queryKey: ["technician", id],
        queryFn: () => techniciansApi.get(id),
        enabled: !!id,
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!technician) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <h2 className="text-xl font-semibold">Technician not found</h2>
                <Button asChild>
                    <Link href="/technicians">Go Back</Link>
                </Button>
            </div>
        );
    }

    const displayName = technician.user_details?.full_name || `${technician.user_details?.first_name} ${technician.user_details?.last_name}`.trim();

    const getStatusColor = (status: Technician['current_status']) => {
        switch (status) {
            case 'available': return "border-success/20 bg-success/10 text-success";
            case 'busy': return "border-primary/20 bg-primary/10 text-primary";
            case 'break': return "border-warning/20 bg-warning/15 text-warning-foreground";
            case 'offline': return "border-border bg-muted text-muted-foreground";
            default: return "";
        }
    };

    const technicianTabClass = "h-8 px-2.5 text-xs sm:text-sm";

    return (
        <div className="mx-auto max-w-6xl space-y-4">
            {/* Breadcrumbs */}
            <div className="mb-1 flex items-center space-x-2 text-sm text-muted-foreground">
                <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
                <span>/</span>
                <Link href="/technicians" className="hover:text-foreground transition-colors">Technicians</Link>
                <span>/</span>
                <span className="text-foreground font-medium">
                    {displayName}
                </span>
            </div>

            {/* Header */}
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12">
                        <AvatarImage src={technician.user_details?.profile_picture} />
                        <AvatarFallback className="text-sm">
                            {technician.user_details?.first_name?.[0]}{technician.user_details?.last_name?.[0]}
                        </AvatarFallback>
                    </Avatar>
                    <div className="space-y-2">
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-foreground">
                                {displayName}
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Technician ID #{technician.id}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                                <Mail className="h-3.5 w-3.5" />
                                {technician.user_details?.email}
                            </span>
                            {technician.user_details?.phone && (
                                <span className="inline-flex items-center gap-1.5">
                                    <Phone className="h-3.5 w-3.5" />
                                    {technician.user_details?.phone}
                                </span>
                            )}
                            <span className="inline-flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5" />
                                {technician.user_details?.branch_name || "No Branch Assigned"}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={cn("px-2.5 py-1 text-xs capitalize", getStatusColor(technician.current_status))}>
                        {technician.current_status}
                    </Badge>
                    {technician.staff_id && (
                        <Button size="sm" variant="outline" asChild>
                            <Link href={`/hr/staff/${technician.staff_id}`}>
                                <User className="h-4 w-4 mr-2" />
                                HR Profile
                            </Link>
                        </Button>
                    )}
                    <Button size="sm" variant="outline" asChild>
                        <Link href={`/technicians/${id}/edit`}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                        </Link>
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* Left Column: Info Card */}
                <div className="space-y-3 md:col-span-1">
                    <Card>
                        <CardHeader className="px-4 py-3">
                            <CardTitle className="text-sm font-semibold">Profile</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 px-4 pb-4 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Experience</span>
                                <span className="font-medium">{technician.years_of_experience} Years</span>
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Joined</span>
                                <span className="inline-flex items-center gap-1.5 font-medium">
                                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                    {format(new Date(technician.created_at), "MMM d, yyyy")}
                                </span>
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Branch</span>
                                <span className="font-medium text-right">
                                    {technician.user_details?.branch_name || "No Branch Assigned"}
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="px-4 py-3">
                            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                                <Award className="h-4 w-4 text-primary" />
                                Skills & Expertise
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            {technician.skills.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {technician.skills.map(skill => (
                                        <Badge key={skill.id} variant="secondary" className="px-2 py-0.5">
                                            {skill.name}
                                        </Badge>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No skills listed</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="px-4 py-3">
                            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                                <Briefcase className="h-4 w-4 text-primary" />
                                Work Summary
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 px-4 pb-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Staff Linked</span>
                                <span className="font-medium">{technician.staff_id ? "Yes" : "No"}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Current Status</span>
                                <Badge variant="outline" className={cn("px-2 py-0.5 text-[11px] capitalize", getStatusColor(technician.current_status))}>
                                    {technician.current_status}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Main Content */}
                <div className="md:col-span-2">
                    <Tabs defaultValue="overview" className="space-y-3">
                        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
                            <TabsTrigger value="overview" className={technicianTabClass}>Overview</TabsTrigger>
                            <PermissionGuard permission="view_technician_performance">
                                <TabsTrigger value="performance" className={technicianTabClass}>Performance</TabsTrigger>
                            </PermissionGuard>
                            <PermissionGuard permission="manage_technician_skills">
                                <TabsTrigger value="certifications" className={technicianTabClass}>Certifications</TabsTrigger>
                            </PermissionGuard>
                            <PermissionGuard permission="manage_technician_schedules">
                                <TabsTrigger value="schedule" className={technicianTabClass}>Schedule</TabsTrigger>
                            </PermissionGuard>
                            <TabsTrigger value="history" className={technicianTabClass}>Job History</TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="space-y-3">
                            {/* Active Jobs Card (Placeholder) */}
                            <Card>
                                <CardHeader className="px-4 py-3">
                                    <CardTitle className="text-sm font-semibold">Current Status</CardTitle>
                                    <CardDescription className="text-xs">Real-time activity overview</CardDescription>
                                </CardHeader>
                                <CardContent className="px-4 pb-4">
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                        <div className="rounded-lg border border-primary/15 bg-primary/5 p-3">
                                            <div className="text-lg font-semibold text-primary">0</div>
                                            <div className="text-xs text-primary">Active Jobs</div>
                                        </div>
                                        <div className="rounded-lg border border-success/20 bg-success/10 p-3">
                                            <div className="text-lg font-semibold text-success">0</div>
                                            <div className="text-xs text-success">Completed This Week</div>
                                        </div>
                                        <div className="rounded-lg border border-info/20 bg-info/10 p-3">
                                            <div className="text-lg font-semibold text-info">0%</div>
                                            <div className="text-xs text-info">Utilization Rate</div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Bio */}
                            {technician.bio && (
                                <Card>
                                    <CardHeader className="px-4 py-3">
                                        <CardTitle className="text-sm font-semibold">Biography</CardTitle>
                                    </CardHeader>
                                    <CardContent className="px-4 pb-4">
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {technician.bio}
                                        </p>
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>

                        <TabsContent value="performance">
                            <PerformanceMetrics technicianId={id} />
                        </TabsContent>

                        <TabsContent value="certifications">
                            <Certifications technicianId={id} />
                        </TabsContent>

                        <TabsContent value="schedule">
                            <Card>
                                <CardHeader className="px-4 py-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-sm font-semibold">Schedule</CardTitle>
                                            <CardDescription className="text-xs">Upcoming shifts and time off</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="px-4 pb-4">
                                    <ShiftScheduleWrapper technicianId={id} />
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="history">
                            <Card>
                                <CardHeader className="px-4 py-3">
                                    <CardTitle className="text-sm font-semibold">Job History</CardTitle>
                                    <CardDescription className="text-xs">Past completed work orders and repairs</CardDescription>
                                </CardHeader>
                                <CardContent className="px-4 pb-4">
                                    <JobHistoryWrapper technicianId={id} />
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="location">
                            <Card>
                                <CardHeader className="px-4 py-3">
                                    <CardTitle className="text-sm font-semibold">Last Known Location</CardTitle>
                                    <CardDescription className="text-xs">
                                        Updated: {technician.last_location_update ? format(new Date(technician.last_location_update), "Pp") : "Never"}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="px-4 pb-4">
                                    {technician.last_latitude && technician.last_longitude ? (
                                        <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-muted/40">
                                            <div className="text-center">
                                                <MapIcon className="mx-auto mb-2 h-8 w-8 opacity-50" />
                                                <p className="text-sm font-mono">{technician.last_latitude}, {technician.last_longitude}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                                            <MapPin className="mb-3 h-8 w-8 opacity-30" />
                                            <h3 className="mb-1 text-sm font-semibold text-foreground">Location Unavailable</h3>
                                            <p className="text-sm">No location data available for this technician.</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    );
}

function ShiftScheduleWrapper({ technicianId }: { technicianId: number }) {
    const { data: shifts, isLoading } = useQuery({
        queryKey: ["technician-shifts", technicianId],
        queryFn: () => techniciansApi.getShifts(technicianId),
    });

    if (isLoading) {
        return <div className="h-32 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    }

    return <ShiftSchedule shifts={shifts || []} technicianId={technicianId} />;
}

function JobHistoryWrapper({ technicianId }: { technicianId: number }) {
    const { data: history, isLoading } = useQuery({
        queryKey: ["technician-history", technicianId],
        queryFn: () => techniciansApi.getJobHistory(technicianId),
    });

    if (isLoading) {
        return <div className="h-32 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    }

    return <JobHistory history={history || []} />;
}
