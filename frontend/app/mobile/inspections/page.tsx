"use client";

import { useEffect, useState } from "react";
import { inspectionsApi, VehicleInspection } from "@/lib/api/inspections";
import { useOfflineStore } from "@/store/offlineStore";
import { inspectionsDB } from "@/lib/offline/db";
import { ClipboardCheck, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function MobileInspectionsPage() {
  const { isOnline } = useOfflineStore();
  const [inspections, setInspections] = useState<VehicleInspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInspections();
  }, []);

  const loadInspections = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        const response = await inspectionsApi.list();
        const data = response.results || response;
        setInspections(Array.isArray(data) ? data : []);

        // Cache inspections
        for (const inspection of Array.isArray(data) ? data : []) {
          await inspectionsDB.set(inspection.id, inspection, true);
        }
      } else {
        // Load from cache
        const cached = await inspectionsDB.getAll();
        setInspections(cached);
      }
    } catch (error) {
      console.error("Failed to load inspections:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">
          Inspections
        </h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={loadInspections}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href="/mobile/inspections/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          </Link>
        </div>
      </div>

      {/* Inspections List */}
      {inspections.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">
            No inspections found
          </p>
          <Link href="/mobile/inspections/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
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
              className="block p-4 rounded-lg border border-border bg-card hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
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
                <div className="ml-4">
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
                    {inspection.status?.replace("_", " ").toUpperCase()}
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
