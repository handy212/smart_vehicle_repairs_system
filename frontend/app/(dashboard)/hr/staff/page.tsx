"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, StaffListItem } from "@/lib/api/hr";
import { branchesApi } from "@/lib/api/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Plus, Search, Filter, Grid, List as ListIcon, Users, Trash2, RefreshCw, Loader2, Network,
} from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard"
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import {
    Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { sortOrderingParam, toggleSortConfig } from "@/lib/utils/table-sort";

export default function StaffPage() {
    return (
        <PermissionPageGuard permission="view_staff">
            <DynamicPageTitle title="Staff" />
            <StaffContent />
        </PermissionPageGuard>
    );
}

function StaffContent() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [viewMode, setViewMode] = useState<"grid" | "list">("list");
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [branchFilter, setBranchFilter] = useState<string>("all");
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

    const handleSort = (field: string) => {
        setSortConfig((current) => toggleSortConfig(current, field));
    };

    const { data: branchesData } = useQuery({
        queryKey: ["branches", "active"],
        queryFn: () => branchesApi.list({ is_active: true }),
    });
    const branches = branchesData ?? [];

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "staff", searchQuery, statusFilter, branchFilter, sortConfig],
        queryFn: async () => {
            const res = await hrApi.staff.list({
                search: searchQuery,
                employment_status: statusFilter,
                branch: branchFilter !== "all" ? Number(branchFilter) : undefined,
                ordering: sortOrderingParam(sortConfig) || "user__last_name",
            });
            return res.data;
        },
    });

    const bulkStatusMut = useMutation({
        mutationFn: ({ ids, status }: { ids: number[]; status: string }) =>
            hrApi.staff.bulkUpdateStatus(ids, status),
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ["hr", "staff"] });
            toast.success(`Updated ${vars.ids.length} staff member(s) to "${vars.status}"`);
            setSelectedIds(new Set());
        },
        onError: () => toast.error("Failed to update staff status"),
    });

    const bulkDeleteMut = useMutation({
        mutationFn: (ids: number[]) => hrApi.staff.bulkDelete(ids),
        onSuccess: (_, ids) => {
            queryClient.invalidateQueries({ queryKey: ["hr", "staff"] });
            toast.success(`Deleted ${ids.length} staff member(s)`);
            setSelectedIds(new Set());
            setShowDeleteConfirm(false);
        },
        onError: () => toast.error("Failed to delete staff members"),
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case "active": return "bg-success/10 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800";
            case "probation": return "bg-warning/10 text-amber-700 border-warning/20 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800";
            case "suspended": return "bg-destructive/10 text-destructive border-destructive/20 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800";
            case "terminated": return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700";
            case "resigned": return "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700";
            default: return "";
        }
    };

    const getRoleLabel = (role?: string) => {
        if (!role) return "Staff";
        return role.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    };

    const staff: StaffListItem[] = data?.results ?? [];
    const activeCount = staff.filter(e => e.employment_status === "active").length;
    const probationCount = staff.filter(e => e.employment_status === "probation").length;

    const isAllSelected = staff.length > 0 && selectedIds.size === staff.length;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const isSomeSelected = selectedIds.size > 0 && selectedIds.size < staff.length;

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(staff.map(e => e.id)));
        }
    };

    const toggleSelect = (id: number) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

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
                    <div className="flex gap-2">
                        <PermissionGuard permission="view_staff">
                            <Button variant="secondary" size="sm" asChild>
                                <Link href="/hr/staff/org-chart">
                                    <Network className="h-4 w-4 mr-2" />
                                    Org Chart
                                </Link>
                            </Button>
                        </PermissionGuard>
                        <PermissionGuard permission="manage_staff">
                            <Button size="sm" asChild>
                                <Link href="/hr/staff/new">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Staff Member
                                </Link>
                            </Button>
                        </PermissionGuard>
                    </div>
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
                            <span className="text-lg font-bold text-success">{activeCount}</span>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border bg-card">
                        <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Probation</span>
                            <span className="text-lg font-bold text-warning">{probationCount}</span>
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
                        <Select value={branchFilter} onValueChange={setBranchFilter}>
                            <SelectTrigger className="h-8 w-[180px] bg-card text-sm">
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
                                Clear
                            </Button>
                        )}
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

            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
                <Card className="border-primary/30 bg-primary/5 shadow-sm">
                    <CardContent className="p-3 flex items-center gap-3">
                        <span className="text-sm font-medium text-foreground">
                            {selectedIds.size} selected
                        </span>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-7" disabled={bulkStatusMut.isPending}>
                                    {bulkStatusMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                                    Change Status
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuLabel>Set Status</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {["active", "probation", "suspended", "terminated", "resigned"].map(s => (
                                    <DropdownMenuItem key={s} className="capitalize" onClick={() => bulkStatusMut.mutate({ ids: Array.from(selectedIds), status: s })}>
                                        {s}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="destructive" size="sm" className="h-7" onClick={() => setShowDeleteConfirm(true)}>
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Delete Selected
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 ml-auto" onClick={() => setSelectedIds(new Set())}>
                            Clear Selection
                        </Button>
                    </CardContent>
                </Card>
            )}

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
                            className={cn(
                                "shadow-none border hover:shadow-md transition-shadow cursor-pointer",
                                selectedIds.has(emp.id) && "ring-2 ring-primary border-primary/50"
                            )}
                            onClick={() => router.push(`/hr/staff/${emp.id}`)}
                        >
                            <CardContent className="p-3">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex gap-3 items-center">
                                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                                checked={selectedIds.has(emp.id)}
                                                onCheckedChange={() => toggleSelect(emp.id)}
                                                className="absolute -left-1 -top-1 z-10"
                                            />
                                            <Avatar className="h-10 w-10 border-2 border-white dark:border-gray-900 shadow-sm ml-4">
                                                <AvatarImage src={emp.profile_picture ?? undefined} />
                                                <AvatarFallback className="text-xs">
                                                    {emp.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
                                                </AvatarFallback>
                                            </Avatar>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-semibold text-foreground truncate">{emp.full_name}</h3>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {getRoleLabel(emp.role)}{emp.position_title ? ` / ${emp.position_title}` : ""}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5 flex-wrap justify-end">
                                        {emp.technician_id && (
                                            <Badge variant="secondary" className="bg-warning/10 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800 text-[9px] px-1.5 py-0">
                                                Technician
                                            </Badge>
                                        )}
                                        <Badge variant="outline" className={cn("capitalize text-[10px] px-2 py-0.5 border shadow-none", getStatusColor(emp.employment_status))}>
                                            {emp.employment_status}
                                        </Badge>
                                        {emp.is_account_active === false && (
                                            <Badge variant="danger" className="text-[9px] px-1.5 py-0">
                                                Login Off
                                            </Badge>
                                        )}
                                    </div>
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
                                <Users className="h-8 w-8 text-primary" />
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
                                    <TableHead className="px-3 h-10 w-10">
                                        <Checkbox
                                            checked={isAllSelected}
                                            onCheckedChange={toggleSelectAll}
                                        />
                                    </TableHead>
                                    <SortableHeader
                                        field="user__last_name"
                                        sortConfig={sortConfig}
                                        onSort={handleSort}
                                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                                    >
                                        Staff Member
                                    </SortableHeader>
                                    <SortableHeader
                                        field="department__name"
                                        sortConfig={sortConfig}
                                        onSort={handleSort}
                                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                                    >
                                        Department
                                    </SortableHeader>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Role</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Branch</TableHead>
                                    <SortableHeader
                                        field="position__title"
                                        sortConfig={sortConfig}
                                        onSort={handleSort}
                                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                                    >
                                        Position
                                    </SortableHeader>
                                    <SortableHeader
                                        field="employment_status"
                                        sortConfig={sortConfig}
                                        onSort={handleSort}
                                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                                    >
                                        Status
                                    </SortableHeader>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {staff.length > 0 ? staff.map((emp) => (
                                    <TableRow
                                        key={emp.id}
                                        className={cn(
                                            "group hover:bg-muted/50 transition-colors border-b border-border cursor-pointer",
                                            selectedIds.has(emp.id) && "bg-primary/5"
                                        )}
                                        onClick={() => router.push(`/hr/staff/${emp.id}`)}
                                    >
                                        <TableCell className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                                checked={selectedIds.has(emp.id)}
                                                onCheckedChange={() => toggleSelect(emp.id)}
                                            />
                                        </TableCell>
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
                                        <TableCell className="px-4 py-2 text-sm">{getRoleLabel(emp.role)}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm">{emp.branch_name || "—"}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm">{emp.position_title || "—"}</TableCell>
                                        <TableCell className="px-4 py-2">
                                            <div className="flex gap-2">
                                                {emp.technician_id && (
                                                    <Badge variant="secondary" className="bg-warning/10 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800 text-[9px] px-1.5 py-0">
                                                        Tech
                                                    </Badge>
                                                )}
                                                <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 capitalize border shadow-none", getStatusColor(emp.employment_status))}>
                                                    {emp.employment_status}
                                                </Badge>
                                                {emp.is_account_active === false && (
                                                    <Badge variant="danger" className="text-[10px] px-2 py-0.5">
                                                        Login Off
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-right">
                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); router.push(`/hr/staff/${emp.id}`); }}>
                                                <span className="sr-only">View</span>→
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-32 text-center">
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

            {/* Bulk Delete Confirmation */}
            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {selectedIds.size} staff member(s)?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the selected staff members and their user accounts. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => bulkDeleteMut.mutate(Array.from(selectedIds))}
                            disabled={bulkDeleteMut.isPending}
                        >
                            {bulkDeleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Delete {selectedIds.size} Staff
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
