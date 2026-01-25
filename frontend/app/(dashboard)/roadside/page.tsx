"use client";

import { useQuery } from "@tanstack/react-query";
import { roadsideApi } from "@/lib/api/roadside";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Search,
    Plus,
    Eye,
    MapPin,
    Truck,
    Clock,
    User,
    Phone,
    ShieldCheck,
    X,
    Download,
    MoreVertical,
    ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import Link from "next/link";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/useToast";

export default function RoadsidePage() {
    const router = useRouter();
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search, 500);
    const [page, setPage] = useState(1);
    const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

    const { toast } = useToast();

    // Advanced Filters Configuration
    const filterOptions: FilterOption[] = [
        {
            key: "status",
            label: "Status",
            type: "select",
            options: [
                { value: "requested", label: "Requested" },
                { value: "dispatched", label: "Dispatched" },
                { value: "en_route", label: "En Route" },
                { value: "on_site", label: "On Site" },
                { value: "in_progress", label: "In Progress" },
                { value: "completed", label: "Completed" },
                { value: "cancelled", label: "Cancelled" },
                { value: "failed", label: "Failed" },
            ],
        },
        {
            key: "service_type",
            label: "Service Type",
            type: "select",
            options: [
                { value: "towing", label: "Towing" },
                { value: "battery_boost", label: "Battery Boost" },
                { value: "flat_tyre", label: "Flat Tyre" },
                { value: "key_lockout", label: "Key Lockout" },
                { value: "emergency_fuel", label: "Emergency Fuel" },
                { value: "extrication", label: "Extrication" },
                { value: "mechanical_first_aid", label: "Mechanical/Electrical" },
                { value: "other", label: "Other" },
            ],
        },
        {
            key: "is_covered_by_subscription",
            label: "Subscription",
            type: "select",
            options: [
                { value: "true", label: "Covered" },
                { value: "false", label: "Not Covered" },
            ],
        },
    ];

    const refinedQuickFilters: QuickFilter[] = [
        {
            label: "New Requests",
            value: "new",
            filters: { status: "requested" }
        },
        {
            label: "InProgress",
            value: "inprogress",
            filters: { status: "in_progress" }
        }
    ];

    const handleSort = (field: string) => {
        setSortConfig((current) => {
            if (current?.field === field) {
                if (current.direction === "asc") {
                    return { field, direction: "desc" };
                } else if (current.direction === "desc") {
                    return null;
                }
            }
            return { field, direction: "asc" };
        });
        setPage(1);
    };

    const { data: stats } = useQuery({
        queryKey: ["roadside-stats"],
        queryFn: () => roadsideApi.dashboardStats(),
    });

    const { data: requestsData, isLoading, error } = useQuery({
        queryKey: ["roadside", page, debouncedSearch, advancedFilters, sortConfig],
        queryFn: () => {
            const ordering = sortConfig
                ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
                : "-requested_at";
            return roadsideApi.list({
                page,
                search: debouncedSearch || undefined,
                status: advancedFilters.status || undefined,
                service_type: advancedFilters.service_type || undefined,
                is_covered_by_subscription: advancedFilters.is_covered_by_subscription === 'true' ? true : advancedFilters.is_covered_by_subscription === 'false' ? false : undefined,
                ordering,
            });
        },
    });

    const requests = requestsData?.results || [];

    const getStatusVariant = (status: string): "default" | "success" | "warning" | "info" | "secondary" | "danger" => {
        switch (status) {
            case "completed": return "success";
            case "requested": return "warning";
            case "dispatched":
            case "en_route":
            case "on_site":
            case "in_progress": return "info";
            case "cancelled": return "secondary";
            case "failed": return "danger";
            default: return "default";
        }
    };

    const handleExport = () => {
        toast({ title: "Export", description: "Export functionality coming soon" });
    };

    // Stats Grid Component
    const StatsGrid = () => (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="shadow-sm border bg-white dark:bg-gray-800">
                <CardContent className="p-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats?.total_requests || 0}</span>
                </CardContent>
            </Card>
            <Card className="shadow-sm border bg-white dark:bg-gray-800">
                <CardContent className="p-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</span>
                    <span className="text-lg font-bold text-primary dark:text-primary">{stats?.active_requests || 0}</span>
                </CardContent>
            </Card>
            <Card className="shadow-sm border bg-white dark:bg-gray-800">
                <CardContent className="p-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Completed</span>
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">{stats?.completed_requests || 0}</span>
                </CardContent>
            </Card>
            <Card className="shadow-sm border bg-white dark:bg-gray-800">
                <CardContent className="p-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Subscribed</span>
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats?.covered_by_subscription || 0}</span>
                </CardContent>
            </Card>
        </div>
    );

    if (error) {
        return (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
                Error loading roadside requests. Please try again.
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Header with Stats */}
            <div className="space-y-4">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Roadside Assistance</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Manage roadside breakdown requests.
                    </p>
                </div>
                <StatsGrid />
            </div>

            {/* Unified Toolbar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-gray-900/50 p-1 rounded-lg">
                <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 md:flex-none md:w-64">
                        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                            type="text"
                            placeholder="Search requests..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                            className="pl-9 h-9 text-sm bg-gray-50 dark:bg-gray-800 border-none focus:ring-1 transition-all"
                        />
                    </div>

                    {/* Advanced Filters */}
                    <AdvancedFilters
                        filters={filterOptions}
                        quickFilters={refinedQuickFilters}
                        activeFilters={advancedFilters}
                        onFiltersChange={(filters) => {
                            setAdvancedFilters(filters);
                            setPage(1);
                        }}
                        onClear={() => {
                            setAdvancedFilters({});
                            setPage(1);
                        }}
                        title="Filter"
                    />

                    {/* Clear Filters (Icon only) */}
                    {(search || Object.keys(advancedFilters).length > 0) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSearch("");
                                setAdvancedFilters({});
                                setPage(1);
                            }}
                            className="h-9 w-9 p-0 text-gray-500 hover:text-red-600"
                            title="Clear all filters"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    )}

                    {/* Active Filter Badges */}
                    <div className="hidden lg:flex flex-wrap items-center gap-1.5 ml-2">
                        {Object.entries(advancedFilters).map(([key, value]) => {
                            if (!value || (typeof value === 'string' && value === '')) return null;
                            const filter = filterOptions.find((f) => f.key === key);
                            if (!filter) return null;
                            return (
                                <Badge key={key} variant="secondary" className="text-[10px] px-1.5 h-6 flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-normal">
                                    {filter.label}: {String(value)}
                                    <X
                                        className="w-3 h-3 cursor-pointer hover:text-red-500"
                                        onClick={() => {
                                            const newFilters = { ...advancedFilters };
                                            delete newFilters[key];
                                            setAdvancedFilters(newFilters);
                                            setPage(1);
                                        }}
                                    />
                                </Badge>
                            );
                        })}
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9">
                                Actions
                                <ChevronDown className="w-3.5 h-3.5 ml-2" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <PermissionGuard permission="export_roadside">
                                <DropdownMenuItem onClick={handleExport}>
                                    <Download className="w-4 h-4 mr-2" />
                                    Export CSV
                                </DropdownMenuItem>
                            </PermissionGuard>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <PermissionGuard permission="manage_roadside">
                        <Link href="/roadside/new">
                            <Button size="sm" className="h-9 bg-primary hover:bg-primary/90 text-white shadow-sm">
                                <Plus className="w-4 h-4 mr-2" />
                                New Request
                            </Button>
                        </Link>
                    </PermissionGuard>
                </div>
            </div>

            {/* Data Table */}
            <Card className="border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-4">
                            <TableSkeleton rows={8} columns={7} />
                        </div>
                    ) : requests && requests.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-gray-50/50 hover:bg-gray-50/50 border-b border-gray-100 dark:border-gray-800">
                                        <SortableHeader
                                            field="request_number"
                                            sortConfig={sortConfig}
                                            onSort={handleSort}
                                            className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                                        >
                                            Request #
                                        </SortableHeader>
                                        <SortableHeader
                                            field="customer__user__last_name"
                                            sortConfig={sortConfig}
                                            onSort={handleSort}
                                            className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                                        >
                                            Customer
                                        </SortableHeader>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Service</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Location</TableHead>
                                        <SortableHeader
                                            field="requested_at"
                                            sortConfig={sortConfig}
                                            onSort={handleSort}
                                            className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                                        >
                                            Requested
                                        </SortableHeader>
                                        <SortableHeader
                                            field="status"
                                            sortConfig={sortConfig}
                                            onSort={handleSort}
                                            className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                                        >
                                            Status
                                        </SortableHeader>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {requests.map((request) => (
                                        <TableRow
                                            key={request.id}
                                            className="group hover:bg-gray-50/80 transition-colors border-b border-gray-100 dark:border-gray-800 cursor-pointer"
                                            onDoubleClick={() => router.push(`/roadside/${request.id}`)}
                                        >
                                            <TableCell className="px-4 py-2">
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-mono text-xs font-medium text-primary dark:text-primary">{request.request_number}</span>
                                                    {request.is_covered_by_subscription && (
                                                        <div className="flex items-center text-[10px] text-emerald-600 font-medium">
                                                            <ShieldCheck className="h-3 w-3 mr-0.5" />
                                                            Covered
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100">{request.customer_name || `Customer #${request.customer}`}</span>
                                                    {request.customer_phone && (
                                                        <span className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                                                            <Phone className="h-2.5 w-2.5" />
                                                            {request.customer_phone}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal border-gray-200 text-gray-600 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400">
                                                    {request.service_type_display}
                                                </Badge>
                                                {request.vehicle_display && (
                                                    <div className="text-[10px] text-gray-500 mt-1 truncate max-w-[120px]" title={request.vehicle_display}>{request.vehicle_display}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <div className="flex items-start gap-1.5 max-w-[180px]">
                                                    <MapPin className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />
                                                    <span className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{request.breakdown_location}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <div className="text-xs">
                                                    <div className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                                                        <Clock className="h-3 w-3 text-gray-400" />
                                                        {format(new Date(request.requested_at), "MMM dd")}
                                                    </div>
                                                    <div className="text-gray-500 pl-4 text-[10px]">
                                                        {format(new Date(request.requested_at), "h:mm a")}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <Badge variant={getStatusVariant(request.status)} className="text-[10px] px-2 py-0.5 h-5 capitalize font-medium border shadow-none bg-transparent">
                                                    {request.status_display || request.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 w-6 p-0 dark:hover:bg-gray-700 data-[state=open]:bg-gray-100 dark:data-[state=open]:bg-gray-800"
                                                        >
                                                            <span className="sr-only">Open menu</span>
                                                            <MoreVertical className="w-3.5 h-3.5 text-gray-500" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-48">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuItem onClick={() => router.push(`/roadside/${request.id}`)}>
                                                            <Eye className="mr-2 h-4 w-4" />
                                                            View Details
                                                        </DropdownMenuItem>
                                                        {request.status === 'requested' && (
                                                            <PermissionGuard permission="manage_roadside">
                                                                <DropdownMenuItem onClick={() => router.push(`/roadside/${request.id}?action=dispatch`)}>
                                                                    <Truck className="mr-2 h-4 w-4" />
                                                                    Dispatch
                                                                </DropdownMenuItem>
                                                            </PermissionGuard>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <Truck className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                            <p className="text-gray-500 dark:text-gray-400">No roadside requests found.</p>
                            <Link href="/roadside/new">
                                <Button className="mt-4" variant="secondary">
                                    <Plus className="w-4 h-4 mr-2" />
                                    New Request
                                </Button>
                            </Link>
                        </div>
                    )}

                    {/* Pagination */}
                    {requestsData && requestsData.count > 0 && (
                        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                Showing page {page} of {Math.ceil(requestsData.count / 10)}
                            </div>
                            <div className="flex space-x-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={!requestsData.previous}
                                    className="h-8 text-xs"
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => p + 1)}
                                    disabled={!requestsData.next}
                                    className="h-8 text-xs"
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
