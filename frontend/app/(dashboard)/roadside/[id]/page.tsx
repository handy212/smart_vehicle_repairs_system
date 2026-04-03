"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { roadsideApi } from "@/lib/api/roadside";
import { adminApi } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    ArrowLeft, Truck, User as UserIcon, Phone,
    MapPin, CheckCircle, XCircle,
    Wrench, Navigation,
    ExternalLink, MessageSquare, ShieldCheck,
    Mail, Sparkles
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
import { useState, useEffect } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { useCurrency } from "@/lib/hooks/useCurrency";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useForm } from "react-hook-form";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const RoadsideMap = dynamic(() => import("@/components/roadside/RoadsideMap"), {
    ssr: false,
    loading: () => <div className="h-[300px] w-full bg-border rounded-xl animate-pulse" />
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
    const { currencySymbol } = useCurrency();

    const requestIdStr = params?.id as string;
    const requestId = requestIdStr ? parseInt(requestIdStr) : NaN;
    const isValidId = !isNaN(requestId);

    const [isDispatchDialogOpen, setIsDispatchDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isSmsDialogOpen, setIsSmsDialogOpen] = useState(false); // We'll keep the name for now to avoid refactor friction, but it's a general message dialog
    const [communicationMethod, setCommunicationMethod] = useState<"sms" | "email">("sms");
    const [smsMessage, setSmsMessage] = useState("");
    const [emailSubject, setEmailSubject] = useState("");
    const [isFetchingSuggestion, setIsFetchingSuggestion] = useState(false);
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
        mutationFn: (data: { method: "sms" | "email", message: string, subject?: string }) => {
            if (data.method === "email") {
                return roadsideApi.sendCustomerEmail(requestId, data.message, data.subject);
            }
            return roadsideApi.sendCustomerSms(requestId, data.message);
        },
        onSuccess: (data, variables) => {
            toast({
                title: "Success",
                description: variables.method === "email" ? "Email sent to customer successfully" : "SMS sent to customer successfully"
            });
            setIsSmsDialogOpen(false);
            setSmsMessage("");
            setEmailSubject("");
        },

        onError: (error: any, variables) => {
            toast({
                title: variables.method === "email" ? "Email Failed" : "SMS Failed",
                description: error.response?.data?.error || `Failed to send ${variables.method === "email" ? "email" : "SMS"}`,
                variant: "destructive"
            });
        }
    });

    const fetchSuggestion = async (method: "sms" | "email") => {
        setIsFetchingSuggestion(true);
        try {
            const suggestion = await roadsideApi.getSuggestedMessage(requestId, method);
            if (method === "email") {
                setEmailSubject(suggestion.subject);
            }
            setSmsMessage(suggestion.message);
        } catch (error) {
            console.error("Failed to fetch suggestion", error);
        } finally {
            setIsFetchingSuggestion(false);
        }
    };

    // Auto-fetch suggestion when dialog opens or method changes
    useEffect(() => {
        if (isSmsDialogOpen && !smsMessage.trim()) {
            fetchSuggestion(communicationMethod);
        }
    }, [isSmsDialogOpen, communicationMethod]);

    const getStatusVariant = (status: string) => {
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

    if (!isValidId) {
        return (
            <div className="p-8 text-center space-y-4">
                <div className="text-destructive font-bold text-xl">Invalid Request ID</div>
                <p className="text-muted-foreground">The roadside request ID provided in the URL is invalid.</p>
                <Button onClick={() => router.push("/roadside")}>Go back to Roadside List</Button>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!request) {
        return (
            <div className="p-8 text-center space-y-4">
                <div className="text-destructive font-bold text-xl">Request Not Found</div>
                <p className="text-muted-foreground">We couldn't find the roadside request you're looking for.</p>
                <Button onClick={() => router.push("/roadside")}>Go back to Roadside List</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col space-y-4">
                <div className="flex justify-between items-center">
                    <div>
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                            <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
                            <span>/</span>
                            <Link href="/roadside" className="hover:text-primary transition-colors">Roadside</Link>
                            <span>/</span>
                            <span className="text-foreground font-medium">{request.request_number}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight text-foreground">
                                {request.service_type_display}
                            </h1>

                            <Badge variant={getStatusVariant(request.status) as any} className="text-[10px] px-2 py-0.5 uppercase tracking-wider font-bold">
                                {request.status_display}
                            </Badge>
                            {request.is_covered_by_subscription && (
                                <Badge variant="success" className="text-[10px] px-2 py-0.5 uppercase tracking-wider font-bold flex items-center gap-1">
                                    <ShieldCheck className="h-3 w-3" /> AA Member
                                </Badge>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="h-9" onClick={handleOpenEdit}>
                            <Wrench className="w-4 h-4 mr-2" />
                            Edit Request
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => router.back()} className="h-9">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Back
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Location & Customer Info - 2 column grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Location Card */}
                        <Card>
                            <CardHeader className="py-3 px-4 border-b">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-primary" />
                                    Location Details
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Breakdown Location</p>
                                    <p className="text-sm text-foreground">{request.breakdown_location}</p>
                                    {request.latitude && request.longitude && (
                                        <a
                                            href={`https://www.google.com/maps?q=${request.latitude},${request.longitude}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-primary flex items-center gap-1 mt-1 hover:underline"
                                        >
                                            Open in Maps <ExternalLink className="h-3 w-3" />
                                        </a>
                                    )}
                                </div>
                                {request.destination && (
                                    <div className="pt-3 border-t">
                                        <p className="text-xs text-muted-foreground mb-1">Destination</p>
                                        <p className="text-sm text-foreground">{request.destination}</p>
                                        {request.tow_distance_km && (
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {request.tow_distance_km} km
                                            </p>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Customer & Vehicle Card */}
                        <Card>
                            <CardHeader className="py-3 px-4 border-b">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                    <UserIcon className="h-4 w-4 text-primary" />
                                    Customer & Vehicle
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Customer</p>
                                    <p className="text-sm font-medium text-foreground">{request.customer_name}</p>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                        <Phone className="h-3 w-3" /> {request.customer_phone}
                                    </p>
                                </div>
                                <div className="pt-3 border-t">
                                    <p className="text-xs text-muted-foreground mb-1">Vehicle</p>
                                    <p className="text-sm text-foreground">{request.vehicle_display}</p>
                                    <Link href={`/vehicles/${request.vehicle}`} className="text-xs text-primary hover:underline">
                                        View Details
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Description & Notes */}
                    {(request.description || request.notes) && (
                        <Card>
                            <CardHeader className="py-3 px-4 border-b">
                                <CardTitle className="text-sm font-semibold">Technical Findings & Notes</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                {request.description && (
                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Problem Description</p>
                                        <p className="text-sm text-card-foreground whitespace-pre-wrap bg-muted p-3 rounded-md">
                                            {request.description}
                                        </p>
                                    </div>
                                )}
                                {request.notes && (
                                    <div className={request.description ? "pt-3 border-t" : ""}>
                                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Internal Notes</p>
                                        <p className="text-sm text-card-foreground whitespace-pre-wrap">
                                            {request.notes}
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Map */}
                    {request.latitude && request.longitude && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">Map</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <RoadsideMap
                                    latitude={typeof request.latitude === 'string' ? parseFloat(request.latitude) : request.latitude}
                                    longitude={typeof request.longitude === 'string' ? parseFloat(request.longitude) : request.longitude}
                                    address={request.breakdown_location}
                                />
                            </CardContent>
                        </Card>
                    )}

                    {/* Service Timeline */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Service History</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="relative space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                                <div className="relative pl-8">
                                    <div className="absolute left-0 top-1 h-4 w-4 rounded-full border-4 border-card bg-primary"></div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold">Request Created</span>
                                        <span className="text-xs text-muted-foreground">{format(new Date(request.requested_at), "h:mm a")}</span>
                                    </div>
                                </div>

                                {request.dispatched_at && (
                                    <div className="relative pl-8">
                                        <div className="absolute left-0 top-1 h-4 w-4 rounded-full border-4 border-card bg-indigo-600"></div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold">Technician Dispatched</span>
                                            <span className="text-xs text-muted-foreground">{format(new Date(request.dispatched_at), "h:mm a")}</span>
                                        </div>
                                        {request.assigned_technician_name && (
                                            <p className="text-xs text-muted-foreground mt-0.5">Assigned to: {request.assigned_technician_name}</p>
                                        )}
                                    </div>
                                )}

                                {request.arrived_at && (
                                    <div className="relative pl-8">
                                        <div className="absolute left-0 top-1 h-4 w-4 rounded-full border-4 border-card bg-emerald-600"></div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold">Technician Arrived</span>
                                            <span className="text-xs text-muted-foreground">{format(new Date(request.arrived_at), "h:mm a")}</span>
                                        </div>
                                    </div>
                                )}

                                {request.completed_at && (
                                    <div className="relative pl-8">
                                        <div className="absolute left-0 top-1 h-4 w-4 rounded-full border-4 border-card bg-success"></div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold">Service Completed</span>
                                            <span className="text-xs text-muted-foreground">{format(new Date(request.completed_at), "h:mm a")}</span>
                                        </div>
                                        {request.invoice_number && (
                                            <div className="text-xs mt-1 flex items-center gap-2">
                                                <span className="text-muted-foreground">Invoice:</span>
                                                <Link
                                                    href={`/billing/invoices/${request.invoice}`}
                                                    className="font-semibold text-primary hover:underline flex items-center gap-1"
                                                >
                                                    {request.invoice_number} <ExternalLink className="h-3 w-3" />
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {request.status === 'cancelled' && (
                                    <div className="relative pl-8">
                                        <div className="absolute left-0 top-1 h-4 w-4 rounded-full border-4 border-card bg-red-600"></div>
                                        <span className="text-sm font-semibold">Request Cancelled</span>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column - Sidebar */}
                <div className="space-y-3">
                    {/* Actions Card */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {request.status === 'requested' && (
                                <Button size="sm" className="w-full" onClick={() => setIsDispatchDialogOpen(true)}>
                                    <Truck className="h-3 w-3 mr-1.5" /> Dispatch
                                </Button>
                            )}

                            {request.status === 'dispatched' && (
                                <Button size="sm" className="w-full" onClick={() => statusUpdateMutation.mutate('en_route')}>
                                    <Navigation className="h-3 w-3 mr-1.5" /> En Route
                                </Button>
                            )}

                            {request.status === 'en_route' && (
                                <Button size="sm" className="w-full" onClick={() => statusUpdateMutation.mutate('arrive')}>
                                    <MapPin className="h-3 w-3 mr-1.5" /> Arrived
                                </Button>
                            )}

                            {['on_site', 'arrived'].includes(request.status) && (
                                <Button size="sm" className="w-full" onClick={() => statusUpdateMutation.mutate('in_progress')}>
                                    <Wrench className="h-3 w-3 mr-1.5" /> Start
                                </Button>
                            )}

                            {request.status === 'in_progress' && (
                                <Button size="sm" className="w-full" onClick={() => statusUpdateMutation.mutate('complete')}>
                                    <CheckCircle className="h-3 w-3 mr-1.5" /> Complete
                                </Button>
                            )}

                            <Button variant="secondary" size="sm" className="w-full" onClick={() => setIsSmsDialogOpen(true)}>
                                <MessageSquare className="h-3 w-3 mr-1.5" /> Message
                            </Button>

                            {request.can_be_cancelled && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="w-full text-destructive dark:text-red-400"
                                    onClick={() => {
                                        if (confirm("Are you sure you want to cancel this request?")) {
                                            statusUpdateMutation.mutate('cancel');
                                        }
                                    }}
                                >
                                    <XCircle className="h-3 w-3 mr-1.5" /> Cancel
                                </Button>
                            )}
                        </CardContent>
                    </Card>

                    {/* Workflow Progress - Compact Horizontal */}
                    {!['cancelled', 'failed'].includes(request.status) && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Progress</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between space-x-1">
                                    {/* Requested */}
                                    <div className="flex flex-col items-center">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${['dispatched', 'en_route', 'on_site', 'in_progress', 'completed'].includes(request.status)
                                            ? 'bg-success/100 text-white'
                                            : request.status === 'requested'
                                                ? 'bg-primary text-white'
                                                : 'bg-border text-muted-foreground'
                                            }`}>
                                            {['dispatched', 'en_route', 'on_site', 'in_progress', 'completed'].includes(request.status) ? '✓' : '1'}
                                        </div>
                                        <span className="text-[9px] mt-0.5 text-muted-foreground">Request</span>
                                    </div>
                                    <div className={`h-px flex-1 ${['dispatched', 'en_route', 'on_site', 'in_progress', 'completed'].includes(request.status) ? 'bg-success/100' : 'bg-muted'}`} />

                                    {/* Dispatched */}
                                    <div className="flex flex-col items-center">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${['en_route', 'on_site', 'in_progress', 'completed'].includes(request.status)
                                            ? 'bg-success/100 text-white'
                                            : request.status === 'dispatched'
                                                ? 'bg-primary text-white'
                                                : 'bg-border text-muted-foreground'
                                            }`}>
                                            {['en_route', 'on_site', 'in_progress', 'completed'].includes(request.status) ? '✓' : '2'}
                                        </div>
                                        <span className="text-[9px] mt-0.5 text-muted-foreground">Dispatch</span>
                                    </div>
                                    <div className={`h-px flex-1 ${['en_route', 'on_site', 'in_progress', 'completed'].includes(request.status) ? 'bg-success/100' : 'bg-muted'}`} />

                                    {/* En Route */}
                                    <div className="flex flex-col items-center">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${['on_site', 'in_progress', 'completed'].includes(request.status)
                                            ? 'bg-success/100 text-white'
                                            : request.status === 'en_route'
                                                ? 'bg-primary text-white'
                                                : 'bg-border text-muted-foreground'
                                            }`}>
                                            {['on_site', 'in_progress', 'completed'].includes(request.status) ? '✓' : '3'}
                                        </div>
                                        <span className="text-[9px] mt-0.5 text-muted-foreground">En Route</span>
                                    </div>
                                    <div className={`h-px flex-1 ${['on_site', 'in_progress', 'completed'].includes(request.status) ? 'bg-success/100' : 'bg-muted'}`} />

                                    {/* On Site */}
                                    <div className="flex flex-col items-center">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${['in_progress', 'completed'].includes(request.status)
                                            ? 'bg-success/100 text-white'
                                            : ['on_site', 'arrived'].includes(request.status)
                                                ? 'bg-primary text-white'
                                                : 'bg-border text-muted-foreground'
                                            }`}>
                                            {['in_progress', 'completed'].includes(request.status) ? '✓' : '4'}
                                        </div>
                                        <span className="text-[9px] mt-0.5 text-muted-foreground">On Site</span>
                                    </div>
                                    <div className={`h-px flex-1 ${['in_progress', 'completed'].includes(request.status) ? 'bg-success/100' : 'bg-muted'}`} />

                                    {/* In Progress */}
                                    <div className="flex flex-col items-center">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${request.status === 'completed'
                                            ? 'bg-success/100 text-white'
                                            : request.status === 'in_progress'
                                                ? 'bg-primary text-white'
                                                : 'bg-border text-muted-foreground'
                                            }`}>
                                            {request.status === 'completed' ? '✓' : '5'}
                                        </div>
                                        <span className="text-[9px] mt-0.5 text-muted-foreground">Working</span>
                                    </div>
                                    <div className={`h-px flex-1 ${request.status === 'completed' ? 'bg-success/100' : 'bg-muted'}`} />

                                    {/* Completed */}
                                    <div className="flex flex-col items-center">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${request.status === 'completed'
                                            ? 'bg-success text-white'
                                            : 'bg-border text-muted-foreground'
                                            }`}>
                                            {request.status === 'completed' ? '✓' : '6'}
                                        </div>
                                        <span className="text-[9px] mt-0.5 text-muted-foreground">Done</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Technician Card */}
                    {request.assigned_technician && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Technician</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="h-10 w-10 rounded-full bg-border flex items-center justify-center text-sm font-bold text-primary">
                                        {request.assigned_technician_name?.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm text-foreground truncate">{request.assigned_technician_name}</div>
                                        <div className="text-xs text-muted-foreground">Mobile Tech</div>
                                    </div>
                                </div>
                                <Button variant="secondary" size="sm" className="w-full text-xs" onClick={() => setIsDispatchDialogOpen(true)}>
                                    Change
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {/* AA Coverage Card */}
                    {request.is_covered_by_subscription && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                    <ShieldCheck className="h-3 w-3" /> AA Coverage
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-xs space-y-1.5">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Plan:</span>
                                    <span className="font-medium text-foreground">{request.subscription_number}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Status:</span>
                                    <span className={`font-medium ${request.subscription_allowance_deducted ? "text-success dark:text-emerald-400" : "text-warning dark:text-amber-400"}`}>
                                        {request.subscription_allowance_deducted ? "Deducted" : "Refunded"}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Charge Amount Card */}
                    {request.charge_amount && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Charge</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xl font-bold text-foreground">
                                    {currencySymbol} {request.charge_amount}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {/* Dialogs */}
            <Dialog open={isDispatchDialogOpen} onOpenChange={setIsDispatchDialogOpen}>
                <DialogContent className="sm:max-w-[400px] p-0 gap-0 bg-card border border-border shadow-xl rounded-xl">
                    <DialogHeader className="p-6 pb-3">
                        <DialogTitle className="text-base font-semibold">Assign Technician</DialogTitle>
                        <DialogDescription className="text-xs">
                            Select a technician to perform the {request.service_type_display}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="px-6 pb-4 pt-2 space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Technician</label>
                            <select
                                value={selectedTechnicianId}
                                onChange={(e) => setSelectedTechnicianId(e.target.value)}
                                className="w-full h-9 px-3 py-2 border rounded-md bg-card text-sm"
                            >
                                <option value="">-- Choose technician --</option>
                                {technicians?.map(tech => (
                                    <option key={tech.id} value={tech.id}>{tech.full_name || tech.username}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <DialogFooter className="p-6 pt-2 border-t border-border bg-muted/50 rounded-b-xl">
                        <Button variant="ghost" size="sm" onClick={() => setIsDispatchDialogOpen(false)}>Cancel</Button>
                        <Button
                            size="sm"
                            onClick={() => dispatchMutation.mutate(parseInt(selectedTechnicianId))}
                            disabled={!selectedTechnicianId || dispatchMutation.isPending}
                            className="bg-primary hover:bg-primary/90 text-white"
                        >
                            {dispatchMutation.isPending ? "Assigning..." : "Assign & Dispatch"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                                {editErrors.customer_phone && <p className="text-xs text-destructive">{editErrors.customer_phone.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="breakdown_location">Breakdown Location *</Label>
                                <Input
                                    id="breakdown_location"
                                    {...register("breakdown_location")}
                                />
                                {editErrors.breakdown_location && <p className="text-xs text-destructive">{editErrors.breakdown_location.message}</p>}
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
                            <Button type="button" variant="secondary" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={updateRequestMutation.isPending}>
                                {updateRequestMutation.isPending ? "Saving..." : "Save Changes"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isSmsDialogOpen} onOpenChange={setIsSmsDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Message Customer</DialogTitle>
                        <DialogDescription>
                            Send a message to {request.customer_name}
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs value={communicationMethod} onValueChange={(v) => setCommunicationMethod(v as any)} className="w-full">
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="sms" className="flex items-center gap-2">
                                <MessageSquare className="h-3.5 w-3.5" /> SMS
                            </TabsTrigger>
                            <TabsTrigger value="email" className="flex items-center gap-2">
                                <Mail className="h-3.5 w-3.5" /> Email
                            </TabsTrigger>
                        </TabsList>

                        <div className="py-2 space-y-4">
                            <div className="flex justify-end">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs gap-1.5"
                                    onClick={() => fetchSuggestion(communicationMethod)}
                                    disabled={isFetchingSuggestion}
                                >
                                    <Sparkles className="h-3 w-3" />
                                    {isFetchingSuggestion ? "Thinking..." : "Auto-generate Content"}
                                </Button>
                            </div>
                            {communicationMethod === "email" && (
                                <div className="space-y-2">
                                    <Label htmlFor="email-subject">Subject</Label>
                                    <Input
                                        id="email-subject"
                                        placeholder="Update on your Roadside Request..."
                                        value={emailSubject}
                                        onChange={(e) => setEmailSubject(e.target.value)}
                                    />
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="message">
                                    {communicationMethod === "sms" ? "SMS Message" : "Email Content"}
                                </Label>
                                <Textarea
                                    id="message"
                                    placeholder={communicationMethod === "sms" ? "Enter SMS message..." : "Enter email content..."}
                                    value={smsMessage}
                                    onChange={(e) => setSmsMessage(e.target.value)}
                                    rows={communicationMethod === "email" ? 8 : 5}
                                    maxLength={communicationMethod === "sms" ? 160 : undefined}
                                />
                                {communicationMethod === "sms" && (
                                    <p className="text-xs text-muted-foreground text-right">
                                        {smsMessage.length}/160 characters
                                    </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Recipient: <span className="font-medium">
                                        {communicationMethod === "sms" ? request.customer_phone : (request.customer_email || "No email available")}
                                    </span>
                                </p>
                            </div>
                        </div>
                    </Tabs>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => { setIsSmsDialogOpen(false); setSmsMessage(""); setEmailSubject(""); }}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => sendSmsMutation.mutate({ method: communicationMethod, message: smsMessage, subject: emailSubject })}
                            disabled={!smsMessage.trim() || sendSmsMutation.isPending || (communicationMethod === "email" && !request.customer_email)}
                        >
                            {sendSmsMutation.isPending ? "Sending..." : `Send ${communicationMethod === "sms" ? "SMS" : "Email"}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
