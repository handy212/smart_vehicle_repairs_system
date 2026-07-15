"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { roadsideApi, RoadsideRequest } from "@/lib/api/roadside";
import { roadsideRequestsDB } from "@/lib/offline/db";
import { useOfflineStore } from "@/store/offlineStore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, MapPin, Truck, ChevronRight, Phone } from "lucide-react";
import { toast } from "@/lib/toast";
import { usePullToRefresh } from "@/components/mobile/usePullToRefresh";
import { cn } from "@/lib/utils";

type FilterTab = "active" | "recent";

export default function RoadsideListPage() {
  const router = useRouter();
  const { isOnline } = useOfflineStore();
  const [requests, setRequests] = useState<RoadsideRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("active");
  const [usingCache, setUsingCache] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      if (isOnline) {
        const data = await roadsideApi.getMyAssignments();
        setRequests(data);
        setUsingCache(false);
        await roadsideRequestsDB.replaceAll(data);
      } else {
        const cached = await roadsideRequestsDB.getAll();
        setRequests(cached);
        setUsingCache(cached.length > 0);
      }
    } catch {
      const cached = await roadsideRequestsDB.getAll();
      if (cached.length > 0) {
        setRequests(cached);
        setUsingCache(true);
      } else {
        toast.error("Failed to load your roadside jobs");
      }
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  usePullToRefresh(loadRequests);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "requested":
        return "warning";
      case "dispatched":
      case "en_route":
        return "info";
      case "on_site":
      case "in_progress":
        return "default";
      case "completed":
        return "success";
      case "cancelled":
        return "secondary";
      case "failed":
        return "danger";
      default:
        return "secondary";
    }
  };

  const activeRequests = requests.filter(
    (r) => !["completed", "cancelled", "failed"].includes(r.status)
  );
  const recentCompleted = requests.filter((r) =>
    ["completed", "cancelled", "failed"].includes(r.status)
  );

  const displayed = filter === "active" ? activeRequests : recentCompleted;

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">My roadside jobs</h2>
          <p className="text-xs text-muted-foreground">Assignments only · last 14 days when completed</p>
        </div>
        <Button size="sm" variant="outline" onClick={loadRequests} disabled={loading} aria-label="Refresh">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {usingCache && (
        <p className="text-xs text-warning dark:text-warning">
          Showing cached jobs{!isOnline ? " (offline)" : ""}.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={filter === "active" ? "default" : "outline"}
          onClick={() => setFilter("active")}
        >
          Active ({activeRequests.length})
        </Button>
        <Button
          size="sm"
          variant={filter === "recent" ? "default" : "outline"}
          onClick={() => setFilter("recent")}
        >
          Recent ({recentCompleted.length})
        </Button>
      </div>

      <div className="space-y-3">
        {displayed.length === 0 && !loading && (
          <div className="rounded-lg border border-dashed border-border bg-muted py-8 text-center text-muted-foreground">
            <Truck className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p>{filter === "active" ? "No active assignments" : "No recent completed jobs"}</p>
          </div>
        )}

        {displayed.map((req) => {
          const needsResponse = req.my_assignment_status === "pending";
          const vehicleLabel =
            typeof req.vehicle === "object"
              ? `${req.vehicle.year} ${req.vehicle.make} ${req.vehicle.model}`
              : "Vehicle";
          const customerLabel =
            typeof req.customer === "object"
              ? `${req.customer.first_name ?? ""} ${req.customer.last_name ?? ""}`.trim() ||
                "Customer"
              : "Customer";

          return (
            <Card
              key={req.id}
              className={cn(
                "cursor-pointer overflow-hidden border-l-4 border-l-warning transition-all hover:shadow-md",
              )}
              onClick={() => router.push(`/mobile/roadside/${req.id}`)}
            >
              <CardContent className="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  {needsResponse ? (
                    <Badge variant="warning" className="uppercase">
                      Respond now
                    </Badge>
                  ) : (
                    <Badge variant={getStatusVariant(req.status)} className="uppercase">
                      {req.status.replace("_", " ")}
                    </Badge>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">{req.request_number}</span>
                </div>
                <h3 className="mb-1 text-lg font-bold text-foreground">
                  {req.service_type.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </h3>
                <div className="mb-3 space-y-1.5 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="line-clamp-2">{req.breakdown_location}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 shrink-0" />
                    <span>{vehicleLabel}</span>
                  </div>
                  {req.customer_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 shrink-0" />
                      <span>{req.customer_phone}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-sm font-medium">{customerLabel}</span>
                  <span className="flex items-center text-sm text-primary">
                    Open <ChevronRight className="ml-1 h-4 w-4" />
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
