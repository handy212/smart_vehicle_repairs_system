"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { roadsideApi } from "@/lib/api/roadside";
import { adminApi } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    ArrowLeft, Truck, User as UserIcon, Phone,
    MapPin, Clock, CheckCircle, XCircle,
    Wrench, Navigation, Info,
    ExternalLink, MessageSquare, History, ShieldCheck
} from "lucide-react";
import { format } from "date-fns";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useForm } from "react-hook-form";

const RoadsideMap = dynamic(() => import("@/components/roadside/RoadsideMap"), {
    ssr: false,
    loading: () => <div className="h-[300px] w-full bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
});
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const editRequestSchema = z.object({
    breakdown_location: z.string().min(1, "Location is required"),
    customer_phone: z.string().min(1, "Phone is required"),
    description: z.string().optional(),
    tow_distance_km: z.number().optional(),
    destination: z.string().optional(),
    notes: z.string().optional(),
});

type EditRequestFormData = z.infer<typeof editRequestSchema>;

export default function RoadsideDetailPage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // Parse ID and handle potential NaN
    const requestIdStr = params?.id as string;
    const requestId = requestIdStr ? parseInt(requestIdStr) : NaN;
    const isValidId = !isNaN(requestId);

    const [isDispatchDialogOpen, setIsDispatchDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isSmsDialogOpen, setIsSmsDialogOpen] = useState(false);
    const [smsMessage, setSmsMessage] = useState("");
    const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>("");

    const { data: request, isLoading } = useQuery({
        queryKey: ["roadside", "detail", requestId],
        queryFn: () => roadsideApi.get(requestId),
        enabled: isValidId,
    });

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors: editErrors }
    } = useForm<EditRequestFormData>({
        resolver: zodResolver(editRequestSchema),
    });

    const handleOpenEdit = () => {
        if (request) {
            reset({
                breakdown_location: request.breakdown_location,
                customer_phone: request.customer_phone,
                description: request.description || "",
                tow_distance_km: typeof request.tow_distance_km === 'string' ? parseFloat(request.tow_distance_km) : request.tow_distance_km,
                destination: request.destination || "",
                notes: request.notes || "",
            });
            setIsEditDialogOpen(true);
        }
    };

    const { data: technicians } = useQuery({
        queryKey: ["technicians", "list"],
        queryFn: () => adminApi.users.technicians(),
    });

    const dispatchMutation = useMutation({
        mutationFn: (technicianId: number) => roadsideApi.assignDispatch(requestId, technicianId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["roadside", "detail", requestId] });
            toast({ title: "Success", description: "Technician dispatched" });
            setIsDispatchDialogOpen(false);
        }
    });

    const updateRequestMutation = useMutation({
        mutationFn: (data: EditRequestFormData) => roadsideApi.partialUpdate(requestId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["roadside", "detail", requestId] });
            toast({ title: "Updated", description: "Request details updated successfully" });
            setIsEditDialogOpen(false);
        },
        onError: (error: any) => {
            toast({
                title: "Update Failed",
                description: error.response?.data?.detail || "Failed to update request",
                variant: "destructive"
            });
        }
    });

    const statusUpdateMutation = useMutation({
        mutationFn: (action: string) => {
            switch (action) {
                case 'en_route': return roadsideApi.enRoute(requestId);
                case 'arrive': return roadsideApi.arrive(requestId);
                case 'in_progress': return roadsideApi.inProgress(requestId);
                case 'complete': return roadsideApi.complete(requestId);
                case 'cancel': return roadsideApi.cancel(requestId);
                default: throw new Error("Invalid action");
            }
        },
        onSuccess: (data: any, action) => {
            queryClient.invalidateQueries({ queryKey: ["roadside", "detail", requestId] });

            if (action === 'complete' && data?.invoice_id) {
                toast({
                    title: "Service Completed",
                    description: `Status changed to completed. Invoice GH#${data.invoice_id} generated. Redirecting...`,
                    variant: "success"
                });
                setTimeout(() => router.push(`/billing/invoices/${data.invoice_id}`), 2000);
            } else {
                toast({ title: "Updated", description: `Status changed to ${action}` });
            }
        }
    });

    const sendSmsMutation = useMutation({
        mutationFn: (message: string) => roadsideApi.sendCustomerSms(requestId, message),
        onSuccess: () => {
            toast({ title: "Success", description: "SMS sent to customer successfully" });
            setIsSmsDialogOpen(false);
            setSmsMessage("");
        },
        onError: (error: any) => {
            toast({
                title: "SMS Failed",
                description: error.response?.data?.error || "Failed to send SMS",
                variant: "destructive"
            });
        }
    });

    if (!isValidId) {
        return (
            <div className="p-8 text-center space-y-4">
                <div className="text-red-500 font-bold text-xl">Invalid Request ID</div>
                <p className="text-muted-foreground">The roadside request ID provided in the URL is invalid.</p>
                <Button onClick={() => router.push("/roadside")}>Go back to Roadside List</Button>
            </div>
        );
    }

    if (isLoading) {
        return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading request details...</div>;
    }

    if (!request) {
        return (
            <div className="p-8 text-center space-y-4">
                <div className="text-red-500 font-bold text-xl">Request Not Found</div>
                <p className="text-muted-foreground">We couldn't find the roadside request you're looking for.</p>
                <Button onClick={() => router.push("/roadside")}>Go back to Roadside List</Button>
            </div>
        );
    }

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

    return (
        <div className="space-y-6 pb-12">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back to List
                </Button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1 space-y-6">
                    {/* Main Info Card */}
                    <Card className="border-none shadow-sm overflow-hidden">
                        <div className="h-2 bg-gradient-to-r from-blue-600 to-indigo-600"></div>
                        <CardHeader className="flex flex-row items-start justify-between">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <Badge variant={getStatusVariant(request.status)} className="px-3 py-1">
                                        {request.status_display}
                                    </Badge>
                                    <span className="text-sm font-bold text-muted-foreground">{request.request_number}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <CardTitle className="text-2xl">{request.service_type_display}</CardTitle>
                                    <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={handleOpenEdit}>
                                        <Wrench className="h-3 w-3" /> Edit Details
                                    </Button>
                                </div>
                                <CardDescription className="flex items-center gap-1 mt-1">
                                    <Clock className="h-3.5 w-3.5" />
                                    Requested on {format(new Date(request.requested_at), "MMMM d, yyyy 'at' h:mm a")}
                                </CardDescription>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                {request.is_covered_by_subscription && (
                                    <Badge variant="success" className="gap-1 px-3 py-1">
                                        <ShieldCheck className="h-3.5 w-3.5" /> Covered by AA
                                    </Badge>
                                )}
                                <div className="text-right">
                                    <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Charge Amount</div>
                                    <div className="text-xl font-black text-gray-900 dark:text-gray-100">
                                        {request.charge_amount ? `GH¢ ${request.charge_amount}` : "N/A"}
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600">
                                            <MapPin className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold uppercase text-muted-foreground">Breakdown Location</div>
                                            <div className="text-sm font-medium">{request.breakdown_location}</div>
                                            {request.latitude && request.longitude && (
                                                <a
                                                    href={`https://www.google.com/maps?q=${request.latitude},${request.longitude}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-blue-600 flex items-center gap-1 mt-1 hover:underline"
                                                >
                                                    View on Map <ExternalLink className="h-3 w-3" />
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    {request.destination && (
                                        <div className="flex items-start gap-3">
                                            <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600">
                                                <Navigation className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold uppercase text-muted-foreground">Towing Destination</div>
                                                <div className="text-sm font-medium">{request.destination}</div>
                                                {request.tow_distance_km && (
                                                    <div className="text-xs text-muted-foreground mt-0.5">Estimated distance: {request.tow_distance_km} km</div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-start gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                                            <Truck className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold uppercase text-muted-foreground">Vehicle Information</div>
                                            <div className="text-sm font-medium">{request.vehicle_display}</div>
                                            <Link href={`/vehicles/${request.vehicle}`} className="text-xs text-blue-600 hover:underline">
                                                View Vehicle Details
                                            </Link>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
                                            <UserIcon className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold uppercase text-muted-foreground">Customer</div>
                                            <div className="text-sm font-medium">{request.customer_name}</div>
                                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                                <Phone className="h-3 w-3" /> {request.customer_phone || "No phone listed"}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {request.description && (
                                <div className="pt-4 border-t">
                                    <div className="text-xs font-bold uppercase text-muted-foreground mb-2">Problem Description</div>
                                    <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm whitespace-pre-wrap italic">
                                        "{request.description}"
                                    </div>
                                </div>
                            )}

                            {request.notes && (
                                <div className="pt-4 border-t">
                                    <div className="text-xs font-bold uppercase text-muted-foreground mb-2">Internal Notes</div>
                                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {request.notes}
                                    </div>
                                </div>
                            )}

                            {request.latitude && request.longitude && (
                                <div className="pt-4 border-t">
                                    <div className="text-xs font-bold uppercase text-muted-foreground mb-3">Map View</div>
                                    <RoadsideMap
                                        latitude={typeof request.latitude === 'string' ? parseFloat(request.latitude) : request.latitude}
                                        longitude={typeof request.longitude === 'string' ? parseFloat(request.longitude) : request.longitude}
                                        address={request.breakdown_location}
                                    />
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Activity Timeline */}
                    <Card className="border-none shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <History className="h-5 w-5 text-blue-600" />
                                Service History
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="relative space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100 dark:before:bg-gray-800">
                                <div className="relative pl-8">
                                    <div className="absolute left-0 top-1 h-4 w-4 rounded-full border-4 border-white dark:border-gray-900 bg-blue-600"></div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-bold">Request Created</span>
                                        <span className="text-xs text-muted-foreground">{format(new Date(request.requested_at), "h:mm a")}</span>
                                    </div>
                                </div>

                                {request.dispatched_at && (
                                    <div className="relative pl-8">
                                        <div className="absolute left-0 top-1 h-4 w-4 rounded-full border-4 border-white dark:border-gray-900 bg-indigo-600"></div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-bold">Technician Dispatched</span>
                                            <span className="text-xs text-muted-foreground">{format(new Date(request.dispatched_at), "h:mm a")}</span>
                                        </div>
                                        {request.assigned_technician_name && (
                                            <div className="text-xs text-muted-foreground mt-0.5">Assigned to: {request.assigned_technician_name}</div>
                                        )}
                                    </div>
                                )}

                                {request.arrived_at && (
                                    <div className="relative pl-8">
                                        <div className="absolute left-0 top-1 h-4 w-4 rounded-full border-4 border-white dark:border-gray-900 bg-emerald-600"></div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-bold">Technician Arrived</span>
                                            <span className="text-xs text-muted-foreground">{format(new Date(request.arrived_at), "h:mm a")}</span>
                                        </div>
                                    </div>
                                )}

                                {request.completed_at && (
                                    <div className="relative pl-8">
                                        <div className="absolute left-0 top-1 h-4 w-4 rounded-full border-4 border-white dark:border-gray-900 bg-green-600"></div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-bold">Service Completed</span>
                                            <span className="text-xs text-muted-foreground">{format(new Date(request.completed_at), "h:mm a")}</span>
                                        </div>
                                        {request.invoice_number && (
                                            <div className="text-xs mt-1 flex items-center gap-2">
                                                <span className="text-muted-foreground">Invoice:</span>
                                                <Link
                                                    href={`/billing/invoices/${request.invoice}`}
                                                    className="font-bold text-blue-600 hover:underline flex items-center gap-1"
                                                >
                                                    {request.invoice_number} <ExternalLink className="h-3 w-3" />
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {request.status === 'cancelled' && (
                                    <div className="relative pl-8">
                                        <div className="absolute left-0 top-1 h-4 w-4 rounded-full border-4 border-white dark:border-gray-900 bg-red-600"></div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-bold">Request Cancelled</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="w-full lg:w-80 space-y-6">
                    {/* Actions Panel */}
                    <Card className="border-none shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-lg">Control Center</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {request.status === 'requested' && (
                                <Button
                                    className="w-full bg-blue-600 hover:bg-blue-700"
                                    onClick={() => setIsDispatchDialogOpen(true)}
                                >
                                    <Truck className="h-4 w-4 mr-2" /> Dispatch Technician
                                </Button>
                            )}

                            {request.status === 'dispatched' && (
                                <Button
                                    className="w-full bg-amber-600 hover:bg-amber-700"
                                    onClick={() => statusUpdateMutation.mutate('en_route')}
                                >
                                    <Navigation className="h-4 w-4 mr-2" /> Technician En Route
                                </Button>
                            )}

                            {request.status === 'en_route' && (
                                <Button
                                    className="w-full bg-indigo-600 hover:bg-indigo-700"
                                    onClick={() => statusUpdateMutation.mutate('arrive')}
                                >
                                    <MapPin className="h-4 w-4 mr-2" /> Mark as Arrived
                                </Button>
                            )}

                            {['on_site', 'arrived'].includes(request.status) && (
                                <Button
                                    className="w-full bg-purple-600 hover:bg-purple-700"
                                    onClick={() => statusUpdateMutation.mutate('in_progress')}
                                >
                                    <Wrench className="h-4 w-4 mr-2" /> Start Service
                                </Button>
                            )}

                            {request.status === 'in_progress' && (
                                <Button
                                    className="w-full bg-green-600 hover:bg-green-700"
                                    onClick={() => statusUpdateMutation.mutate('complete')}
                                >
                                    <CheckCircle className="h-4 w-4 mr-2" /> Complete Service
                                </Button>
                            )}

                            {request.can_be_cancelled && (
                                <Button
                                    variant="outline"
                                    className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                    onClick={() => {
                                        if (confirm("Are you sure you want to cancel this request?")) {
                                            statusUpdateMutation.mutate('cancel');
                                        }
                                    }}
                                >
                                    <XCircle className="h-4 w-4 mr-2" /> Cancel Request
                                </Button>
                            )}

                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => setIsSmsDialogOpen(true)}
                            >
                                <MessageSquare className="h-4 w-4 mr-2" /> Message Customer
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Provider Card */}
                    {request.assigned_technician && (
                        <Card className="border-none shadow-sm">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground font-bold">Assigned Technician</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-3">
                                    <div className="h-12 w-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-blue-600">
                                        {request.assigned_technician_name?.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="font-bold">{request.assigned_technician_name}</div>
                                        <div className="text-xs text-muted-foreground">Mobile Technician</div>
                                    </div>
                                </div>
                                <Button variant="secondary" size="sm" className="w-full mt-4" onClick={() => setIsDispatchDialogOpen(true)}>
                                    Change Technician
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {/* Subscription Info Card */}
                    {request.is_covered_by_subscription && (
                        <Card className="border-none shadow-sm bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold text-emerald-800 dark:text-emerald-300">AA Coverage</CardTitle>
                            </CardHeader>
                            <CardContent className="text-xs space-y-2 text-emerald-700 dark:text-emerald-400">
                                <div className="flex justify-between">
                                    <span>Subscription:</span>
                                    <span className="font-bold">{request.subscription_number}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Allowance Used:</span>
                                    <span className="font-bold">Yes</span>
                                </div>
                                <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800 mt-2">
                                    <p>This service call has been deducted from the member's annual allowance.</p>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {/* Dispatch Dialog */}
            <Dialog open={isDispatchDialogOpen} onOpenChange={setIsDispatchDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Assign Technician</DialogTitle>
                        <DialogDescription>
                            Select a technician to perform the {request.service_type_display}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Technician</label>
                            <select
                                value={selectedTechnicianId}
                                onChange={(e) => setSelectedTechnicianId(e.target.value)}
                                className="w-full h-10 px-3 py-2 border rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">-- Choose technician --</option>
                                {technicians?.map(tech => (
                                    <option key={tech.id} value={tech.id}>{tech.full_name || tech.username}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsDispatchDialogOpen(false)}>Cancel</Button>
                        <Button
                            onClick={() => dispatchMutation.mutate(parseInt(selectedTechnicianId))}
                            disabled={!selectedTechnicianId || dispatchMutation.isPending}
                        >
                            {dispatchMutation.isPending ? "Assigning..." : "Assign & Dispatch"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Request Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Edit Roadside Request</DialogTitle>
                        <DialogDescription>
                            Update the details for request {request.request_number}.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit((data) => updateRequestMutation.mutate(data))} className="py-4 space-y-4">
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="customer_phone">Customer Phone *</Label>
                                <Input
                                    id="customer_phone"
                                    {...register("customer_phone")}
                                />
                                {editErrors.customer_phone && <p className="text-xs text-red-500">{editErrors.customer_phone.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="breakdown_location">Breakdown Location *</Label>
                                <Input
                                    id="breakdown_location"
                                    {...register("breakdown_location")}
                                />
                                {editErrors.breakdown_location && <p className="text-xs text-red-500">{editErrors.breakdown_location.message}</p>}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="tow_distance_km">Tow Distance (km)</Label>
                                    <Input
                                        id="tow_distance_km"
                                        type="number"
                                        step="0.1"
                                        {...register("tow_distance_km", { valueAsNumber: true })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="destination">Destination</Label>
                                    <Input
                                        id="destination"
                                        {...register("destination")}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    {...register("description")}
                                    rows={3}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="notes">Internal Notes</Label>
                                <Textarea
                                    id="notes"
                                    {...register("notes")}
                                    rows={3}
                                />
                            </div>
                        </div>
                        <DialogFooter className="pt-4">
                            <Button type="button" variant="ghost" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={updateRequestMutation.isPending}>
                                {updateRequestMutation.isPending ? "Saving..." : "Save Changes"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* SMS Dialog */}
            <Dialog open={isSmsDialogOpen} onOpenChange={setIsSmsDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Message Customer</DialogTitle>
                        <DialogDescription>
                            Send an SMS to {request.customer_name} at {request.customer_phone}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="sms-message">Message</Label>
                            <Textarea
                                id="sms-message"
                                placeholder="Enter your message here..."
                                value={smsMessage}
                                onChange={(e) => setSmsMessage(e.target.value)}
                                rows={5}
                                maxLength={160}
                            />
                            <p className="text-xs text-muted-foreground text-right">
                                {smsMessage.length}/160 characters
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => { setIsSmsDialogOpen(false); setSmsMessage(""); }}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => sendSmsMutation.mutate(smsMessage)}
                            disabled={!smsMessage.trim() || sendSmsMutation.isPending}
                        >
                            {sendSmsMutation.isPending ? "Sending..." : "Send SMS"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
