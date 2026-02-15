"use client";

import { useQuery } from "@tanstack/react-query";
import { techniciansApi, Technician } from "@/lib/api/technicians";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Filter, Grid, List as ListIcon, Users, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { StaffStatsGrid } from "@/components/shared/StaffStatsGrid";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";

export default function TechniciansPage() {
    return (
        <PermissionGuard permission="view_technicians">
            <DynamicPageTitle title="Technicians" />
            <TechniciansContent />
        </PermissionGuard>
    );
}

function TechniciansContent() {
    const router = useRouter();
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

    const { data, isLoading } = useQuery({
        queryKey: ["technicians", searchQuery, statusFilter],
        queryFn: () => techniciansApi.list({ search: searchQuery, status: statusFilter }),
    });

    const getStatusColor = (status: Technician['current_status']) => {
        switch (status) {
            case 'available': return "bg-success/100/15 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800";
            case 'busy': return "bg-primary/15 text-primary border-orange-200 dark:border-orange-800";
            case 'break': return "bg-primary/15 text-primary dark:text-orange-400 border-orange-200 dark:border-orange-800";
            case 'offline': return "bg-gray-500/15 text-foreground text-muted-foreground border-border";
            default: return "";
        }
    };

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="Technicians"
                breadcrumbs={[
                    { label: "Dashboard", href: "/dashboard" },
                    { label: "Technicians" }
                ]}
                actions={
                    <PermissionGuard permission="manage_technicians">
                        <Button size="sm" asChild>
                            <Link href="/hr/staff/new">
                                <Plus className="h-4 w-4 mr-2" />
                                Add via HR
                            </Link>
                        </Button>
                    </PermissionGuard>
                }
            />

            {/* HR redirect banner */}
            <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 px-3 py-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 dark:text-blue-400 flex-shrink-0"><rect width="16" height="20" x="4" y="2" rx="2" ry="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M12 6h.01" /><path d="M12 10h.01" /><path d="M12 14h.01" /><path d="M16 10h.01" /><path d="M16 14h.01" /><path d="M8 10h.01" /><path d="M8 14h.01" /></svg>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                    Technician profiles are now managed through the <Link href="/hr/staff" className="font-semibold underline hover:no-underline">HR module</Link>. Use the HR Staff page to create and manage staff.
                </p>
            </div>

            {/* Stats Overview */}
            {!isLoading && data?.results && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
                            <span className="text-lg font-bold text-foreground">{data.results.length}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Available</span>
                            <span className="text-lg font-bold text-success">{data.results.filter(t => t.current_status === 'available').length}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Busy</span>
                            <span className="text-lg font-bold text-primary">{data.results.filter(t => ['busy', 'break'].includes(t.current_status)).length}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Offline</span>
                            <span className="text-lg font-bold text-muted-foreground">{data.results.filter(t => t.current_status === 'offline').length}</span>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Filter Bar - Lightweight */}
            <Card className="border-none shadow-sm bg-muted/50">
                <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <Input
                                placeholder="Search technicians..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-8 w-64 pl-9 text-sm bg-card transition-all focus:w-80"
                            />
                        </div>

                        {/* Status Filter */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8">
                                    <Filter className="h-4 w-4 mr-2" />
                                    {statusFilter ? statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1) : 'All Status'}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setStatusFilter(undefined)}>
                                    All Status
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter('available')}>
                                    Available
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter('busy')}>
                                    Busy
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter('break')}>
                                    On Break
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter('offline')}>
                                    Offline
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* View Toggle */}
                        <div className="ml-auto flex items-center gap-1 border rounded-md p-0.5">
                            <Button
                                variant={viewMode === "grid" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => setViewMode("grid")}
                            >
                                <Grid className="h-4 w-4" />
                            </Button>
                            <Button
                                variant={viewMode === "list" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => setViewMode("list")}
                            >
                                <ListIcon className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-64 rounded-xl bg-border animate-pulse" />
                    ))}
                </div>
            ) : (
                <>
                    {viewMode === "grid" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                            {data?.results && data.results.length > 0 ? (
                                data.results.map((tech) => (
                                    <Card
                                        key={tech.id}
                                        className="shadow-none border hover:shadow-md transition-shadow cursor-pointer"
                                        onDoubleClick={() => router.push(`/technicians/${tech.id}`)}
                                    >
                                        <CardContent className="p-3">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex gap-3 items-center">
                                                    <Avatar className="h-10 w-10 border-2 border-white dark:border-gray-900 shadow-sm">
                                                        <AvatarImage src={tech.user_details?.profile_picture} />
                                                        <AvatarFallback className="text-xs">{tech.user_details?.first_name?.[0]}{tech.user_details?.last_name?.[0]}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="text-sm font-semibold text-foreground truncate">
                                                            {tech.user_details?.full_name || `${tech.user_details?.first_name} ${tech.user_details?.last_name}`}
                                                        </h3>
                                                        <p className="text-xs text-muted-foreground">ID: #{tech.id}</p>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className={cn("capitalize text-[10px] px-2 py-0.5 border shadow-none bg-transparent", getStatusColor(tech.current_status))}>
                                                    {tech.current_status}
                                                </Badge>
                                            </div>

                                            <div className="space-y-2">
                                                {/* Skills */}
                                                {tech.skills.length > 0 && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {tech.skills.slice(0, 3).map((skill) => (
                                                            <Badge key={skill.id} variant="secondary" className="text-[10px] px-2 py-0.5 bg-border">
                                                                {skill.name}
                                                            </Badge>
                                                        ))}
                                                        {tech.skills.length > 3 && (
                                                            <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                                                                +{tech.skills.length - 3}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Stats */}
                                                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Experience</p>
                                                        <p className="text-sm font-medium text-foreground">{tech.years_of_experience} yrs</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Role</p>
                                                        <p className="text-sm font-medium text-foreground capitalize truncate">
                                                            {tech.user_details?.role?.replace('_', ' ') || 'Technician'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            ) : (
                                <div className="col-span-full flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-lg bg-muted/50">
                                    <div className="rounded-full bg-orange-100 dark:bg-orange-900/20 p-4 mb-4">
                                        <Search className="h-8 w-8 text-primary" />
                                    </div>
                                    <h3 className="text-lg font-semibold">No technicians found</h3>
                                    <p className="text-muted-foreground max-w-sm mt-2 mb-6">
                                        {searchQuery || statusFilter
                                            ? "Try adjusting your search or filters to find what you're looking for."
                                            : "Get started by adding your first field service technician to the system."}
                                    </p>
                                    <Button asChild>
                                        <Link href="/technicians/new">
                                            <Plus className="h-4 w-4 mr-2" />
                                            Add Technician
                                        </Link>
                                    </Button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <Card className="border-t shadow-sm">
                            <CardHeader className="py-3 px-4 border-b bg-muted/30">
                                <CardTitle className="text-sm font-semibold">All Technicians ({data?.results?.length || 0})</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50 hover:bg-muted/50 hover:bg-muted/50">
                                            <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Technician</TableHead>
                                            <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Contact</TableHead>
                                            <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Skills</TableHead>
                                            <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Experience</TableHead>
                                            <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
                                            <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data?.results && data.results.length > 0 ? (
                                            data.results.map((tech) => (
                                                <TableRow
                                                    key={tech.id}
                                                    className="group hover:bg-muted/80 hover:bg-muted/50 transition-colors border-b border-border cursor-pointer"
                                                    onDoubleClick={() => router.push(`/technicians/${tech.id}`)}
                                                >
                                                    <TableCell className="px-3 py-1.5">
                                                        <div className="flex items-center gap-3">
                                                            <Avatar className="h-8 w-8">
                                                                <AvatarImage src={tech.user_details?.profile_picture} />
                                                                <AvatarFallback className="text-xs">{tech.user_details?.first_name?.[0]}{tech.user_details?.last_name?.[0]}</AvatarFallback>
                                                            </Avatar>
                                                            <div>
                                                                <div className="text-sm font-medium text-foreground">
                                                                    {tech.user_details?.full_name || `${tech.user_details?.first_name} ${tech.user_details?.last_name}`}
                                                                </div>
                                                                <div className="text-xs text-muted-foreground">
                                                                    ID: #{tech.id}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2">
                                                        <div className="text-xs text-muted-foreground">
                                                            <div>{tech.user_details?.email}</div>
                                                            <div className="capitalize">{tech.user_details?.role?.replace('_', ' ') || 'Technician'}</div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2">
                                                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                            {tech.skills.length > 0 ? (
                                                                <>
                                                                    {tech.skills.slice(0, 2).map((skill) => (
                                                                        <Badge key={skill.id} variant="secondary" className="text-[10px] px-2 py-0.5 font-medium">
                                                                            {skill.name}
                                                                        </Badge>
                                                                    ))}
                                                                    {tech.skills.length > 2 && (
                                                                        <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                                                                            +{tech.skills.length - 2}
                                                                        </Badge>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground">No skills</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2 text-sm text-foreground">
                                                        {tech.years_of_experience} yrs
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2">
                                                        <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 font-medium border shadow-none bg-transparent capitalize", getStatusColor(tech.current_status))}>
                                                            {tech.current_status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2 text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 w-7 p-0 transition-opacity"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                router.push(`/technicians/${tech.id}`);
                                                            }}
                                                        >
                                                            <span className="sr-only">View</span>
                                                            →
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-32 text-center">
                                                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                        <Search className="h-8 w-8 mb-2 opacity-50" />
                                                        <p className="text-sm">No technicians found</p>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
