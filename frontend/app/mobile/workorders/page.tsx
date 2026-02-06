"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { workordersApi, WorkOrder } from "@/lib/api/workorders";
import { useOfflineStore } from "@/store/offlineStore";
import { workOrdersDB } from "@/lib/offline/db";
import { Wrench, Search, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function MobileWorkOrdersPage() {
  const searchParams = useSearchParams();
  const { isOnline } = useOfflineStore();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(
    searchParams.get("status")
  );

  useEffect(() => {
    loadWorkOrders();
  }, [statusFilter]);

  const loadWorkOrders = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        const params: any = {};
        if (statusFilter) {
          params.status = statusFilter;
        }
        const response = await workordersApi.list(params);
        const orders = response.results || [];
        setWorkOrders(orders);

        // Cache work orders
        for (const wo of orders) {
          await workOrdersDB.set(wo.id, wo, true);
        }
      } else {
        // Load from cache
        const cached = await workOrdersDB.getAll();
        let filtered = cached;
        if (statusFilter) {
          filtered = cached.filter((wo) => wo.status === statusFilter);
        }
        setWorkOrders(filtered);
      }
    } catch (error) {
      console.error("Failed to load work orders:", error);
    } finally {
      setLoading(false);
    }
  };

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

  const statusOptions = [
    { value: null, label: "All" },
    { value: "pending", label: "Pending" },
    { value: "in_progress", label: "In Progress" },
    { value: "waiting_for_parts", label: "Waiting for Parts" },
    { value: "completed", label: "Completed" },
  ];

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">
          Work Orders
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={loadWorkOrders}
          disabled={loading}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search work orders..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {statusOptions.map((option) => (
          <Button
            key={option.value || "all"}
            size="sm"
            variant={statusFilter === option.value ? "default" : "outline"}
            onClick={() => setStatusFilter(option.value)}
            className="whitespace-nowrap"
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* Work Orders List */}
      {filteredWorkOrders.length === 0 ? (
        <div className="text-center py-12">
          <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            No work orders found
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredWorkOrders.map((wo) => (
            <Link
              key={wo.id}
              href={`/mobile/workorders/${wo.id}`}
              className="block p-4 rounded-lg border border-border bg-card hover:bg-muted dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-foreground">
                      {wo.work_order_number || `WO #${wo.id}`}
                    </span>
                    {wo.priority === "high" && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                        HIGH
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mb-1">
                    {wo.vehicle_display || wo.vehicle_info || "Vehicle"}
                  </div>
                  {wo.customer_name && (
                    <div className="text-sm text-muted-foreground">
                      {wo.customer_name}
                    </div>
                  )}
                  {wo.customer_concerns && (
                    <div className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      {wo.customer_concerns}
                    </div>
                  )}
                </div>
                <div className="ml-4 flex flex-col items-end">
                  <span
                    className={cn(
                      "px-2 py-1 rounded text-xs font-medium mb-2",
                      wo.status === "in_progress" &&
                      "bg-orange-100 text-primary dark:bg-orange-900 dark:text-orange-300",
                      wo.status === "pending" &&
                      "bg-orange-100 text-primary dark:bg-orange-900 dark:text-orange-300",
                      wo.status === "waiting_for_parts" &&
                      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
                      wo.status === "completed" &&
                      "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    )}
                  >
                    {wo.status?.replace("_", " ").toUpperCase()}
                  </span>
                  {wo.total_cost && (
                    <span className="text-sm font-medium text-foreground">
                      {wo.total_cost}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

