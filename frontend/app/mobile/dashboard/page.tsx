"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  Clock,
  MapPin,
  Navigation,
  Truck,
  Wrench,
} from "lucide-react";
import { format } from "date-fns";
import apiClient from "@/lib/api/client";
import { workordersApi, WorkOrder } from "@/lib/api/workorders";
import { appointmentsApi, Appointment } from "@/lib/api/appointments";
import { roadsideApi, RoadsideRequest } from "@/lib/api/roadside";
import { workOrdersDB, roadsideRequestsDB } from "@/lib/offline/db";
import { useOfflineStore } from "@/store/offlineStore";
import { useAuthStore } from "@/store/authStore";
import { usePullToRefresh } from "@/components/mobile/usePullToRefresh";
import { cn } from "@/lib/utils";
import {
  getMobileWorkOrderStatusBadgeClass,
} from "@/lib/utils/mobile-workorder-filters";
import { getStatusLabel } from "@/lib/utils/workorder-status";
import { MobileErrorState } from "@/components/mobile/MobileErrorState";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { PwaInstallPrompt } from "@/components/mobile/PwaInstallPrompt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WORKSHOP_PANEL_CLASS } from "@/lib/constants/layout";

type DashboardStats = {
  total: number;
  inProgress: number;
  assigned: number;
  completed: number;
};

type ActiveTimeLog = {
  id: number;
  work_order: number;
  work_order_number?: string;
};

const EMPTY_STATS: DashboardStats = {
  total: 0,
  inProgress: 0,
  assigned: 0,
  completed: 0,
};

const ACTIVE_STATUSES = new Set([
  "assigned",
  "diagnosis",
  "in_progress",
  "quality_check",
]);

function getWorkOrderTitle(wo: WorkOrder) {
  return wo.work_order_number || `WO #${wo.id}`;
}

function getVehicleLabel(wo: WorkOrder) {
  return wo.vehicle_display || wo.vehicle_info || "Vehicle details unavailable";
}

function sortNewestFirst(workOrders: WorkOrder[]) {
  return [...workOrders].sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime();
    const bTime = new Date(b.created_at || 0).getTime();
    return bTime - aTime;
  });
}

function calculateStats(workOrders: WorkOrder[]): DashboardStats {
  return {
    total: workOrders.length,
    inProgress: workOrders.filter((wo) => wo.status === "in_progress").length,
    assigned: workOrders.filter((wo) => wo.status === "assigned").length,
    completed: workOrders.filter((wo) => wo.status === "completed").length,
  };
}

function getActiveWorkOrders(workOrders: WorkOrder[]) {
  return workOrders.filter((wo) => ACTIVE_STATUSES.has(wo.status)).slice(0, 3);
}

export default function MobileDashboardPage() {
  const router = useRouter();
  const { isOnline } = useOfflineStore();
  const user = useAuthStore((s) => s.user);
  const techName = user?.first_name || user?.username || "Technician";

  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [activeWorkOrders, setActiveWorkOrders] = useState<WorkOrder[]>([]);
  const [recentWorkOrders, setRecentWorkOrders] = useState<WorkOrder[]>([]);
  const [activeLog, setActiveLog] = useState<ActiveTimeLog | null>(null);
  const [nextAppointment, setNextAppointment] = useState<Appointment | null>(null);
  const [activeRoadside, setActiveRoadside] = useState<RoadsideRequest | null>(null);

  const quickActions = useMemo(
    () => [
      {
        label: "Jobs",
        href: "/mobile/workorders",
        icon: Wrench,
        variant: "outline" as const,
      },
      {
        label: "Schedule",
        href: "/mobile/schedule",
        icon: Calendar,
        variant: "outline" as const,
      },
      {
        label: "Time",
        href: "/mobile/time-tracking",
        icon: Clock,
        variant: "default" as const,
      },
      {
        label: "Roadside",
        href: "/mobile/roadside",
        icon: Truck,
        variant: "outline" as const,
      },
    ],
    []
  );

  const applyWorkOrders = useCallback((workOrders: WorkOrder[]) => {
    const ordered = sortNewestFirst(workOrders);
    setRecentWorkOrders(ordered.slice(0, 5));
    setActiveWorkOrders(getActiveWorkOrders(ordered));
    setStats(calculateStats(ordered));
  }, []);

  const loadFromCache = useCallback(async () => {
    const cached = (await workOrdersDB.getAll()) as WorkOrder[];
    applyWorkOrders(cached);
    setUsingCachedData(cached.length > 0);
    return cached.length > 0;
  }, [applyWorkOrders]);

  const checkActiveLog = useCallback(async () => {
    if (!isOnline) {
      setActiveLog(null);
      return;
    }

    try {
      const response = await apiClient.get<ActiveTimeLog | null>(
        "/workorders/time-logs/active/"
      );
      setActiveLog(response.data || null);
    } catch {
      setActiveLog(null);
    }
  }, [isOnline]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      if (!isOnline) {
        const hasCachedData = await loadFromCache();
        const roadsideCached = await roadsideRequestsDB.getAll();
        const activeRs = roadsideCached.find(
          (r) => !["completed", "cancelled", "failed"].includes(r.status)
        );
        setActiveRoadside(activeRs || null);
        setNextAppointment(null);
        setLoadError(!hasCachedData);
        return;
      }

      const listParams: Parameters<typeof workordersApi.list>[0] = {
        page: 1,
        ordering: "-created_at",
      };
      if (user?.id) {
        listParams.primary_technician = user.id;
      }

      const [statsResult, workOrdersResult, scheduleResult, roadsideResult] =
        await Promise.allSettled([
          workordersApi.dashboardStats(),
          workordersApi.list(listParams),
          appointmentsApi.mySchedule(format(new Date(), "yyyy-MM-dd")),
          roadsideApi.getMyAssignments(),
        ]);

      if (workOrdersResult.status === "fulfilled") {
        const workOrders = workOrdersResult.value.results || [];
        applyWorkOrders(workOrders);
        setUsingCachedData(false);
        await Promise.all(
          workOrders.map((wo) => workOrdersDB.set(wo.id, wo, true))
        );
      } else {
        const hasCachedData = await loadFromCache();
        if (!hasCachedData) {
          throw workOrdersResult.reason;
        }
      }

      if (statsResult.status === "fulfilled" && workOrdersResult.status !== "fulfilled") {
        setStats((current) => ({
          ...current,
          total: statsResult.value.total_workorders ?? current.total,
          inProgress: statsResult.value.in_progress ?? 0,
          assigned: statsResult.value.pending ?? 0,
          completed: statsResult.value.completed ?? 0,
        }));
      }

      if (scheduleResult.status === "fulfilled") {
        const now = new Date();
        const upcoming = (scheduleResult.value.appointments || [])
          .filter((a) => !["cancelled", "completed"].includes(a.status))
          .sort((a, b) =>
            `${a.appointment_time}`.localeCompare(`${b.appointment_time}`)
          );
        const next =
          upcoming.find((a) => {
            const t = a.appointment_time?.slice(0, 5) || "23:59";
            const [h, m] = t.split(":").map(Number);
            const apt = new Date();
            apt.setHours(h, m, 0, 0);
            return apt >= now;
          }) || upcoming[0] || null;
        setNextAppointment(next);
      } else {
        setNextAppointment(null);
      }

      if (roadsideResult.status === "fulfilled") {
        const list = roadsideResult.value;
        const active =
          list.find((r) => r.my_assignment_status === "pending") ||
          list.find((r) => !["completed", "cancelled", "failed"].includes(r.status));
        setActiveRoadside(active || null);
        await roadsideRequestsDB.replaceAll(roadsideResult.value);
      }
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      const hasCachedData = await loadFromCache();
      setLoadError(!hasCachedData);
    } finally {
      setLoading(false);
    }
  }, [applyWorkOrders, isOnline, loadFromCache, user?.id]);

  useEffect(() => {
    loadData();
    checkActiveLog();
  }, [checkActiveLog, loadData]);

  usePullToRefresh(async () => {
    await loadData();
    await checkActiveLog();
  });

  const pageDescription = `Technician · ${isOnline ? "Online" : "Offline mode"}`;

  if (loading) {
    return (
      <MobilePageShell
        title={`Hi, ${techName}`}
        description={pageDescription}
        className="space-y-4"
      >
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
            <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </MobilePageShell>
    );
  }

  if (loadError) {
    return (
      <MobilePageShell
        title={`Hi, ${techName}`}
        description={pageDescription}
        className="space-y-4"
      >
        <MobileErrorState title="Could not load dashboard" onRetry={loadData} />
      </MobilePageShell>
    );
  }

  return (
    <MobilePageShell
      title={`Hi, ${techName}`}
      description={pageDescription}
      className="space-y-4"
    >
      {(usingCachedData || !isOnline) && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning dark:border-warning/30 dark:bg-warning/15 dark:text-warning">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {isOnline
              ? "Showing cached work orders while the server recovers."
              : "Showing saved work orders. Sync when you are back online."}
          </span>
        </div>
      )}

      {activeRoadside && (
        <div className={cn(WORKSHOP_PANEL_CLASS, "space-y-2 border-warning/40 p-4")}>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            {activeRoadside.my_assignment_status === "pending"
              ? "Roadside — needs your response"
              : "Active roadside"}
          </p>
          <p className="text-sm font-semibold">
            {activeRoadside.request_number} —{" "}
            {activeRoadside.my_assignment_status === "pending"
              ? "Accept or decline"
              : activeRoadside.status.replace(/_/g, " ")}
          </p>
          <p className="flex items-start gap-1 text-xs text-muted-foreground line-clamp-2">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
            {activeRoadside.breakdown_location}
          </p>
          <div className="flex gap-2">
            <Link href={`/mobile/roadside/${activeRoadside.id}`} className="flex-1">
              <Button size="sm" className="w-full" variant="default">
                {activeRoadside.my_assignment_status === "pending" ? "Respond" : "Open Job"}
              </Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const r = activeRoadside;
                if (r.latitude && r.longitude) {
                  window.open(
                    `https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude}`,
                    "_blank"
                  );
                } else if (r.breakdown_location) {
                  window.open(
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.breakdown_location)}`,
                    "_blank"
                  );
                }
              }}
            >
              <Navigation className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {activeLog && (
        <div
          className={cn(
            WORKSHOP_PANEL_CLASS,
            "flex items-center justify-between gap-3 border-primary/50 bg-primary/5 p-4 dark:bg-primary/10"
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-full bg-primary/20 p-2">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                Currently Clocked In
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {activeLog.work_order_number || `WO #${activeLog.work_order}`}
              </div>
            </div>
          </div>
          <Button size="sm" onClick={() => router.push("/mobile/time-tracking")}>
            View
          </Button>
        </div>
      )}

      {nextAppointment && (
        <div className={cn(WORKSHOP_PANEL_CLASS, "p-4")}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Next appointment
              </p>
              <p className="mt-1 font-semibold text-foreground">
                {nextAppointment.appointment_time?.slice(0, 5)} —{" "}
                {nextAppointment.customer_name || "Customer"}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {nextAppointment.vehicle_display || nextAppointment.vehicle_info}
              </p>
            </div>
            <Link href="/mobile/schedule">
              <Button size="sm" variant="outline">
                <Calendar className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.href}
              onClick={() => router.push(action.href)}
              variant={action.variant}
              className="h-[76px] min-w-0 flex-col gap-2 px-1"
              aria-label={`Open ${action.label.toLowerCase()}`}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate text-xs font-medium">
                {action.label}
              </span>
            </Button>
          );
        })}
      </div>

      <div
        className={cn(
          WORKSHOP_PANEL_CLASS,
          "grid grid-cols-4 divide-x divide-border overflow-hidden py-3 text-center"
        )}
      >
        <Metric label="Total" value={stats.total} />
        <Metric label="Active" value={stats.inProgress} valueClassName="text-primary" />
        <Metric label="Assigned" value={stats.assigned} valueClassName="text-primary" />
        <Metric label="Completed" value={stats.completed} valueClassName="text-success" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Active Jobs</CardTitle>
            <Link href="/mobile/workorders">
              <Button variant="ghost" size="sm" className="h-8 text-xs">
                View All
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {activeWorkOrders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              No active work orders right now
            </div>
          ) : (
            activeWorkOrders.map((wo) => <WorkOrderRow key={wo.id} wo={wo} />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Recent Work Orders</CardTitle>
            {recentWorkOrders.length > 0 && (
              <Link href="/mobile/workorders">
                <Button variant="ghost" size="sm" className="h-8 text-xs">
                  View All
                </Button>
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {recentWorkOrders.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No work orders found
            </p>
          ) : (
            <div className="space-y-2">
              {recentWorkOrders.map((wo) => (
                <WorkOrderRow key={wo.id} wo={wo} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PwaInstallPrompt />
    </MobilePageShell>
  );
}

function Metric({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="px-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-lg font-bold tabular-nums text-foreground",
          valueClassName
        )}
      >
        {value}
      </p>
    </div>
  );
}

function WorkOrderRow({ wo }: { wo: WorkOrder }) {
  return (
    <Link
      href={`/mobile/workorders/${wo.id}`}
      className="block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {getWorkOrderTitle(wo)}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {getVehicleLabel(wo)}
          </div>
          {wo.customer_name && (
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {wo.customer_name}
            </div>
          )}
        </div>
        <Badge
          className={cn(
            "shrink-0 whitespace-nowrap text-xs",
            getMobileWorkOrderStatusBadgeClass(wo.status)
          )}
        >
          {getStatusLabel(wo.status ?? "")}
        </Badge>
      </div>
    </Link>
  );
}
