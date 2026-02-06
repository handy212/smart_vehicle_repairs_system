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
    ArrowLeft,
    MapPin,
    Mail,
    Phone,
    Calendar,
    Award,
    Briefcase,
    Clock,
    Map as MapIcon,
    Loader2,
    Edit
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { ShiftSchedule } from "@/components/technicians/ShiftSchedule";
import { JobHistory } from "@/components/technicians/JobHistory";
import { Certifications } from "@/components/technicians/Certifications";
import { PerformanceMetrics } from "@/components/technicians/PerformanceMetrics";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

export default function TechnicianProfilePage() {
    return (
        <PermissionGuard permission="view_technicians">
            <TechnicianProfileContent />
        </PermissionGuard>
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

    const getStatusColor = (status: Technician['current_status']) => {
        switch (status) {
            case 'available': return "text-success bg-green-100 dark:bg-green-900/30 dark:text-green-400";
            case 'busy': return "text-primary bg-orange-100 dark:bg-orange-900/30 dark:text-primary";
            case 'break': return "text-primary bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400";
            case 'offline': return "text-gray-600 bg-border dark:text-gray-400";
            default: return "";
        }
    };

    return (
        <div className="space-y-4 max-w-6xl mx-auto">
            {/* Breadcrumbs */}
            <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
                <span>/</span>
                <Link href="/technicians" className="hover:text-foreground transition-colors">Technicians</Link>
                <span>/</span>
                <span className="text-foreground font-medium">
                    {technician.user_details?.full_name || `${technician.user_details?.first_name} ${technician.user_details?.last_name}`}
                </span>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                        <AvatarImage src={technician.user_details?.profile_picture} />
                        <AvatarFallback className="text-sm">
                            {technician.user_details?.first_name?.[0]}{technician.user_details?.last_name?.[0]}
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <h1 className="text-xl font-bold text-foreground tracking-tight">
                            {technician.user_details?.full_name || `${technician.user_details?.first_name} ${technician.user_details?.last_name}`}
                        </h1>
                        <p className="text-sm text-muted-foreground">ID: #{technician.id}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("capitalize text-xs px-2 py-0.5", getStatusColor(technician.current_status))}>
                        {technician.current_status}
                    </Badge>
                    <Button size="sm" variant="outline" asChild>
                        <Link href={`/technicians/${id}/edit`}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                        </Link>
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Column: Info Card */}
                <div className="md:col-span-1 space-y-6">
                    <Card className="overflow-hidden">
                        <div className="h-32 bg-gradient-to-r from-primary to-indigo-600 relative">
                            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
                                <Avatar className="h-24 w-24 border-4 border-white dark:border-gray-950 shadow-lg">
                                    <AvatarImage src={technician.user_details?.profile_picture} />
                                    <AvatarFallback className="text-2xl font-bold bg-white text-primary">
                                        {technician.user_details?.first_name?.[0]}{technician.user_details?.last_name?.[0]}
                                    </AvatarFallback>
                                </Avatar>
                            </div>
                        </div>
                        <CardContent className="pt-16 pb-6 text-center space-y-2">
                            <h2 className="text-xl font-bold">
                                {technician.user_details?.full_name || `${technician.user_details?.first_name} ${technician.user_details?.last_name}`}
                            </h2>
                            <Badge variant="outline" className={cn("capitalize px-3 py-1", getStatusColor(technician.current_status))}>
                                {technician.current_status}
                            </Badge>

                            <div className="pt-4 flex flex-col gap-2 text-sm text-muted-foreground items-center">
                                <div className="flex items-center gap-2">
                                    <Mail className="h-4 w-4" />
                                    <span>{technician.user_details?.email}</span>
                                </div>
                                {technician.user_details?.phone && (
                                    <div className="flex items-center gap-2">
                                        <Phone className="h-4 w-4" />
                                        <span>{technician.user_details?.phone}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4" />
                                    <span>{technician.user_details?.branch_name || "No Branch Assigned"}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Award className="h-4 w-4 text-primary" />
                                Skills & Expertise
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {technician.skills.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {technician.skills.map(skill => (
                                        <Badge key={skill.id} variant="secondary">
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
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Briefcase className="h-4 w-4 text-primary" />
                                Work Summary
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Experience</span>
                                <span className="font-medium">{technician.years_of_experience} Years</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Joined</span>
                                <span className="font-medium">{format(new Date(technician.created_at), "MMM d, yyyy")}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Main Content */}
                <div className="md:col-span-2">
                    <Tabs defaultValue="overview" className="space-y-6">
                        <TabsList>
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <PermissionGuard permission="view_technician_performance">
                                <TabsTrigger value="performance">Performance</TabsTrigger>
                            </PermissionGuard>
                            <PermissionGuard permission="manage_technician_skills">
                                <TabsTrigger value="certifications">Certifications</TabsTrigger>
                            </PermissionGuard>
                            <PermissionGuard permission="manage_technician_schedules">
                                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                            </PermissionGuard>
                            <TabsTrigger value="history">Job History</TabsTrigger>
                            <TabsTrigger value="location">Live Location</TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="space-y-6">
                            {/* Active Jobs Card (Placeholder) */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Current Status</CardTitle>
                                    <CardDescription>Real-time activity overview</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="bg-primary/10 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-100 dark:border-orange-800">
                                            <div className="text-2xl font-bold text-primary dark:text-primary">0</div>
                                            <div className="text-sm text-primary dark:text-orange-300">Active Jobs</div>
                                        </div>
                                        <div className="bg-success/10 dark:bg-green-900/20 p-4 rounded-lg border border-green-100 dark:border-green-800">
                                            <div className="text-2xl font-bold text-green-700 dark:text-green-400">0</div>
                                            <div className="text-sm text-success dark:text-green-300">Completed This Week</div>
                                        </div>
                                        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-100 dark:border-purple-800">
                                            <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">0%</div>
                                            <div className="text-sm text-purple-600 dark:text-purple-300">Utilization Rate</div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Bio */}
                            {technician.bio && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Biography</CardTitle>
                                    </CardHeader>
                                    <CardContent>
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
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle>Schedule</CardTitle>
                                            <CardDescription>Upcoming shifts and time off</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <ShiftScheduleWrapper technicianId={id} />
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="history">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Job History</CardTitle>
                                    <CardDescription>Past completed work orders and repairs</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <JobHistoryWrapper technicianId={id} />
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="location">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Last Known Location</CardTitle>
                                    <CardDescription>
                                        Updated: {technician.last_location_update ? format(new Date(technician.last_location_update), "Pp") : "Never"}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {technician.last_latitude && technician.last_longitude ? (
                                        <div className="bg-border h-64 rounded-lg flex items-center justify-center">
                                            {/* Map placeholder */}
                                            <div className="text-center">
                                                <MapIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                <p className="text-sm font-mono">{technician.last_latitude}, {technician.last_longitude}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                                            <MapPin className="h-12 w-12 mb-4 opacity-20" />
                                            <h3 className="text-lg font-semibold mb-1 text-foreground">Location Unavailable</h3>
                                            <p>No location data available for this technician.</p>
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
