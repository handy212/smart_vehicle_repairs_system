"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { workordersApi, WorkOrder } from "@/lib/api/workorders";
import { useOfflineStore } from "@/store/offlineStore";
import { workOrdersDB } from "@/lib/offline/db";
import { MobileErrorState } from "@/components/mobile/MobileErrorState";
import { usePullToRefresh } from "@/components/mobile/usePullToRefresh";
import { useAuthStore } from "@/store/authStore";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Wrench, Search, RefreshCw } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { getWorkOrderListBillingDisplay } from "@/lib/workorders/workOrderBillingDisplay";
import { getStatusLabel } from "@/lib/utils/workorder-status";
import { getWorkOrderCustomerDisplayName } from "@/lib/utils/customer-display";
import { getWorkOrderStagePresentation } from "@/lib/utils/workorder-inspection-stage";
import {
  MOBILE_WO_STATUS_FILTERS,
  getMobileWorkOrderStatusBadgeClass,
} from "@/lib/utils/mobile-workorder-filters";

export default function MobileWorkOrdersPage() {
  const { formatCurrency } = useCurrency();
  const searchParams = useSearchParams();
  const { isOnline } = useOfflineStore();
  const user = useAuthStore((s) => s.user);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(
    searchParams.get("status")
  );

  const loadWorkOrders = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      if (isOnline) {
        const params: Parameters<typeof workordersApi.list>[0] = {
          ordering: "-created_at",
        };
        if (statusFilter) {
          params.status = statusFilter;
        }
        if (user?.id) {
          params.primary_technician = user.id;
        }
        const response = await workordersApi.list(params);
        const orders = response.results || [];
        setWorkOrders(orders);

        for (const wo of orders) {
          await workOrdersDB.set(wo.id, wo, true);
        }
      } else {
        const cached = await workOrdersDB.getAll();
        let filtered = cached;
        if (statusFilter) {
          filtered = cached.filter((wo) => wo.status === statusFilter);
        }
        setWorkOrders(filtered);
      }
    } catch {
      const cached = await workOrdersDB.getAll();
      if (cached.length > 0) {
        let filtered = cached;
        if (statusFilter) {
          filtered = cached.filter((wo) => wo.status === statusFilter);
        }
        setWorkOrders(filtered);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [isOnline, statusFilter, user?.id]);

  useEffect(() => {
    loadWorkOrders();
  }, [loadWorkOrders]);

  usePullToRefresh(loadWorkOrders);

  const filteredWorkOrders = workOrders.filter((wo) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      wo.work_order_number?.toLowerCase().includes(searchLower) ||
      wo.vehicle_display?.toLowerCase().includes(searchLower) ||
      wo.customer_name?.toLowerCase().includes(searchLower) ||
      wo.customer_concerns?.toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading work orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <MobileErrorState
          title="Could not load work orders"
          onRetry={loadWorkOrders}
        />
      </div>
    );
  }

  return (
    <MobilePageShell
      title="Work Orders"
      className="space-y-4"
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={loadWorkOrders}
          disabled={loading}
          aria-label="Refresh work orders"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      }
    >
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          placeholder="Search work orders..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
          aria-label="Search work orders"
        />
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-2"
        role="group"
        aria-label="Filter by status"
      >
        {MOBILE_WO_STATUS_FILTERS.map((option) => (
          <Button
            key={option.value || "all"}
            size="sm"
            variant={statusFilter === option.value ? "default" : "outline"}
            onClick={() => setStatusFilter(option.value)}
            className="whitespace-nowrap shrink-0"
            aria-pressed={statusFilter === option.value}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {filteredWorkOrders.length === 0 ? (
        <div className="text-center py-12">
          <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
          <p className="text-muted-foreground">No work orders found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredWorkOrders.map((wo) => {
            const stagePresentation = getWorkOrderStagePresentation(wo);
            return (
            <Link
              key={wo.id}
              href={`/mobile/workorders/${wo.id}`}
              className="block p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-foreground">
                      {wo.work_order_number || `WO #${wo.id}`}
                    </span>
                    {wo.priority === "high" && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-destructive/10 text-destructive">
                        HIGH
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mb-1">
                    {wo.vehicle_display || wo.vehicle_info || "Vehicle"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {getWorkOrderCustomerDisplayName(wo)}
                  </div>
                  {wo.customer_concerns && (
                    <div className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      {wo.customer_concerns}
                    </div>
                  )}
                </div>
                <div className="ml-4 flex flex-col items-end shrink-0">
                  <span
                    className={cn(
                      "px-2 py-1 rounded text-xs font-medium mb-2",
                      getMobileWorkOrderStatusBadgeClass(wo.status)
                    )}
                  >
                    {stagePresentation.label || getStatusLabel(wo.status ?? "")}
                  </span>
                  {(() => {
                    const billing = getWorkOrderListBillingDisplay(wo, {
                      audience: "staff",
                      formatDue: formatCurrency,
                    });
                    if (!billing) return null;
                    return (
                      <div className="text-right">
                        <span className="text-sm font-medium text-foreground">
                          {formatCurrency(billing.amount)}
                        </span>
                        {billing.statusLine && (
                          <span className="block text-xs text-muted-foreground capitalize">
                            {billing.statusLine}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </Link>
            );
          })}
        </div>
      )}
    </MobilePageShell>
  );
}
