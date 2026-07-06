"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
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
    Mail, Sparkles, Building2, Camera
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
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { useCurrency } from "@/lib/hooks/useCurrency";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useForm, Controller } from "react-hook-form";
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
import { getUserFacingError } from "@/lib/api/errors";
import { cn } from "@/lib/utils/cn";
import { RoadsideBranchSelect } from "@/components/roadside/RoadsideBranchSelect";
function resolveEntityId(value: number | { id: number } | undefined): number | undefined {
    if (typeof value === "number") return value;
    if (value && typeof value === "object" && "id" in value) return value.id;
    return undefined;
}

const editRequestSchema = z.object({
    branch: z.number().min(1).optional(),
    breakdown_location: z.string().min(1, "Location is required"),
    customer_phone: z.string().min(1, "Phone is required"),
    description: z.string().optional(),
    tow_distance_km: z.number().optional(),
    destination: z.string().optional(),
    notes: z.string().optional(),
    charge_amount: z.number().min(0, "Charge amount cannot be negative").optional(),
});

type EditRequestFormData = z.infer<typeof editRequestSchema>;
type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "secondary" | "outline";
type CommunicationMethod = "sms" | "email";

export default function RoadsideDetailPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { currencySymbol } = useCurrency();

    const requestIdStr = params?.id as string;
    const requestId = requestIdStr ? parseInt(requestIdStr) : NaN;
    const isValidId = !isNaN(requestId);

    const [isDispatchDialogOpen, setIsDispatchDialogOpen] = useState(false);
    const [dispatchMode, setDispatchMode] = useState<'initial' | 'add'>('initial');
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isSmsDialogOpen, setIsSmsDialogOpen] = useState(false);
    const [communicationMethod, setCommunicationMethod] = useState<CommunicationMethod>("sms");
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
        control,
        formState: { errors: editErrors }
    } = useForm<EditRequestFormData>({
        resolver: zodResolver(editRequestSchema),
    });

    const handleOpenEdit = () => {
        if (request) {
            reset({
                branch: request.branch,
                breakdown_location: request.breakdown_location,
                customer_phone: request.customer_phone,
                description: request.description || "",
                tow_distance_km: typeof request.tow_distance_km === 'string' ? parseFloat(request.tow_distance_km) : request.tow_distance_km,
                destination: request.destination || "",
                notes: request.notes || "",
                charge_amount: request.charge_amount ? parseFloat(String(request.charge_amount)) : 0,
            });
            setIsEditDialogOpen(true);
        }
    };

    const { data: technicians } = useQuery({
        queryKey: ["technicians", "list", request?.branch],
        queryFn: () => adminApi.users.technicians(request?.branch ? { branch: request.branch } : undefined),
        enabled: !!request,
    });

    const dispatchMutation = useMutation({
        mutationFn: (technicianId: number) => roadsideApi.assignDispatch(requestId, technicianId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["roadside", "detail", requestId] });
            toast({ title: "Success", description: "Technician dispatched" });
            setIsDispatchDialogOpen(false);
            setSelectedTechnicianId("");
        },
        onError: (error: unknown) => {
            toast({
                title: "Dispatch Failed",
                description: getUserFacingError(error, "Technician could not be dispatched"),
                variant: "destructive",
            });
        }
    });

    const addTechnicianMutation = useMutation({
        mutationFn: (technicianId: number) => roadsideApi.addTechnician(requestId, technicianId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["roadside", "detail", requestId] });
            toast({ title: "Success", description: "Technician added to this request" });
            setIsDispatchDialogOpen(false);
            setSelectedTechnicianId("");
        },
        onError: (error: unknown) => {
            toast({
                title: "Failed",
                description: getUserFacingError(error, "Could not add technician"),
                variant: "destructive",
            });
        }
    });

    const removeTechnicianMutation = useMutation({
        mutationFn: (technicianId: number) => roadsideApi.removeTechnician(requestId, technicianId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["roadside", "detail", requestId] });
            toast({ title: "Removed", description: "Technician removed from this request" });
        },
        onError: (error: unknown) => {
            toast({
                title: "Failed",
                description: getUserFacingError(error, "Could not remove technician"),
                variant: "destructive",
            });
        }
    });

    const updateRequestMutation = useMutation({
        mutationFn: (data: EditRequestFormData) => roadsideApi.partialUpdate(requestId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["roadside", "detail", requestId] });
            toast({ title: "Updated", description: "Request details updated successfully" });
            setIsEditDialogOpen(false);
        },

        onError: (error: unknown) => {
            toast({
                title: "Update Failed",
                description: getUserFacingError(error, "Failed to update request"),
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

        onSuccess: (data, action) => {
            queryClient.invalidateQueries({ queryKey: ["roadside", "detail", requestId] });

            const invoiceId = data?.invoice || data?.invoice_id;

            if (action === 'complete' && invoiceId) {
                toast({
                    title: "Service Completed",
                    description: `Status changed to completed. Invoice ${data.invoice_number || `#${invoiceId}`} generated. Redirecting...`,
                    variant: "success"
                });
                setTimeout(() => router.push(`/billing/invoices/${invoiceId}`), 2000);
            } else {
                toast({ title: "Updated", description: `Status changed to ${action}` });
            }
        },
        onError: (error: unknown, action) => {
            toast({
                title: "Action Failed",
                description: getUserFacingError(error, `Could not ${action.replace("_", " ")} this request`),
                variant: "destructive",
            });
        }
    });

    const sendSmsMutation = useMutation({
        mutationFn: (data: { method: CommunicationMethod, message: string, subject?: string }) => {
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

        onError: (error: unknown, variables) => {
            toast({
                title: variables.method === "email" ? "Email Failed" : "SMS Failed",
                description: getUserFacingError(error, `Failed to send ${variables.method === "email" ? "email" : "SMS"}`),
                variant: "destructive"
            });
        }
    });

    const fetchSuggestion = useCallback(async (method: CommunicationMethod) => {
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
    }, [requestId]);

    // Auto-fetch suggestion when dialog opens or method changes
    useEffect(() => {
        if (isSmsDialogOpen && !smsMessage.trim()) {
            fetchSuggestion(communicationMethod);
        }
    }, [isSmsDialogOpen, communicationMethod, fetchSuggestion, smsMessage]);

    useEffect(() => {
        if (request && searchParams.get("action") === "dispatch" && request.status === "requested") {
            setDispatchMode('initial');
            setIsDispatchDialogOpen(true);
        }
    }, [request, searchParams]);

    const openAddTechnicianDialog = () => {
        setDispatchMode('add');
        setSelectedTechnicianId("");
        setIsDispatchDialogOpen(true);
    };

    const openInitialDispatchDialog = () => {
        setDispatchMode('initial');
        setSelectedTechnicianId("");
        setIsDispatchDialogOpen(true);
    };

    const getStatusVariant = (status: string): BadgeVariant => {
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
                <p className="text-muted-foreground">We could not find the roadside request you are looking for.</p>
                <Button onClick={() => router.push("/roadside")}>Go back to Roadside List</Button>
            </div>
        );
    }

    const customerId = resolveEntityId(request.customer);
    const vehicleId = resolveEntityId(request.vehicle);
    const branch = request.branch_detail;
    const mapsUrl =
        request.latitude && request.longitude
            ? `https://www.google.com/maps?q=${request.latitude},${request.longitude}`
            : request.breakdown_location
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(request.breakdown_location)}`
                : null;

    return (
        <div className="space-y-5 pb-12 max-w-6xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-border pb-4">
                <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Link href="/roadside" className="hover:text-primary">Roadside</Link>
                        <span>/</span>
                        <span className="font-mono text-foreground">{request.request_number}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-xl font-bold text-foreground">{request.service_type_display}</h1>
                        <Badge variant={getStatusVariant(request.status)} className="text-[10px] uppercase font-bold">
                            {request.status_display}
                        </Badge>
                        {branch && (
                            <Badge variant="outline" className="gap-1 text-xs font-normal">
                                <Building2 className="h-3 w-3" />
                                {branch.name}
                            </Badge>
                        )}
                        {request.is_covered_by_subscription && (
                            <Badge variant="success" className="text-[10px] gap-1">
                                <ShieldCheck className="h-3 w-3" /> Covered
                            </Badge>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Requested {format(new Date(request.requested_at), "MMM d, yyyy · h:mm a")}</span>
                        {request.created_by_name && <span>Created by {request.created_by_name}</span>}
                        {request.customer_number && <span>Customer #{request.customer_number}</span>}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {!['completed', 'cancelled', 'failed'].includes(request.status) && (
                        <Button variant="outline" size="sm" onClick={handleOpenEdit}>
                            <Wrench className="w-4 h-4 mr-2" />
                            Edit
                        </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => router.push("/roadside")}>
                        <ArrowLeft className="w-4 h-4 mr-2" /> List
                    </Button>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardHeader className="py-3 px-4 border-b">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                <UserIcon className="h-4 w-4 text-primary" />
                                Customer & vehicle
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-muted-foreground mb-1">Customer</p>
                                <p className="text-sm font-medium">{request.customer_name}</p>
                                <a href={`tel:${request.customer_phone}`} className="text-xs text-primary flex items-center gap-1 mt-1 hover:underline">
                                    <Phone className="h-3 w-3" /> {request.customer_phone}
                                </a>
                                {customerId && (
                                    <Link href={`/customers/${customerId}`} className="text-xs text-primary hover:underline block mt-2">
                                        View customer profile
                                    </Link>
                                )}
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground mb-1">Vehicle</p>
                                <p className="text-sm">{request.vehicle_display}</p>
                                {(request.vehicle_license_plate || request.vehicle_vin) && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {[request.vehicle_license_plate, request.vehicle_vin].filter(Boolean).join(" · ")}
                                    </p>
                                )}
                                {vehicleId && (
                                    <Link href={`/vehicles/${vehicleId}`} className="text-xs text-primary hover:underline block mt-2">
                                        View vehicle
                                    </Link>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="py-3 px-4 border-b">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-primary" />
                                Location & branch
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                            <Building2 className="h-3 w-3" /> Service branch
                                        </p>
                                        <p className="text-sm font-medium">{branch?.name || request.branch_name || "—"}</p>
                                        {branch?.full_address && (
                                            <p className="text-xs text-muted-foreground mt-0.5">{branch.full_address}</p>
                                        )}
                                        {branch?.phone && (
                                            <a href={`tel:${branch.phone}`} className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
                                                <Phone className="h-3 w-3" /> {branch.phone}
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-xs text-muted-foreground mb-1">Breakdown location</p>
                                        <p className="text-sm text-foreground">{request.breakdown_location}</p>
                                        {mapsUrl && (
                                            <a
                                                href={mapsUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-primary inline-flex items-center gap-1 mt-1 hover:underline"
                                            >
                                                Open in Maps <ExternalLink className="h-3 w-3" />
                                            </a>
                                        )}
                                    </div>
                                    {request.destination && (
                                        <div className="pt-2 border-t">
                                            <p className="text-xs text-muted-foreground mb-1">Destination</p>
                                            <p className="text-sm">{request.destination}</p>
                                            {request.tow_distance_km != null && (
                                                <p className="text-xs text-muted-foreground">{request.tow_distance_km} km tow</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

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

                    {((request.site_notes?.length || 0) > 0 || (request.photos?.length || 0) > 0) && (
                        <Card>
                            <CardHeader className="py-3 px-4 border-b">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                    <Camera className="h-4 w-4 text-primary" />
                                    Site Documentation
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                {(request.site_notes?.length || 0) > 0 && (
                                    <div className="space-y-2">
                                        {request.site_notes?.map((note) => (
                                            <div key={note.id} className="rounded-md border border-border bg-muted/40 p-3">
                                                <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                                                <p className="mt-2 text-xs text-muted-foreground">
                                                    {note.created_by_name || "Technician"} · {format(new Date(note.created_at), "MMM d, yyyy · h:mm a")}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {(request.photos?.length || 0) > 0 && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {request.photos?.map((photo) => (
                                            <a
                                                key={photo.id}
                                                href={photo.image}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="group overflow-hidden rounded-md border border-border bg-card"
                                            >
                                                <img
                                                    src={photo.image}
                                                    alt={photo.caption || "Roadside photo"}
                                                    className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.02]"
                                                />
                                                {photo.caption && (
                                                    <p className="p-2 text-xs text-muted-foreground line-clamp-2">{photo.caption}</p>
                                                )}
                                            </a>
                                        ))}
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

                    <Card>
                        <CardHeader className="py-3">
                            <CardTitle className="text-sm">Service timeline</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="relative space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                                {(request.timeline?.length ? request.timeline : [
                                    { key: 'requested', label: 'Request created', at: request.requested_at },
                                ]).map((entry, index) => (
                                    <div key={`${entry.key}-${index}`} className="relative pl-8">
                                        <div className={cn(
                                            "absolute left-0 top-1 h-4 w-4 rounded-full border-4 border-card",
                                            entry.key === 'completed' ? "bg-success" :
                                            entry.key === 'cancelled' ? "bg-destructive" :
                                            entry.key === 'dispatched' ? "bg-indigo-600" :
                                            "bg-primary"
                                        )} />
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-semibold">{entry.label}</span>
                                            <span className="text-xs text-muted-foreground shrink-0">
                                                {format(new Date(entry.at), "MMM d · h:mm a")}
                                            </span>
                                        </div>
                                        {'meta' in entry && entry.meta && (
                                            <p className="text-xs text-muted-foreground mt-0.5">{entry.meta}</p>
                                        )}
                                        {'invoice_number' in entry && entry.invoice_number && entry.invoice_id && (
                                            <Link
                                                href={`/billing/invoices/${entry.invoice_id}`}
                                                className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                                            >
                                                Invoice {entry.invoice_number} <ExternalLink className="h-3 w-3" />
                                            </Link>
                                        )}
                                    </div>
                                ))}
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
                            {(request.available_actions?.includes("dispatch") ?? request.status === "requested") && (
                                <Button size="sm" className="w-full" onClick={openInitialDispatchDialog}>
                                    <Truck className="h-3 w-3 mr-1.5" /> Dispatch
                                </Button>
                            )}

                            {(request.available_actions?.includes("en_route") ?? request.status === "dispatched") && (
                                <Button size="sm" className="w-full" onClick={() => statusUpdateMutation.mutate('en_route')}>
                                    <Navigation className="h-3 w-3 mr-1.5" /> En Route
                                </Button>
                            )}

                            {(request.available_actions?.includes("arrive") ?? request.status === "en_route") && (
                                <Button size="sm" className="w-full" onClick={() => statusUpdateMutation.mutate('arrive')}>
                                    <MapPin className="h-3 w-3 mr-1.5" /> Arrived
                                </Button>
                            )}

                            {(request.available_actions?.includes("in_progress") ?? ["on_site", "arrived"].includes(request.status)) && (
                                <Button size="sm" className="w-full" onClick={() => statusUpdateMutation.mutate('in_progress')}>
                                    <Wrench className="h-3 w-3 mr-1.5" /> Start
                                </Button>
                            )}

                            {(request.available_actions?.includes("complete") ?? request.status === "in_progress") && (
                                <Button size="sm" className="w-full" onClick={() => statusUpdateMutation.mutate('complete')}>
                                    <CheckCircle className="h-3 w-3 mr-1.5" /> Complete
                                </Button>
                            )}

                            {(request.available_actions?.includes("message") ?? true) && (
                                <Button variant="secondary" size="sm" className="w-full" onClick={() => setIsSmsDialogOpen(true)}>
                                    <MessageSquare className="h-3 w-3 mr-1.5" /> Message
                                </Button>
                            )}

                            {(request.available_actions?.includes("cancel") ?? request.can_be_cancelled) && (
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

                    {/* Technicians Card — multi-dispatch */}
                    {(() => {
                        const dispatched = request.dispatched_technicians ?? [];
                        const isActive = !['completed', 'cancelled', 'failed'].includes(request.status);
                        if (dispatched.length === 0 && !isActive) return null;
                        return (
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                                        <span>Technicians ({dispatched.length})</span>
                                        {isActive && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 text-[10px] px-2 text-primary"
                                                onClick={openAddTechnicianDialog}
                                            >
                                                + Add
                                            </Button>
                                        )}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {dispatched.length === 0 ? (
                                        <p className="text-xs text-muted-foreground italic">No technicians assigned yet.</p>
                                    ) : (
                                        dispatched.map((d) => (
                                            <div key={d.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border">
                                                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                                    {d.technician_name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-medium text-foreground truncate">{d.technician_name}</div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {d.technician === request.assigned_technician ? 'Lead' : 'Support'}
                                                    </div>
                                                </div>
                                                {isActive && (
                                                    <button
                                                        className="text-muted-foreground hover:text-destructive transition-colors ml-auto"
                                                        title="Remove technician"
                                                        onClick={() => {
                                                            if (confirm(`Remove ${d.technician_name} from this request?`)) {
                                                                removeTechnicianMutation.mutate(d.technician);
                                                            }
                                                        }}
                                                        disabled={removeTechnicianMutation.isPending}
                                                    >
                                                        <XCircle className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })()}

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

                    {(request.rating || request.customer_feedback) && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Customer Rating</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {request.rating && (
                                    <div className="flex items-center gap-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <span key={star} className={star <= request.rating! ? "text-yellow-500" : "text-muted-foreground"}>
                                                ★
                                            </span>
                                        ))}
                                        <span className="text-xs text-muted-foreground ml-1">({request.rating}/5)</span>
                                    </div>
                                )}
                                {request.customer_feedback && (
                                    <p className="text-xs text-foreground italic">"{request.customer_feedback}"</p>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {/* Dialogs */}
            <Dialog open={isDispatchDialogOpen} onOpenChange={(open) => { setIsDispatchDialogOpen(open); if (!open) setSelectedTechnicianId(""); }}>
                <DialogContent className="sm:max-w-[400px] p-0 gap-0 bg-card border border-border shadow-xl rounded-xl">
                    <DialogHeader className="p-6 pb-3">
                        <DialogTitle className="text-base font-semibold">
                            {dispatchMode === 'add' ? 'Add Technician' : 'Assign & Dispatch'}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            {dispatchMode === 'add'
                                ? 'Select an additional technician to join this request.'
                                : `Select a technician to perform the ${request.service_type_display}.`
                            }
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
                                    <option
                                        key={tech.id}
                                        value={tech.id}
                                        disabled={request.dispatched_technicians?.some(d => d.technician === tech.id)}
                                    >
                                        {tech.full_name || tech.username}
                                        {request.dispatched_technicians?.some(d => d.technician === tech.id) ? ' (already assigned)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <DialogFooter className="p-6 pt-2 border-t border-border bg-muted/50 rounded-b-xl">
                        <Button variant="ghost" size="sm" onClick={() => setIsDispatchDialogOpen(false)}>Cancel</Button>
                        <Button
                            size="sm"
                            onClick={() => {
                                const id = parseInt(selectedTechnicianId);
                                if (dispatchMode === 'add') {
                                    addTechnicianMutation.mutate(id);
                                } else {
                                    dispatchMutation.mutate(id);
                                }
                            }}
                            disabled={!selectedTechnicianId || dispatchMutation.isPending || addTechnicianMutation.isPending}
                            className="bg-primary hover:bg-primary/90 text-white"
                        >
                            {(dispatchMutation.isPending || addTechnicianMutation.isPending)
                                ? 'Assigning...'
                                : dispatchMode === 'add' ? 'Add Technician' : 'Assign & Dispatch'
                            }
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Controller
                                    control={control}
                                    name="branch"
                                    render={({ field }) => (
                                        <RoadsideBranchSelect
                                            variant="inline"
                                            id="edit-roadside-branch"
                                            value={field.value}
                                            onChange={(id) => field.onChange(id)}
                                            error={editErrors.branch?.message}
                                        />
                                    )}
                                />
                                <div className="space-y-2">
                                    <Label htmlFor="breakdown_location">Breakdown location *</Label>
                                    <Input id="breakdown_location" {...register("breakdown_location")} />
                                    {editErrors.breakdown_location && (
                                        <p className="text-xs text-destructive">{editErrors.breakdown_location.message}</p>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="customer_phone">Customer phone *</Label>
                                <Input
                                    id="customer_phone"
                                    {...register("customer_phone")}
                                />
                                {editErrors.customer_phone && <p className="text-xs text-destructive">{editErrors.customer_phone.message}</p>}
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
                            {!request.is_covered_by_subscription && (
                                <div className="space-y-2">
                                    <Label htmlFor="charge_amount">Pay As You Go Charge</Label>
                                    <Input
                                        id="charge_amount"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        {...register("charge_amount", { valueAsNumber: true })}
                                    />
                                    {editErrors.charge_amount && <p className="text-xs text-destructive">{editErrors.charge_amount.message}</p>}
                                </div>
                            )}
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

                    <Tabs value={communicationMethod} onValueChange={(value) => setCommunicationMethod(value as CommunicationMethod)} className="w-full">
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
