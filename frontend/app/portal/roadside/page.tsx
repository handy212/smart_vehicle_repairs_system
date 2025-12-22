"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { roadsideApi, RoadsideRequest } from "@/lib/api/roadside";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench, Plus, MapPin, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";

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
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by status:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Requests</option>
          <option value="requested">Requested</option>
          <option value="dispatched">Dispatched</option>
          <option value="en_route">En Route</option>
          <option value="on_site">On Site</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Active Requests */}
      {activeRequests.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Active Requests</h2>
          {activeRequests.map((request: RoadsideRequest) => (
            <Card key={request.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {request.request_number}
                      </h3>
                      <Badge variant={getStatusVariant(request.status || 'requested')}>
                        {getStatusIcon(request.status || 'requested')}
                        <span className="ml-1">{request.status_display || request.status}</span>
                      </Badge>
                      {request.is_covered_by_subscription && (
                        <Badge variant="success" className="text-xs">
                          Covered by Subscription
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center gap-2">
                        <Wrench className="w-4 h-4" />
                        <span className="font-medium">{getServiceTypeDisplay(request.service_type)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        <span>{request.breakdown_location}</span>
                      </div>
                      {request.vehicle_display && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Vehicle:</span>
                          <span>{request.vehicle_display}</span>
                        </div>
                      )}
                      {request.tow_distance_km && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Distance:</span>
                          <span>{request.tow_distance_km} km</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>Requested: {format(new Date(request.requested_at), "MMM dd, yyyy 'at' h:mm a")}</span>
                      </div>
                      {request.assigned_technician_name && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Service Provider:</span>
                          <span>{request.assigned_technician_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Link href={`/portal/roadside/${request.id}`}>
                    <Button variant="secondary">View Details</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Completed Requests */}
      {completedRequests.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Completed Requests</h2>
          {completedRequests.map((request: RoadsideRequest) => (
            <Card key={request.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {request.request_number}
                      </h3>
                      <Badge variant="success">
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Completed
                      </Badge>
                      {request.is_covered_by_subscription && (
                        <Badge variant="success" className="text-xs">
                          Covered by Subscription
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center gap-2">
                        <Wrench className="w-4 h-4" />
                        <span className="font-medium">{getServiceTypeDisplay(request.service_type)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        <span>{request.breakdown_location}</span>
                      </div>
                      {request.completed_at && (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>Completed: {format(new Date(request.completed_at), "MMM dd, yyyy 'at' h:mm a")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Link href={`/portal/roadside/${request.id}`}>
                    <Button variant="secondary">View Details</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
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
