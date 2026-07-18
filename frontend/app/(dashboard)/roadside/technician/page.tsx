"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { roadsideApi, RoadsideRequest } from "@/lib/api/roadside";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Truck, MapPin, Phone, Navigation,
    CheckCircle, Clock, ExternalLink,
    Wrench
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import Link from "next/link";
import { getUserFacingError } from "@/lib/api/errors";

export default function TechnicianRoadsideDashboard() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data: user } = useCurrentUser();

    const { data: myRequests, isLoading } = useQuery({
        queryKey: ["roadside", "technician", user?.id],
        queryFn: () => roadsideApi.list({
            assigned_technician: user?.id,
            status: "requested,dispatched,en_route,on_site,in_progress" // Active statuses
        }),
        enabled: !!user?.id,
    });

    const statusUpdateMutation = useMutation({
        mutationFn: ({ requestId, action }: { requestId: number; action: string }) => {
            switch (action) {
                case 'en_route': return roadsideApi.enRoute(requestId);
                case 'arrive': return roadsideApi.arrive(requestId);
                case 'in_progress': return roadsideApi.inProgress(requestId);
                case 'complete': return roadsideApi.complete(requestId);
                default: throw new Error("Invalid action");
            }
        },
        onSuccess: (_, { action }) => {
            queryClient.invalidateQueries({ queryKey: ["roadside"] });
            toast({
                title: "Status Updated",
                description: `Successfully marked as ${action.replace('_', ' ')}`,
                variant: "success"
            });
        },

        onError: (error: unknown) => {
            toast({
                title: "Update Failed",
                description: getUserFacingError(error, "Failed to update status"),
                variant: "destructive"
            });
        }
    });

    if (isLoading) {
        return <div className="p-8 text-center">Loading assigned requests...</div>;
    }

    const activeRequests = myRequests?.results || [];

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">Technician Portal</h1>
                    <p className="text-sm text-muted-foreground">Your assigned roadside assistance calls</p>
                </div>
                <Badge variant="info" className="text-[10px] px-2 py-0.5 font-medium border shadow-none uppercase tracking-wider">
                    Live Updates
                </Badge>
            </div>

            {activeRequests.length === 0 ? (
                <Card className="border-dashed border-2 bg-muted/50">
                    <CardContent className="py-12 flex flex-col items-center justify-center text-center">
                        <Truck className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-bold text-card-foreground">No Active Assignments</h3>
                        <p className="text-sm text-muted-foreground mt-2 max-w-xs">
                            You do not have any active roadside requests assigned to you at the moment.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {activeRequests.map((request) => (
                        <TechnicianRequestCard
                            key={request.id}
                            request={request}
                            onUpdate={(action) => statusUpdateMutation.mutate({ requestId: request.id, action })}
                            isUpdating={statusUpdateMutation.isPending}
                        />
                    ))}
                </div>
            )}

            <div className="bg-primary rounded-2xl p-6 text-white overflow-hidden relative">
                <div className="relative z-10">
                    <h3 className="text-lg font-bold mb-1">Safety First!</h3>
                    <p className="text-white/80 text-sm mb-4">Always wear your high-visibility vest and set up warning triangles immediately upon arrival.</p>
                    <Button variant="outline" size="sm" className="h-9 bg-card/10 border-card/20 text-white hover:bg-card/20">
                        Safety Checklist
                    </Button>
                </div>
                <Truck className="absolute -right-8 -bottom-8 h-40 w-40 opacity-10 rotate-12" />
            </div>
        </div>
    );
}

function TechnicianRequestCard({ request, onUpdate, isUpdating }: {
    request: RoadsideRequest,
    onUpdate: (action: string) => void,
    isUpdating: boolean
}) {
    const getNextAction = () => {
        switch (request.status) {
            case 'dispatched':
                return { label: 'Go to Breakdown', action: 'en_route', icon: Navigation, color: 'bg-warning hover:bg-warning' };
            case 'en_route':
                return { label: 'I Have Arrived', action: 'arrive', icon: MapPin, color: 'bg-info hover:bg-info' };
            case 'on_site':
                return { label: 'Start Service', action: 'in_progress', icon: Wrench, color: 'bg-primary hover:bg-primary-container' };
            case 'in_progress':
                return { label: 'Job Completed', action: 'complete', icon: CheckCircle, color: 'bg-success hover:bg-success' };
            default:
                return null;
        }
    };

    const nextAction = getNextAction();

    return (
        <Card className="overflow-hidden border-none shadow-premium bg-card">
            <div className="h-1.5 bg-gradient-to-r from-primary to-primary-container"></div>
            <CardHeader className="pb-3 flex flex-row items-start justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Badge variant="info" className="text-[10px] px-2 py-0.5 border shadow-none font-medium">{request.status_display}</Badge>
                        <span className="text-[10px] font-bold text-muted-foreground tracking-tighter uppercase">{request.request_number}</span>
                    </div>
                    <CardTitle className="text-xl font-bold">{request.service_type_display}</CardTitle>
                    <CardDescription className="flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" /> {format(new Date(request.requested_at), "h:mm a")} • {request.customer_name}
                    </CardDescription>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary/10 dark:bg-warning/20 flex items-center justify-center text-primary">
                    <Truck className="h-5 w-5" />
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="p-3 bg-muted/50 rounded-xl space-y-3">
                    <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                            <div className="text-[10px] font-bold uppercase text-muted-foreground leading-none mb-1">Breakdown Location</div>
                            <div className="text-sm font-bold leading-tight">{request.breakdown_location}</div>
                            {request.latitude && request.longitude && (
                                <a
                                    href={`https://www.google.com/maps?q=${request.latitude},${request.longitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary flex items-center gap-1 mt-1 font-bold"
                                >
                                    OPEN IN GOOGLE MAPS <ExternalLink className="h-3 w-3" />
                                </a>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border">
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-success/15 flex items-center justify-center text-success">
                                <Phone className="h-4 w-4" />
                            </div>
                            <div className="text-sm font-bold">{request.customer_phone}</div>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="h-8 bg-success hover:bg-success text-white border-none font-bold text-xs"
                            onClick={() => window.open(`tel:${request.customer_phone}`)}
                        >
                            CALL CUSTOMER
                        </Button>
                    </div>
                </div>

                {nextAction && (
                    <Button
                        disabled={isUpdating}
                        className={`w-full h-12 text-lg font-bold gap-2 ${nextAction.color} shadow-lg shadow-primary/10`}
                        onClick={() => onUpdate(nextAction.action)}
                    >
                        <nextAction.icon className="h-5 w-5" />
                        {nextAction.label}
                    </Button>
                )}

                <Link href={`/roadside/${request.id}`} className="block">
                    <Button variant="ghost" size="sm" className="w-full text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                        View Detailed History
                    </Button>
                </Link>
            </CardContent>
        </Card>
    );
}
