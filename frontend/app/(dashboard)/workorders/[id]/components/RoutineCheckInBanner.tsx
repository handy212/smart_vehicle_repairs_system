"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isRoutineMaintenanceWorkOrder } from "@/lib/utils/workorder-workflow-steps";
import { Package, Wrench, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkOrder } from "@/lib/api/workorders";

interface RoutineCheckInBannerProps {
  workOrder: WorkOrder;
  workOrderId: number;
  partsCount?: number;
  tasksCount?: number;
}

export function RoutineCheckInBanner({
  workOrder,
  workOrderId,
  partsCount = 0,
  tasksCount = 0,
}: RoutineCheckInBannerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  const fromCheckIn = searchParams.get("from") === "check-in";
  const routineFlow = searchParams.get("flow") === "routine";
  const isRoutine = isRoutineMaintenanceWorkOrder(workOrder);

  useEffect(() => {
    if (fromCheckIn && routineFlow) {
      setDismissed(false);
    }
  }, [fromCheckIn, routineFlow, workOrderId]);

  const inventorySummary = workOrder.inventory_availability_summary;
  const hasInventoryIssues =
    isRoutine &&
    inventorySummary &&
    (inventorySummary.stock_unavailable_count > 0 ||
      inventorySummary.parts_pending_allocation_count > 0) &&
    ["approved", "draft"].includes(workOrder.status);

  const checkInBannerVisible =
    !dismissed &&
    isRoutine &&
    (fromCheckIn || routineFlow) &&
    ["approved", "in_progress", "draft"].includes(workOrder.status);

  if (!checkInBannerVisible && !hasInventoryIssues) return null;

  const bundleName =
    typeof workOrder.service_bundle === "object" && workOrder.service_bundle
      ? workOrder.service_bundle.name
      : typeof workOrder.service_type === "object" && workOrder.service_type
        ? workOrder.service_type.name
        : "Routine service";

  const goToParts = () => {
    router.push(`/workorders/${workOrderId}?tab=parts`, { scroll: false });
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (fromCheckIn || routineFlow) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("from");
      params.delete("flow");
      const qs = params.toString();
      router.replace(`/workorders/${workOrderId}${qs ? `?${qs}` : ""}`, { scroll: false });
    }
  };

  const statusHint =
    workOrder.status === "approved"
      ? workOrder.inventory_availability_summary?.is_ready_for_service === false
        ? "Allocate required parts before starting service."
        : workOrder.requires_assignment_acceptance
          ? "Accept the technician assignment, then tap Start service when ready."
          : "Assign a technician and tap Start service when ready."
      : workOrder.status === "in_progress"
        ? "Service is underway — install parts and complete tasks."
        : workOrder.status === "draft"
          ? "Applying service package — this job will be ready for service shortly."
          : "Ready for service.";

  return (
    <div className="space-y-2">
      {hasInventoryIssues && inventorySummary && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Parts not ready for service</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {inventorySummary.stock_unavailable_count > 0 && (
                  <>
                    {inventorySummary.stock_unavailable_count} part(s) have insufficient branch stock
                    {inventorySummary.stock_unavailable
                      .slice(0, 3)
                      .map((p) => p.part_name)
                      .join(", ")}
                    {inventorySummary.stock_unavailable_count > 3 ? "…" : ""}.{" "}
                  </>
                )}
                {inventorySummary.parts_pending_allocation_count > 0 && (
                  <>
                    {inventorySummary.parts_pending_allocation_count} part(s) still need allocation before work begins.
                  </>
                )}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={goToParts}>
            Review parts
          </Button>
        </div>
      )}
    {checkInBannerVisible && (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/5 px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <Package className="h-5 w-5 shrink-0 text-success mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Routine service — {bundleName}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Inspection and diagnosis were skipped. Parts ({partsCount}) and service tasks (
            {tasksCount}) are on this job. {statusHint}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={goToParts}>
          <Wrench className="h-3.5 w-3.5 mr-1" />
          Parts & tasks
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="Dismiss routine check-in banner"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
    )}
    </div>
  );
}
