"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, ClipboardCheck, Play } from "lucide-react";
import { inspectionsApi, VehicleInspection } from "@/lib/api/inspections";
import { useOfflineStore } from "@/store/offlineStore";
import { inspectionsDB } from "@/lib/offline/db";
import { Button } from "@/components/ui/button";
import { MobileErrorState } from "@/components/mobile/MobileErrorState";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<string, string> = {
  in_progress: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export default function MobileInspectionDetailPage() {
  const params = useParams();
  const inspectionId = Number(params.id);
  const { isOnline } = useOfflineStore();
  const [inspection, setInspection] = useState<VehicleInspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadInspection = useCallback(async () => {
    if (!inspectionId || Number.isNaN(inspectionId)) {
      setError(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);
    try {
      if (isOnline) {
        const data = await inspectionsApi.get(inspectionId);
        setInspection(data);
        await inspectionsDB.set(inspectionId, data, true);
      } else {
        const cached = await inspectionsDB.get(inspectionId);
        if (cached) {
          setInspection(cached);
        } else {
          setError(true);
        }
      }
    } catch {
      const cached = await inspectionsDB.get(inspectionId);
      if (cached) {
        setInspection(cached);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [inspectionId, isOnline]);

  useEffect(() => {
    loadInspection();
  }, [loadInspection]);

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading inspection...</p>
        </div>
      </div>
    );
  }

  if (error || !inspection) {
    return (
      <div className="p-4">
        <Link href="/mobile/inspections">
          <Button variant="ghost" size="sm" className="mb-2" aria-label="Back to inspections">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <MobileErrorState
          title="Inspection not found"
          message="This inspection could not be loaded. It may have been removed or you may be offline without a cached copy."
          onRetry={loadInspection}
        />
      </div>
    );
  }

  const canPerform = inspection.status === "in_progress";
  const statusClass = STATUS_BADGE[inspection.status] ?? "bg-muted text-muted-foreground";

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link href="/mobile/inspections">
          <Button variant="ghost" size="icon" aria-label="Back to inspections">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-foreground flex-1">
          Inspection #{inspection.id}
        </h1>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <span className="font-medium text-foreground">
              {inspection.template_name || "Vehicle inspection"}
            </span>
          </div>
          <span className={cn("px-2 py-1 rounded text-xs font-medium shrink-0", statusClass)}>
            {inspection.status?.replace(/_/g, " ")}
          </span>
        </div>

        {inspection.vehicle_info && (
          <p className="text-sm text-muted-foreground">{inspection.vehicle_info}</p>
        )}

        {inspection.created_at && (
          <p className="text-xs text-muted-foreground">
            Created {format(new Date(inspection.created_at), "MMM d, yyyy h:mm a")}
          </p>
        )}

        {inspection.overall_result && (
          <p className="text-sm">
            <span className="text-muted-foreground">Result: </span>
            <span className="font-medium capitalize">{inspection.overall_result}</span>
          </p>
        )}
      </div>

      {canPerform ? (
        <Link href={`/mobile/inspections/${inspection.id}/perform`} className="block">
          <Button className="w-full h-12 text-base" size="lg">
            <Play className="h-5 w-5 mr-2" aria-hidden="true" />
            Perform inspection
          </Button>
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground text-center px-4">
          This inspection is {inspection.status?.replace(/_/g, " ")} and cannot be edited.
        </p>
      )}
    </div>
  );
}
