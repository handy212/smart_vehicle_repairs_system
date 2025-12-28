"use client";

import { useQuery } from "@tanstack/react-query";
import { roadsideApi, RoadsideRequest } from "@/lib/api/roadside";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
} from "lucide-react";
import { useState } from "react";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import Link from "next/link";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

export default function RoadsidePage() {
    const router = useRouter();
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("all");
    const debouncedSearch = useDebounce(search, 500);

    const { data: requestsData, isLoading } = useQuery({
        queryKey: ["roadside", debouncedSearch, statusFilter, serviceTypeFilter],
        queryFn: () =>
            roadsideApi.list({
                status: statusFilter === "all" ? undefined : statusFilter,
                service_type: serviceTypeFilter === "all" ? undefined : serviceTypeFilter,
                search: debouncedSearch || undefined,
                ordering: "-requested_at",
            }),
    });

    const requests = requestsData?.results || [];

    // Statistics
    const totalRequests = requests.length;
    const activeRequests = requests.filter((r) =>
        ["requested", "dispatched", "en_route", "on_site", "in_progress"].includes(r.status)
    ).length;
    const completedRequests = requests.filter((r) => r.status === "completed").length;
    const coveredBySubscription = requests.filter((r) => r.is_covered_by_subscription).length;

    const hasActiveFilters = search || statusFilter !== "all" || serviceTypeFilter !== "all";

    const clearFilters = () => {
        setSearch("");
        setStatusFilter("all");
        setServiceTypeFilter("all");
    };

    const getStatusVariant = (status: string): "default" | "success" | "warning" | "info" | "secondary" | "danger" => {
        switch (status) {
            case "completed":
                return "success";
            case "requested":
                return "warning";
            case "dispatched":
            case "en_route":
            case "on_site":
            case "in_progress":
                return "info";
            case "cancelled":
                return "secondary";
            case "failed":
                return "danger";
            default:
                return "default";
        }
    };

    if (isLoading && !requestsData) {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <div className="h-7 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1"></div>
                        <div className="h-4 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                    </div>
                </div>
                <Card className="border-t shadow-sm">
                    <CardContent className="pt-6">
                        <TableSkeleton rows={8} columns={7} />
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Compact Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Roadside Assistance</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Manage roadside breakdown requests
                    </p>
                </div>
                <div className="flex gap-2">
                    <PermissionGuard permission="manage_roadside">
                        <Link href="/roadside/new">
                            <Button size="sm" className="h-9">
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                New Request
                            </Button>
                        </Link>
                    </PermissionGuard>
                </div>
            </div>

            {/* Compact Statistics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="shadow-none border-none bg-gray-50/50 dark:bg-gray-800/50">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</p>
                            <Truck className="h-4 w-4 text-gray-400" />
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalRequests}</p>
                    </CardContent>
                </Card>
                <Card className="shadow-none border-none bg-gray-50/50 dark:bg-gray-800/50">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</p>
                            <Clock className="h-4 w-4 text-blue-500" />
                        </div>
                        <p className="text-2xl font-bold text-blue-600">{activeRequests}</p>
                    </CardContent>
                </Card>
                <Card className="shadow-none border-none bg-gray-50/50 dark:bg-gray-800/50">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Completed</p>
                            <ShieldCheck className="h-4 w-4 text-green-500" />
                        </div>
                        <p className="text-2xl font-bold text-green-600">{completedRequests}</p>
                    </CardContent>
                </Card>
                <Card className="shadow-none border-none bg-gray-50/50 dark:bg-gray-800/50">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Subscribed</p>
                            <ShieldCheck className="h-4 w-4 text-emerald-500" />
                        </div>
                        <p className="text-2xl font-bold text-emerald-600">{coveredBySubscription}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Bar */}
            <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
                <CardContent className="p-3">
                    <div className="flex gap-3 items-center flex-wrap">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search requests..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 h-9 text-sm bg-white dark:bg-gray-900 w-64 focus:w-80 transition-all duration-300"
                            />
                        </div>
                        <Select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="h-9 text-sm w-32 bg-white dark:bg-gray-900"
                        >
                            <option value="all">All Status</option>
                            <option value="requested">Requested</option>
                            <option value="dispatched">Dispatched</option>
                            <option value="en_route">En Route</option>
                            <option value="on_site">On Site</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="failed">Failed</option>
                        </Select>
                        <Select
                            value={serviceTypeFilter}
                            onChange={(e) => setServiceTypeFilter(e.target.value)}
                            className="h-9 text-sm w-40 bg-white dark:bg-gray-900"
                        >
                            <option value="all">All Services</option>
                            <option value="towing">Towing</option>
                            <option value="battery_boost">Battery Boost</option>
                            <option value="flat_tyre">Flat Tyre</option>
                            <option value="key_lockout">Key Lockout</option>
                            <option value="emergency_fuel">Emergency Fuel</option>
                            <option value="extrication">Extrication</option>
                            <option value="mechanical_first_aid">Mechanical/Electrical</option>
                            <option value="other">Other</option>
                        </Select>
                        {hasActiveFilters && (
                            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20">
                                <X className="h-3.5 w-3.5 mr-1" />
                                Clear
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Data Table */}
            <Card className="border-t shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-gray-50/30 dark:bg-gray-800/30">
                    <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300">Roadside Requests</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-gray-50/50 hover:bg-gray-50/50 dark:bg-gray-900/50">
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Request #</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Customer</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Service</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Location</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Requested</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Status</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {requests.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                        No roadside requests found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                requests.map((request) => (
                                    <TableRow
                                        key={request.id}
                                        className="group hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors border-b border-gray-100 dark:border-gray-800 cursor-pointer"
                                        onDoubleClick={() => router.push(`/roadside/${request.id}`)}
                                    >
                                        <TableCell className="px-4 py-2">
                                            <div className="flex flex-col gap-1">
                                                <span className="font-mono text-xs font-medium text-gray-700 dark:text-gray-300">{request.request_number}</span>
                                                {request.is_covered_by_subscription && (
                                                    <Badge variant="success" className="text-[10px] px-1.5 py-0 h-4 w-fit">
                                                        <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                                                        AA
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-2">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{request.customer_name || `Customer #${request.customer}`}</span>
                                                {request.customer_phone && (
                                                    <span className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                                        <Phone className="h-3 w-3" />
                                                        {request.customer_phone}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-2">
                                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 font-medium">{request.service_type_display}</Badge>
                                            {request.vehicle_display && (
                                                <div className="text-xs text-gray-500 mt-1">{request.vehicle_display}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="px-4 py-2">
                                            <div className="flex items-start gap-1.5 max-w-[180px]">
                                                <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                                                <span className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{request.breakdown_location}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-2">
                                            <div className="text-xs">
                                                <div className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                                                    <Clock className="h-3 w-3" />
                                                    {format(new Date(request.requested_at), "MMM dd, yyyy")}
                                                </div>
                                                <div className="text-gray-500 mt-0.5">
                                                    {format(new Date(request.requested_at), "h:mm a")}
                                                </div>
                                                {request.assigned_technician_name && (
                                                    <div className="text-blue-600 mt-1 flex items-center gap-1">
                                                        <User className="h-3 w-3" />
                                                        {request.assigned_technician_name}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-2">
                                            <Badge variant={getStatusVariant(request.status)} className="text-[10px] px-2 py-0.5 font-medium">
                                                {request.status_display}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-right">
                                            <Link href={`/roadside/${request.id}`}>
                                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>

                    {requestsData && requestsData.count > 0 && (
                        <div className="p-4 border-t border-gray-100 dark:border-gray-800 text-xs text-muted-foreground">
                            Showing {requests.length} of {requestsData.count} requests
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
