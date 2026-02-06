"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { roadsideApi, RoadsideRequest } from "@/lib/api/roadside";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, MapPin, Truck, Phone, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function RoadsideListPage() {
    const router = useRouter();
    const [requests, setRequests] = useState<RoadsideRequest[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadRequests();
    }, []);

    const loadRequests = async () => {
        setLoading(true);
        try {
            const data = await roadsideApi.getAssignedRequests();
            setRequests(data);
        } catch (error) {
            console.error("Failed to load roadside requests:", error);
            toast.error("Failed to load requests");
        } finally {
            setLoading(false);
        }
    };

    const getStatusVariant = (status: string) => {
        switch (status) {
            case 'requested': return 'warning';
            case 'dispatched': return 'info';
            case 'en_route': return 'info';
            case 'on_site': return 'default';
            case 'in_progress': return 'default';
            case 'completed': return 'success';
            case 'cancelled': return 'secondary';
            case 'failed': return 'danger';
            default: return 'secondary';
        }
    };

    const activeRequests = requests.filter(r => !['completed', 'cancelled', 'failed'].includes(r.status));
    const pastRequests = requests.filter(r => ['completed', 'cancelled', 'failed'].includes(r.status));

    return (
        <div className="p-4 space-y-4 max-w-md mx-auto pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-foreground">
                    Roadside Jobs
                </h2>
                <Button size="sm" variant="outline" onClick={loadRequests} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            {/* Active Requests */}
            <div className="space-y-3">
                {activeRequests.length === 0 && !loading && (
                    <div className="text-center py-8 text-gray-500 bg-muted rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                        <Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No active jobs assigned</p>
                    </div>
                )}

                {activeRequests.map((req) => (
                    <Card
                        key={req.id}
                        className="overflow-hidden border-l-4 border-l-orange-500 hover:shadow-md transition-all cursor-pointer"
                        onClick={() => router.push(`/mobile/roadside/${req.id}`)}
                    >
                        <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                                <Badge variant={getStatusVariant(req.status)} className="uppercase">
                                    {req.status.replace('_', ' ')}
                                </Badge>
                                <span className="text-xs text-gray-500 font-mono">
                                    {req.request_number}
                                </span>
                            </div>

                            <h3 className="font-bold text-lg text-foreground mb-1">
                                {req.service_type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                            </h3>

                            <div className="space-y-1.5 text-sm text-muted-foreground mb-3">
                                <div className="flex items-start gap-2">
                                    <MapPin className="h-4 w-4 mt-0.5 text-gray-400 shrink-0" />
                                    <span className="line-clamp-2">{req.breakdown_location}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Truck className="h-4 w-4 text-gray-400 shrink-0" />
                                    <span>{req.vehicle.year} {req.vehicle.make} {req.vehicle.model}</span>
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-border">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    {req.customer.first_name} {req.customer.last_name}
                                </div>
                                <Button size="sm" variant="ghost" className="h-8 pr-0 hover:bg-transparent text-primary">
                                    View <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Past Requests (Collapsed or simple list) */}
            {pastRequests.length > 0 && (
                <div className="pt-6">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
                        Recent History
                    </h3>
                    <div className="space-y-2">
                        {pastRequests.slice(0, 5).map((req) => (
                            <div
                                key={req.id}
                                className="flex items-center justify-between p-3 bg-card rounded-lg border border-border opacity-75"
                                onClick={() => router.push(`/mobile/roadside/${req.id}`)}
                            >
                                <div>
                                    <div className="font-medium text-sm">{req.service_type.replace('_', ' ')}</div>
                                    <div className="text-xs text-gray-500">{new Date(req.created_at).toLocaleDateString()}</div>
                                </div>
                                <Badge variant={getStatusVariant(req.status)} className="scale-90">
                                    {req.status}
                                </Badge>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
