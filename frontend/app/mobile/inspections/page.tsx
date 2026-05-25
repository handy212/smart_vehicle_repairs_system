"use client";

import { useCallback, useEffect, useState } from "react";
import { inspectionsApi, VehicleInspection } from "@/lib/api/inspections";
import { useOfflineStore } from "@/store/offlineStore";
import { inspectionsDB } from "@/lib/offline/db";
import { ClipboardCheck, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { MobileErrorState } from "@/components/mobile/MobileErrorState";

export default function MobileInspectionsPage() {
  const { isOnline } = useOfflineStore();
  const [inspections, setInspections] = useState<VehicleInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadInspections = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      if (isOnline) {
        const response = await inspectionsApi.list();
        const data = response.results || response;
        const list = Array.isArray(data) ? data : [];
        setInspections(list);

        for (const inspection of list) {
          await inspectionsDB.set(inspection.id, inspection, true);
        }
      } else {
        const cached = await inspectionsDB.getAll();
        setInspections(cached);
      }
    } catch {
      const cached = await inspectionsDB.getAll();
      if (cached.length > 0) {
        setInspections(cached);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    loadInspections();
  }, [loadInspections]);

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading inspections...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <MobileErrorState
          title="Could not load inspections"
          onRetry={loadInspections}
        />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Inspections</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={loadInspections}
            disabled={loading}
            aria-label="Refresh inspections"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href="/mobile/inspections/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
              New
            </Button>
          </Link>
        </div>
      </div>

      {inspections.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
          <p className="text-muted-foreground mb-4">No inspections found</p>
          <Link href="/mobile/inspections/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Create Inspection
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {inspections.map((inspection) => (
            <Link
              key={inspection.id}
              href={`/mobile/inspections/${inspection.id}`}
              className="block p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground mb-1">
                    Inspection #{inspection.id}
                  </div>
                  {inspection.vehicle_info && (
                    <div className="text-sm text-muted-foreground mb-1">
                      {inspection.vehicle_info}
                    </div>
                  )}
                  {inspection.template_name && (
                    <div className="text-xs text-muted-foreground">
                      {inspection.template_name}
                    </div>
                  )}
                </div>
                <div className="ml-4 shrink-0">
                  <span
                    className={cn(
                      "px-2 py-1 rounded text-xs font-medium",
                      inspection.status === "completed" &&
                        "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
                      inspection.status === "approved" &&
                        "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
                      inspection.status === "rejected" &&
                        "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
                      inspection.status === "in_progress" &&
                        "bg-orange-100 text-primary dark:bg-orange-900 dark:text-orange-300"
                    )}
                  >
                    {inspection.status?.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
