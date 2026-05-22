"use client";

import { useQuery } from "@tanstack/react-query";
import { techniciansApi, Technician } from "@/lib/api/technicians";
import { branchesApi } from "@/lib/api/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Filter, Grid, List as ListIcon, Users, CheckCircle2, Clock3, WifiOff } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const statusOptions = [
    { value: undefined, label: "All Status" },
    { value: "available", label: "Available" },
    { value: "busy", label: "Busy" },
    { value: "break", label: "On Break" },
    { value: "offline", label: "Offline" },
] as const;

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
    const [branchFilter, setBranchFilter] = useState<string>("all");

    const { data: branchesData } = useQuery({
        queryKey: ["branches", "active"],
        queryFn: () => branchesApi.list({ is_active: true }),
    });
    const branches = branchesData ?? [];

    const { data, isLoading } = useQuery({
        queryKey: ["technicians", searchQuery, statusFilter, branchFilter],
        queryFn: () => techniciansApi.list({
            search: searchQuery,
            status: statusFilter,
            branch: branchFilter !== "all" ? Number(branchFilter) : undefined,
        }),
    });

    const technicians = data?.results ?? [];
    const statusLabel = statusOptions.find((option) => option.value === statusFilter)?.label ?? "All Status";
    const stats = {
        total: technicians.length,
        available: technicians.filter((tech) => tech.current_status === "available").length,
        active: technicians.filter((tech) => ["busy", "break"].includes(tech.current_status)).length,
        offline: technicians.filter((tech) => tech.current_status === "offline").length,
    };

    const getStatusColor = (status: Technician['current_status']) => {
        switch (status) {
            case "available":
                return "border-success/25 bg-success/10 text-success";
            case "busy":
                return "border-primary/20 bg-primary/10 text-primary";
            case "break":
                return "border-warning/25 bg-warning/10 text-warning-foreground";
            case "offline":
                return "border-border bg-muted text-muted-foreground";
            default:
                return "border-border bg-muted text-muted-foreground";
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
            />

            {!isLoading && technicians.length > 0 && (
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <Card>
                        <CardContent className="flex items-center justify-between p-3">
                            <div className="space-y-1">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total</p>
                                <p className="text-lg font-semibold text-foreground">{stats.total}</p>
                            </div>
                            <div className="rounded-md border bg-muted/50 p-2 text-muted-foreground">
                                <Users className="h-4 w-4" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="flex items-center justify-between p-3">
                            <div className="space-y-1">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Available</p>
                                <p className="text-lg font-semibold text-success">{stats.available}</p>
                            </div>
                            <div className="rounded-md border border-success/20 bg-success/10 p-2 text-success">
                                <CheckCircle2 className="h-4 w-4" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="flex items-center justify-between p-3">
                            <div className="space-y-1">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Assigned</p>
                                <p className="text-lg font-semibold text-primary">{stats.active}</p>
                            </div>
                            <div className="rounded-md border border-primary/20 bg-primary/10 p-2 text-primary">
                                <Clock3 className="h-4 w-4" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="flex items-center justify-between p-3">
                            <div className="space-y-1">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Offline</p>
                                <p className="text-lg font-semibold text-muted-foreground">{stats.offline}</p>
                            </div>
                            <div className="rounded-md border bg-muted/50 p-2 text-muted-foreground">
                                <WifiOff className="h-4 w-4" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <Card className="border border-border bg-card">
                <CardContent className="p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="relative flex-1 lg:max-w-sm">
                            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <Input
                                placeholder="Search technicians..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-9 w-full bg-background pl-9 text-sm"
                            />
                        </div>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-9">
                                    <Filter className="h-4 w-4 mr-2" />
                                    {statusLabel}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {statusOptions.map((option) => (
                                    <DropdownMenuItem key={option.label} onClick={() => setStatusFilter(option.value)}>
                                        {option.label}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Select value={branchFilter} onValueChange={setBranchFilter}>
                            <SelectTrigger className="h-9 w-[180px] bg-background text-sm">
                                <SelectValue placeholder="All Branches" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Branches</SelectItem>
                                {branches.map((branch) => (
                                    <SelectItem key={branch.id} value={String(branch.id)}>
                                        {branch.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
                            {(searchQuery || statusFilter || branchFilter !== "all") && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs text-muted-foreground"
                                    onClick={() => {
                                        setSearchQuery("");
                                        setStatusFilter(undefined);
                                        setBranchFilter("all");
                                    }}
                                >
                                    Clear filters
                                </Button>
                            )}
                            <p className="text-xs text-muted-foreground">
                                {technicians.length} technician{technicians.length === 1 ? "" : "s"}
                            </p>
                            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
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
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-40 animate-pulse rounded-lg bg-border" />
                    ))}
                </div>
            ) : (
                <>
                    {viewMode === "grid" ? (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {technicians.length > 0 ? (
                                technicians.map((tech) => (
                                    <Card
                                        key={tech.id}
                                        className="cursor-pointer border border-border transition-colors hover:border-primary/20 hover:bg-muted/20"
                                        onClick={() => router.push(`/technicians/${tech.id}`)}
                                    >
                                        <CardContent className="p-3">
                                            <div className="mb-3 flex items-start justify-between gap-3">
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <Avatar className="h-10 w-10 border">
                                                        <AvatarImage src={tech.user_details?.profile_picture} />
                                                        <AvatarFallback className="text-xs">{tech.user_details?.first_name?.[0]}{tech.user_details?.last_name?.[0]}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="min-w-0 flex-1">
                                                        <h3 className="text-sm font-semibold text-foreground truncate">
                                                            {tech.user_details?.full_name || `${tech.user_details?.first_name} ${tech.user_details?.last_name}`}
                                                        </h3>
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {tech.user_details?.role?.replace("_", " ") || "Technician"}
                                                            {tech.user_details?.branch_name ? ` • ${tech.user_details.branch_name}` : ""}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className={cn("shrink-0 border px-2 py-0.5 text-[10px] capitalize", getStatusColor(tech.current_status))}>
                                                    {tech.current_status}
                                                </Badge>
                                            </div>

                                            <div className="space-y-3">
                                                <div className="rounded-md border bg-muted/20 px-3 py-2">
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {tech.user_details?.email || "No email provided"}
                                                    </p>
                                                </div>

                                                {tech.skills.length > 0 && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {tech.skills.slice(0, 3).map((skill) => (
                                                            <Badge key={skill.id} variant="secondary" className="px-2 py-0.5 text-[10px]">
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

                                                <div className="grid grid-cols-2 gap-3 border-t border-border pt-2">
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Experience</p>
                                                        <p className="text-sm font-medium text-foreground">{tech.years_of_experience} yrs</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Profile</p>
                                                        <p className="text-sm font-medium text-primary">Open details</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            ) : (
                                <div className="col-span-full flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 p-6 text-center">
                                    <div className="mb-3 rounded-md border bg-background p-2">
                                        <Search className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <h3 className="text-base font-semibold">No technicians found</h3>
                                    <p className="mt-2 mb-6 max-w-sm text-sm text-muted-foreground">
                                        {searchQuery || statusFilter
                                            ? "Try adjusting your search or filters to find what you're looking for."
                                            : "Get started by adding your first field service technician to the system."}
                                    </p>
                                    <Button asChild>
                                        <Link href="/hr/staff/new">
                                            <Plus className="h-4 w-4 mr-2" />
                                            Add Technician
                                        </Link>
                                    </Button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <Card>
                            <CardHeader className="border-b bg-muted/10 px-4 py-3">
                                <CardTitle className="text-sm font-semibold">All Technicians ({technicians.length})</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                                            <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Technician</TableHead>
                                            <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Contact</TableHead>
                                            <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Skills</TableHead>
                                            <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Experience</TableHead>
                                            <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
                                            <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {technicians.length > 0 ? (
                                            technicians.map((tech) => (
                                                <TableRow
                                                    key={tech.id}
                                                    className="cursor-pointer border-b border-border transition-colors hover:bg-muted/20"
                                                    onClick={() => router.push(`/technicians/${tech.id}`)}
                                                >
                                                    <TableCell className="px-4 py-2.5">
                                                        <div className="flex items-center gap-3">
                                                            <Avatar className="h-8 w-8 border">
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
                                                    <TableCell className="px-4 py-2.5">
                                                        <div className="text-xs text-muted-foreground">
                                                            <div>{tech.user_details?.email}</div>
                                                            <div className="capitalize">
                                                                {tech.user_details?.role?.replace("_", " ") || "Technician"}
                                                                {tech.user_details?.branch_name ? ` • ${tech.user_details.branch_name}` : ""}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2.5">
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
                                                    <TableCell className="px-4 py-2.5 text-sm text-foreground">
                                                        {tech.years_of_experience} yrs
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2.5">
                                                        <Badge variant="outline" className={cn("border px-2 py-0.5 text-[10px] font-medium capitalize", getStatusColor(tech.current_status))}>
                                                            {tech.current_status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2.5 text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                router.push(`/technicians/${tech.id}`);
                                                            }}
                                                        >
                                                            Open
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
