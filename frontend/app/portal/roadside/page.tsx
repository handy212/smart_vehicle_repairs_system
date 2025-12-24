"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { roadsideApi, RoadsideRequest } from "@/lib/api/roadside";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench, Plus, MapPin, Clock, CheckCircle, XCircle, AlertCircle, Car, Navigation } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

export default function MyRoadsideRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: requests, isLoading } = useQuery({
    queryKey: ["portal", "roadside", statusFilter],
    queryFn: () => roadsideApi.myRequests(),
  });

  const filteredRequests = requests?.filter((req: RoadsideRequest) => {
    if (statusFilter === "all") return true;
    return req.status === statusFilter;
  }) || [];

  const activeRequests = filteredRequests.filter((req: RoadsideRequest) =>
    req.status && !['completed', 'cancelled', 'failed'].includes(req.status)
  );
  const completedRequests = filteredRequests.filter((req: RoadsideRequest) =>
    req.status === 'completed'
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-48 mb-4" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "success";
      case "requested":
        return "secondary";
      case "dispatched":
      case "en_route":
      case "on_site":
      case "in_progress":
        return "default"; // Primary color for active action
      case "cancelled":
        return "secondary";
      case "failed":
        return "danger";
      default:
        return "secondary";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4" />;
      case "cancelled":
      case "failed":
        return <XCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Roadside Assistance</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            View and track your roadside assistance requests
          </p>
        </div>
        <Link href="/portal/roadside/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Request Assistance
          </Button>
        </Link>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {["all", "requested", "active", "completed", "cancelled"].map((filter) => (
          <Button
            key={filter}
            variant={statusFilter === filter ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(filter)}
            className="capitalize"
          >
            {filter === "active" ? "In Progress" : filter}
          </Button>
        ))}
      </div>

      {/* Active Requests */}
      {activeRequests.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            Active Requests
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeRequests.map((request: RoadsideRequest) => (
              <Card key={request.id} className="hover:shadow-md transition-shadow flex flex-col h-full border-l-4 border-l-primary/80">
                <CardContent className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-lg">{request.request_number}</h3>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(request.requested_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <Badge variant={getStatusVariant(request.status || 'requested')}>
                      {request.status_display || request.status}
                    </Badge>
                  </div>

                  <div className="space-y-3 flex-1">
                    <div className="flex items-start gap-2 text-sm">
                      <Wrench className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <span className="font-medium">{getServiceTypeDisplay(request.service_type)}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <span className="line-clamp-2">{request.breakdown_location}</span>
                    </div>
                    {request.vehicle_display && (
                      <div className="flex items-center gap-2 text-sm">
                        <Car className="w-4 h-4 text-muted-foreground" />
                        <span className="truncate">{request.vehicle_display}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t">
                    <Link href={`/portal/roadside/${request.id}`} className="w-full">
                      <Button className="w-full" variant="secondary">View Status</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Completed Requests */}
      {completedRequests.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Completed History
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {completedRequests.map((request: RoadsideRequest) => (
              <Card key={request.id} className="hover:shadow-md transition-shadow flex flex-col h-full bg-gray-50/50 dark:bg-gray-900/50">
                <CardContent className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-gray-700 dark:text-gray-300">{request.request_number}</h3>
                      <p className="text-xs text-muted-foreground">
                        {request.completed_at ? format(new Date(request.completed_at), "MMM d, yyyy") :
                          format(new Date(request.requested_at), "MMM d, yyyy")}
                      </p>
                    </div>
                    <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
                      Completed
                    </Badge>
                  </div>

                  <div className="space-y-2 flex-1 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-3 h-3" />
                      <span>{getServiceTypeDisplay(request.service_type)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{request.breakdown_location}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t">
                    <Link href={`/portal/roadside/${request.id}`} className="w-full">
                      <Button className="w-full" variant="ghost" size="sm">View Details</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredRequests.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Wrench className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              No Roadside Requests
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              {statusFilter === "all"
                ? "You haven't made any roadside assistance requests yet."
                : `No ${statusFilter} requests found.`}
            </p>
            <Link href="/portal/roadside/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Request Roadside Assistance
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
