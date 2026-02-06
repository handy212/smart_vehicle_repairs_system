"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { roadsideApi, RoadsideRequest } from "@/lib/api/roadside";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    ArrowLeft, MapPin, Phone, Car, Navigation,
    Map as MapIcon, CheckCircle, Clock
} from "lucide-react";
import { toast } from "sonner";

export default function RoadsideDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [request, setRequest] = useState<RoadsideRequest | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        if (id) {
            loadRequest();
        }
    }, [id]);

    const loadRequest = async () => {
        try {
            const data = await roadsideApi.getRequest(id);
            setRequest(data);
        } catch (error) {
            console.error("Failed to load request:", error);
            toast.error("Failed to load request details");
        } finally {
            setLoading(false);
        }
    };

    const handleStatusUpdate = async (action: 'en_route' | 'arrive' | 'complete' | 'in_progress') => {
        if (!request) return;
        setActionLoading(true);
        try {
            let updated: RoadsideRequest;
            if (action === 'en_route') {
                updated = await roadsideApi.enRoute(request.id);
                toast.success("Status updated to En Route");
            } else if (action === 'arrive') {
                updated = await roadsideApi.arrive(request.id);
                toast.success("Marked as Arrived");
            } else if (action === 'in_progress') {
                updated = await roadsideApi.inProgress(request.id);
                toast.success("Started work");
            } else {
                updated = await roadsideApi.complete(request.id);
                toast.success("Job Completed!");
            }
            setRequest(updated);
        } catch (error) {
            console.error(`Failed to update status to ${action}:`, error);
            toast.error("Failed to update status");
        } finally {
            setActionLoading(false);
        }
    };

    const openNavigation = () => {
        if (request?.latitude && request?.longitude) {
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${request.latitude},${request.longitude}`, '_blank');
        } else if (request?.breakdown_location) {
            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(request.breakdown_location)}`, '_blank');
        }
    };

    if (loading) {
        return <div className="p-8 text-center">Loading...</div>;
    }

    if (!request) {
        return <div className="p-8 text-center">Request not found</div>;
    }

    return (
        <div className="pb-24 max-w-md mx-auto min-h-screen bg-muted">
            {/* Header */}
            <div className="bg-card p-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <div className="text-sm text-muted-foreground font-mono">{request.request_number}</div>
                    <h1 className="font-bold text-lg">{request.service_type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</h1>
                </div>
                <div className="ml-auto">
                    <Badge variant={request.status === 'completed' ? 'success' : 'default'} className="uppercase">
                        {request.status.replace('_', ' ')}
                    </Badge>
                </div>
            </div>

            <div className="p-4 space-y-4">
                {/* Map / Location Card */}
                <Card>
                    <CardContent className="p-0">
                        <div className="h-32 bg-border flex items-center justify-center relative overflow-hidden">
                            <MapIcon className="h-12 w-12 text-muted-foreground opacity-50" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-4">
                                <span className="text-white font-medium text-sm truncate w-full">
                                    {request.breakdown_location}
                                </span>
                            </div>
                        </div>
                        <div className="p-4">
                            <Button className="w-full" onClick={openNavigation}>
                                <Navigation className="h-4 w-4 mr-2" />
                                Navigate to Location
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Customer & Vehicle */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Info</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-info dark:text-blue-300 shrink-0">
                                <Phone className="h-4 w-4" />
                            </div>
                            <div className="flex-1">
                                <div className="font-medium">{request.customer_phone}</div>
                                <div className="text-sm text-muted-foreground">{request.customer.first_name} {request.customer.last_name}</div>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => window.open(`tel:${request.customer_phone}`)}>
                                Call
                            </Button>
                        </div>

                        <div className="flex items-start gap-3 border-t border-border pt-3">
                            <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center text-primary dark:text-orange-300 shrink-0">
                                <Car className="h-4 w-4" />
                            </div>
                            <div>
                                <div className="font-medium">{request.vehicle.year} {request.vehicle.make} {request.vehicle.model}</div>
                                <div className="text-sm text-muted-foreground">{request.vehicle.license_plate}</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Description/Notes */}
                {(request.description || request.notes) && (
                    <Card>
                        <CardContent className="p-4 space-y-3">
                            {request.description && (
                                <div>
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Problem Description</h4>
                                    <p className="text-sm">{request.description}</p>
                                </div>
                            )}
                            {request.notes && (
                                <div className="p-3 bg-warning/10 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-900/30 rounded text-sm">
                                    <h4 className="text-xs font-semibold text-warning uppercase mb-1">Notes</h4>
                                    <p className="text-yellow-900 dark:text-yellow-300">{request.notes}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Workflow Action Bar (Fixed Bottom) */}
                {!['completed', 'cancelled', 'failed'].includes(request.status) && (
                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border max-w-md mx-auto">
                        {request.status === 'dispatched' && (
                            <Button
                                className="w-full bg-info hover:bg-blue-700 text-lg py-6"
                                onClick={() => handleStatusUpdate('en_route')}
                                disabled={actionLoading}
                            >
                                Start Trip (En Route)
                            </Button>
                        )}

                        {request.status === 'en_route' && (
                            <Button
                                className="w-full bg-success hover:bg-green-700 text-lg py-6"
                                onClick={() => handleStatusUpdate('arrive')}
                                disabled={actionLoading}
                            >
                                <MapPin className="mr-2" /> Mark Arrived
                            </Button>
                        )}

                        {request.status === 'on_site' && (
                            <Button
                                className="w-full bg-primary hover:bg-orange-700 text-lg py-6"
                                onClick={() => handleStatusUpdate('in_progress')}
                                disabled={actionLoading}
                            >
                                <Clock className="mr-2" /> Start Work
                            </Button>
                        )}

                        {request.status === 'in_progress' && (
                            <Button
                                className="w-full bg-gray-900 hover:bg-gray-800 text-white text-lg py-6"
                                onClick={() => handleStatusUpdate('complete')}
                                disabled={actionLoading}
                            >
                                <CheckCircle className="mr-2" /> Complete Job
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
