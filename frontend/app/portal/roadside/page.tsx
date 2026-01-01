"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { roadsideApi, RoadsideRequest } from "@/lib/api/roadside";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench, Plus, MapPin, Clock, CheckCircle, XCircle, Navigation, Car } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalList } from "../components/PortalList";
import { PortalCard } from "../components/PortalCard";

export default function MyRoadsideRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: requests, isLoading } = useQuery({
    queryKey: ["portal", "roadside", statusFilter],
    queryFn: () => roadsideApi.myRequests(),
  });

  const filteredRequests = (requests || []).filter((req: RoadsideRequest) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "active") return req.status && !['completed', 'cancelled', 'failed'].includes(req.status);
    return req.status === statusFilter;
  });

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed": return "success";
      case "requested": return "secondary";
      case "dispatched":
      case "en_route":
      case "on_site":
      case "in_progress": return "default";
      case "cancelled": return "secondary";
      case "failed": return "danger";
      default: return "secondary";
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
    <div>
      <PortalPageHeader
        title="Roadside Assistance"
        description="View and track your roadside assistance requests"
        action={
          <Link href="/portal/roadside/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Request Assistance
            </Button>
          </Link>
        }
      />

      {/* Filter */}
      <div className="flex flex-wrap gap-2 mt-6 mb-6">
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

      <PortalList
        data={filteredRequests}
        isLoading={isLoading}
        emptyMessage={
          statusFilter === "all"
            ? "You haven't made any roadside assistance requests yet."
            : `No ${statusFilter} requests found.`
        }
        emptyAction={
          statusFilter === "all" ? (
            <Link href="/portal/roadside/new">
              <Button className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Request Roadside Assistance
              </Button>
            </Link>
          ) : undefined
        }
        columns={[
          {
            header: "Request #",
            cell: (req) => (
              <div className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
                {req.request_number}
              </div>
            )
          },
          {
            header: "Date",
            cell: (req) => (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {format(new Date(req.requested_at), "MMM d, h:mm a")}
              </div>
            )
          },
          {
            header: "Service",
            cell: (req) => (
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-gray-400" />
                <span>{getServiceTypeDisplay(req.service_type)}</span>
              </div>
            )
          },
          {
            header: "Location",
            className: "hidden md:table-cell max-w-[200px]",
            cell: (req) => (
              <div className="flex items-center gap-2" title={req.breakdown_location}>
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="truncate">{req.breakdown_location}</span>
              </div>
            )
          },
          {
            header: "Status",
            cell: (req) => (
              <Badge variant={getStatusVariant(req.status || 'requested')}>
                {req.status_display || req.status}
              </Badge>
            )
          },
          {
            header: "Action",
            className: "text-right",
            cell: (req) => (
              <Link href={`/portal/roadside/${req.id}`}>
                <Button variant="ghost" size="sm">
                  View
                </Button>
              </Link>
            )
          }
        ]}
        renderMobileItem={(req) => (
          <PortalCard
            key={req.id}
            href={`/portal/roadside/${req.id}`}
            icon={<Navigation className="w-5 h-5 text-blue-500" />}
            title={`${req.request_number} • ${getServiceTypeDisplay(req.service_type)}`}
            subtitle={format(new Date(req.requested_at), "MMM d, h:mm a")}
            status={
              <Badge variant={getStatusVariant(req.status || 'requested')} className="text-[10px] h-5 px-1.5">
                {req.status_display || req.status}
              </Badge>
            }
          >
            <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
              <MapPin className="w-3 h-3 mt-0.5" />
              <span className="line-clamp-1">{req.breakdown_location}</span>
            </div>
          </PortalCard>
        )}
      />
    </div>
  );
}
