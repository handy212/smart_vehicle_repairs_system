"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { roadsideApi, RoadsideRequest } from "@/lib/api/roadside";
import { adminApi } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Wrench, MapPin, Clock, CheckCircle, XCircle,
    AlertCircle, Truck, User as UserIcon, Phone,
    Search, MoreHorizontal, Navigation, Check, X, Info, Plus
} from "lucide-react";
import { format } from "date-fns";
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import Link from "next/link";

export default function RoadsideManagementPage() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // State for filtering and searching
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search, 500);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("all");
    const [page, setPage] = useState(1);

    // State for dispatching
    const [isDispatchDialogOpen, setIsDispatchDialogOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<RoadsideRequest | null>(null);
    const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>("");

    // Queries
    const { data: roadsideData, isLoading: isLoadingRequests } = useQuery({
        queryKey: ["roadside", "list", page, debouncedSearch, statusFilter, serviceTypeFilter],
        queryFn: () => roadsideApi.list({
            page,
            search: debouncedSearch,
            status: statusFilter === "all" ? undefined : statusFilter,
            service_type: serviceTypeFilter === "all" ? undefined : serviceTypeFilter,
        }),
    });

    const { data: technicians } = useQuery({
        queryKey: ["technicians", "list"],
        queryFn: () => adminApi.users.technicians(),
    });

    // Mutations
    const dispatchMutation = useMutation({
        mutationFn: ({ requestId, technicianId }: { requestId: number; technicianId: number }) =>
            roadsideApi.assignDispatch(requestId, technicianId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["roadside"] });
            toast({ title: "Success", description: "Technician dispatched successfully" });
            setIsDispatchDialogOpen(false);
            setSelectedRequest(null);
            setSelectedTechnicianId("");
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error?.response?.data?.error || "Failed to dispatch technician",
                variant: "destructive"
            });
        }
    });

    const statusUpdateMutation = useMutation({
        mutationFn: ({ requestId, action }: { requestId: number; action: string }) => {
            switch (action) {
                case 'en_route': return roadsideApi.enRoute(requestId);
                case 'arrive': return roadsideApi.arrive(requestId);
                case 'in_progress': return roadsideApi.inProgress(requestId);
                case 'complete': return roadsideApi.complete(requestId);
                case 'cancel': return roadsideApi.cancel(requestId);
                default: throw new Error("Invalid action");
            }
        },
        onSuccess: (_, { action }) => {
            queryClient.invalidateQueries({ queryKey: ["roadside"] });
            toast({
                title: "Status Updated",
                description: `Request marked as ${action.replace('_', ' ')}`
            });
        },
        onError: (error: any) => {
            toast({
                title: "Update Failed",
                description: error?.response?.data?.error || "Failed to update status",
                variant: "destructive"
            });
        }
    });

    const handleDispatch = () => {
        if (selectedRequest && selectedTechnicianId) {
            dispatchMutation.mutate({
                requestId: selectedRequest.id,
                technicianId: parseInt(selectedTechnicianId)
            });
        }
    };

    const getStatusVariant = (status: string) => {
        switch (status) {
            case "completed": return "success";
            case "requested": return "warning";
            case "dispatched": return "info";
            case "en_route": return "info";
            case "on_site": return "info";
            case "in_progress": return "info";
            case "cancelled": return "secondary";
            case "failed": return "danger";
            default: return "default";
        }
    };

    const getServiceTypeDisplay = (type: string) => {
        const types: Record<string, string> = {
            towing: "Towing Service",
            battery_boost: "Battery Boost",
            flat_tyre: "Flat Tyre Service",
            key_lockout: "Key Lock Out",
            emergency_fuel: "Emergency Fuel",
            extrication: "Extrication",
            mechanical_first_aid: "Mechanical First Aid",
            other: "Other",
        };
        return types[type] || type;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Roadside Assistance</h1>
                    <p className="text-muted-foreground mt-1">Manage breakdown requests and dispatch services.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/roadside/new">
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" /> New Request
                        </Button>
                    </Link>
                </div>
            </div>

            <Card className="border-none shadow-sm bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search requests, customers, VIN..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 bg-white dark:bg-gray-800"
                            />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">Status:</span>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="h-9 px-3 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="all">All Status</option>
                                    <option value="requested">Requested</option>
                                    <option value="dispatched">Dispatched</option>
                                    <option value="en_route">En Route</option>
                                    <option value="on_site">On Site</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="completed">Completed</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">Service:</span>
                                <select
                                    value={serviceTypeFilter}
                                    onChange={(e) => setServiceTypeFilter(e.target.value)}
                                    className="h-9 px-3 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="all">All Services</option>
                                    <option value="towing">Towing</option>
                                    <option value="battery_boost">Battery Boost</option>
                                    <option value="flat_tyre">Flat Tyre</option>
                                    <option value="key_lockout">Key Lockout</option>
                                    <option value="emergency_fuel">Emergency Fuel</option>
                                    <option value="extrication">Extrication</option>
                                    <option value="mechanical_first_aid">Mechanical First Aid</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-gray-100 dark:border-gray-800 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider">
                                    <th className="px-4 py-4">Request #</th>
                                    <th className="px-4 py-4">Customer & Vehicle</th>
                                    <th className="px-4 py-4">Status & Service</th>
                                    <th className="px-4 py-4">Location</th>
                                    <th className="px-4 py-4">Technician</th>
                                    <th className="px-4 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {isLoadingRequests ? (
                                    [1, 2, 3, 4, 5].map((i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan={6} className="px-4 py-8">
                                                <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-full"></div>
                                            </td>
                                        </tr>
                                    ))
                                ) : roadsideData?.results?.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                                            No roadside requests found matching your criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    roadsideData?.results.map((request) => (
                                        <tr key={request.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors text-sm">
                                            <td className="px-4 py-4">
                                                <div className="font-bold text-gray-900 dark:text-gray-100">
                                                    {request.request_number}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {format(new Date(request.requested_at), "MMM d, h:mm a")}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="font-medium">{request.customer_name}</div>
                                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <Truck className="h-3 w-3" />
                                                    {request.vehicle_display}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 space-y-1.5">
                                                <div className="flex flex-wrap gap-1.5">
                                                    <Badge variant={getStatusVariant(request.status)}>
                                                        {request.status_display}
                                                    </Badge>
                                                    {request.is_covered_by_subscription && (
                                                        <Badge variant="success" className="text-[10px] h-5">Covered</Badge>
                                                    )}
                                                </div>
                                                <div className="text-xs font-medium flex items-center gap-1 text-gray-700 dark:text-gray-300">
                                                    <Wrench className="h-3 w-3" />
                                                    {request.service_type_display}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="text-xs max-w-[150px] truncate" title={request.breakdown_location}>
                                                    {request.breakdown_location}
                                                </div>
                                                {request.destination && (
                                                    <div className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                                                        <Navigation className="h-2.5 w-2.5" />
                                                        To: {request.destination}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-4">
                                                {request.assigned_technician_name ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-[10px] text-blue-700 font-bold uppercase">
                                                            {request.assigned_technician_name.substring(0, 2)}
                                                        </div>
                                                        <span className="text-xs font-medium">{request.assigned_technician_name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">Unassigned</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Link href={`/roadside/${request.id}`}>
                                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="View Details">
                                                            <Info className="h-4 w-4" />
                                                        </Button>
                                                    </Link>
                                                    {request.customer_phone && (
                                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Call Customer" onClick={() => window.open(`tel:${request.customer_phone}`)}>
                                                            <Phone className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    {request.status === 'requested' && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 gap-1 border-blue-200 text-blue-600 hover:bg-blue-50"
                                                            onClick={() => {
                                                                setSelectedRequest(request);
                                                                setIsDispatchDialogOpen(true);
                                                            }}
                                                        >
                                                            <Truck className="h-3.5 w-3.5" />
                                                            Dispatch
                                                        </Button>
                                                    )}

                                                    {request.status === 'dispatched' && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 gap-1 border-amber-200 text-amber-600 hover:bg-amber-50"
                                                            onClick={() => statusUpdateMutation.mutate({ requestId: request.id, action: 'en_route' })}
                                                        >
                                                            <Navigation className="h-3.5 w-3.5" />
                                                            On Way
                                                        </Button>
                                                    )}

                                                    {request.status === 'en_route' && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 gap-1 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                                                            onClick={() => statusUpdateMutation.mutate({ requestId: request.id, action: 'arrive' })}
                                                        >
                                                            <MapPin className="h-3.5 w-3.5" />
                                                            Arrived
                                                        </Button>
                                                    )}

                                                    {['on_site', 'arrived'].includes(request.status) && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 gap-1 border-purple-200 text-purple-600 hover:bg-purple-50"
                                                            onClick={() => statusUpdateMutation.mutate({ requestId: request.id, action: 'in_progress' })}
                                                        >
                                                            <Wrench className="h-3.5 w-3.5" />
                                                            Start
                                                        </Button>
                                                    )}

                                                    {request.status === 'in_progress' && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 gap-1 border-green-200 text-green-600 hover:bg-green-50"
                                                            onClick={() => statusUpdateMutation.mutate({ requestId: request.id, action: 'complete' })}
                                                        >
                                                            <CheckCircle className="h-3.5 w-3.5" />
                                                            Complete
                                                        </Button>
                                                    )}

                                                    {request.can_be_cancelled && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                                                            title="Cancel Request"
                                                            onClick={() => {
                                                                if (confirm("Are you sure you want to cancel this request?")) {
                                                                    statusUpdateMutation.mutate({ requestId: request.id, action: 'cancel' });
                                                                }
                                                            }}
                                                        >
                                                            <XCircle className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-between py-4">
                        <div className="text-sm text-muted-foreground">
                            Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, roadsideData?.count || 0)} of {roadsideData?.count || 0} requests
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                                disabled={page === 1 || isLoadingRequests}
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(prev => prev + 1)}
                                disabled={!roadsideData?.next || isLoadingRequests}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Dispatch Dialog */}
            <Dialog open={isDispatchDialogOpen} onOpenChange={setIsDispatchDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Dispatch Technician</DialogTitle>
                        <DialogDescription>
                            Assign a technician to roadside request {selectedRequest?.request_number}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <label htmlFor="technician" className="text-sm font-medium">Select Technician</label>
                            <select
                                id="technician"
                                value={selectedTechnicianId}
                                onChange={(e) => setSelectedTechnicianId(e.target.value)}
                                className="w-full h-10 px-3 py-2 border rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">-- Choose Technician --</option>
                                {technicians?.map((tech) => (
                                    <option key={tech.id} value={tech.id}>
                                        {tech.full_name || tech.username} ({tech.role})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsDispatchDialogOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleDispatch}
                            disabled={!selectedTechnicianId || dispatchMutation.isPending}
                        >
                            {dispatchMutation.isPending ? "Dispatching..." : "Confirm Dispatch"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

