"use client";

import { useQuery } from "@tanstack/react-query";
import { hrApi, StaffListItem } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Plus, Search, Filter, Grid, List as ListIcon, Users,
} from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function StaffPage() {
    return (
        <PermissionGuard permission="view_staff">
            <DynamicPageTitle title="Staff" />
            <StaffContent />
        </PermissionGuard>
    );
}

function StaffContent() {
    const router = useRouter();
    const [viewMode, setViewMode] = useState<"grid" | "list">("list");
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "staff", searchQuery, statusFilter],
        queryFn: async () => {
            const res = await hrApi.staff.list({
                search: searchQuery,
                employment_status: statusFilter,
            });
            return res.data;
        },
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case "active": return "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800";
            case "probation": return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800";
            case "suspended": return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800";
            case "terminated": return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700";
            case "resigned": return "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700";
            default: return "";
        }
    };

    const staff = data?.results ?? [];
    const activeCount = staff.filter(e => e.employment_status === "active").length;
    const probationCount = staff.filter(e => e.employment_status === "probation").length;

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="Staff"
                breadcrumbs={[
                    { label: "Dashboard", href: "/dashboard" },
                    { label: "HR", href: "/hr" },
                    { label: "Staff" },
                ]}
                actions={
                    <PermissionGuard permission="manage_staff">
                        <Button size="sm" asChild>
                            <Link href="/hr/staff/new">
                                <Plus className="h-4 w-4 mr-2" />
                                Add Staff Member
                            </Link>
                        </Button>
                    </PermissionGuard>
                }
            />

            {/* Stats Overview */}
            {!isLoading && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
                            <span className="text-lg font-bold text-foreground">{data?.count ?? 0}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active</span>
                            <span className="text-lg font-bold text-green-600">{activeCount}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Probation</span>
                            <span className="text-lg font-bold text-amber-600">{probationCount}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Other</span>
                            <span className="text-lg font-bold text-muted-foreground">{staff.length - activeCount - probationCount}</span>
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
                                    {statusFilter ? statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1) : "All Status"}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setStatusFilter(undefined)}>All Status</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("active")}>Active</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("probation")}>Probation</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("suspended")}>Suspended</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("terminated")}>Terminated</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setStatusFilter("resigned")}>Resigned</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <div className="ml-auto flex items-center gap-1 border rounded-md p-0.5">
                            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-7 px-2" onClick={() => setViewMode("grid")}>
                                <Grid className="h-4 w-4" />
                            </Button>
                            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-7 px-2" onClick={() => setViewMode("list")}>
                                <ListIcon className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Content */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
                    ))}
                </div>
            ) : viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {staff.length > 0 ? staff.map((emp) => (
                        <Card
                            key={emp.id}
                            className="shadow-none border hover:shadow-md transition-shadow cursor-pointer"
                            onClick={() => router.push(`/hr/staff/${emp.id}`)}
                        >
                            <CardContent className="p-3">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex gap-3 items-center">
                                        <Avatar className="h-10 w-10 border-2 border-white dark:border-gray-900 shadow-sm">
                                            <AvatarImage src={emp.profile_picture ?? undefined} />
                                            <AvatarFallback className="text-xs">
                                                {emp.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-semibold text-foreground truncate">{emp.full_name}</h3>
                                            <p className="text-xs text-muted-foreground truncate">{emp.position_title || "No Position"}</p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className={cn("capitalize text-[10px] px-2 py-0.5 border shadow-none", getStatusColor(emp.employment_status))}>
                                        {emp.employment_status}
                                    </Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Department</p>
                                        <p className="text-sm font-medium text-foreground truncate">{emp.department_name || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Type</p>
                                        <p className="text-sm font-medium text-foreground capitalize">{emp.employment_type?.replace("_", " ")}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )) : (
                        <div className="col-span-full flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-lg bg-muted/50">
                            <div className="rounded-full bg-blue-100 dark:bg-blue-900/20 p-4 mb-4">
                                <Users className="h-8 w-8 text-blue-600" />
                            </div>
                            <h3 className="text-lg font-semibold">No staff found</h3>
                            <p className="text-muted-foreground max-w-sm mt-2 mb-6">
                                {searchQuery || statusFilter
                                    ? "Try adjusting your search or filters."
                                    : "Get started by adding your first staff."}
                            </p>
                            <Button asChild>
                                <Link href="/hr/staff/new">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Staff
                                </Link>
                            </Button>
                        </div>
                    )}
                </div>
            ) : (
                <Card className="border-t shadow-sm">
                    <CardHeader className="py-3 px-4 border-b bg-muted/30">
                        <CardTitle className="text-sm font-semibold">All Staff ({data?.count ?? 0})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Staff Member</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Department</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Position</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Type</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {staff.length > 0 ? staff.map((emp) => (
                                    <TableRow
                                        key={emp.id}
                                        className="group hover:bg-muted/50 transition-colors border-b border-border cursor-pointer"
                                        onClick={() => router.push(`/hr/staff/${emp.id}`)}
                                    >
                                        <TableCell className="px-3 py-1.5">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={emp.profile_picture ?? undefined} />
                                                    <AvatarFallback className="text-xs">
                                                        {emp.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="text-sm font-medium text-foreground">{emp.full_name}</div>
                                                    <div className="text-xs text-muted-foreground">{emp.email}</div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-sm">{emp.department_name || "—"}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm">{emp.position_title || "—"}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm capitalize">{emp.employment_type?.replace("_", " ")}</TableCell>
                                        <TableCell className="px-4 py-2">
                                            <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 capitalize border shadow-none", getStatusColor(emp.employment_status))}>
                                                {emp.employment_status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-right">
                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); router.push(`/hr/staff/${emp.id}`); }}>
                                                <span className="sr-only">View</span>→
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center">
                                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                <Users className="h-8 w-8 mb-2 opacity-50" />
                                                <p className="text-sm">No staff found</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
