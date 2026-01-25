"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { vehiclesApi } from "@/lib/api/vehicles";
import { workordersApi } from "@/lib/api/workorders";
import { appointmentsApi } from "@/lib/api/appointments";
import { roadsideApi } from "@/lib/api/roadside";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit } from "lucide-react";
import Link from "next/link";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { VehicleSidebar } from "./components/VehicleSidebar";
import { VehicleProfileView } from "./components/views/VehicleProfileView";
import { VehicleHistoryView } from "./components/views/VehicleHistoryView";
import { VehicleDocumentsView } from "./components/views/VehicleDocumentsView";
import { VehicleRoadsideView } from "./components/views/VehicleRoadsideView";

import { useEffect, useState } from "react";
import { useRecentItems } from "@/lib/hooks/useRecentItems";

export default function VehicleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const vehicleId = parseInt(params.id as string);
  const initialView = searchParams.get("view") || "profile";
  const [activeView, setActiveView] = useState(initialView);
  const { addRecentItem } = useRecentItems();

  // Update URL and state when view changes
  useEffect(() => {
    // If search params change (e.g. back button), update state
    const currentView = searchParams.get("view") || "profile";
    if (currentView !== activeView) {
      setActiveView(currentView);
    }
  }, [searchParams, activeView]);

  const handleViewChange = (view: string) => {
    setActiveView(view);
    const url = new URL(window.location.href);
    if (view === "profile") {
      url.searchParams.delete("view");
    } else {
      url.searchParams.set("view", view);
    }
    window.history.pushState({}, "", url.toString());
  };

  const { data: vehicle, isLoading, error } = useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => vehiclesApi.get(vehicleId),
  });

  useEffect(() => {
    if (vehicle) {
      addRecentItem({
        id: vehicle.id,
        name: `${vehicle.make} ${vehicle.model} (${vehicle.year})`,
        type: "vehicle",
        href: `/vehicles/${vehicle.id}`,
      });
    }
  }, [vehicle, addRecentItem]);

  // Fetch work orders and appointments for this vehicle
  // We can optimize this later to only fetch when needed, but for now pre-fetching is fine for similar UX
  const { data: workOrdersData } = useQuery({
    queryKey: ["workorders", "vehicle", vehicleId],
    queryFn: () => workordersApi.list({ vehicle: vehicleId }), // Optimized to search by vehicle ID if API supports it
    enabled: !!vehicleId,
  });

  const { data: appointmentsData } = useQuery({
    queryKey: ["appointments", "vehicle", vehicleId],
    queryFn: () => appointmentsApi.list(),
    enabled: !!vehicleId,
  });

  const { data: roadsideRequestsData } = useQuery({
    queryKey: ["roadside", "vehicle", vehicleId],
    queryFn: () => roadsideApi.list({ vehicle: vehicleId }),
    enabled: !!vehicleId,
  });

  const roadsideRequests = roadsideRequestsData?.results || [];

  // Filter work orders and appointments for this vehicle if API didn't filter
  const vehicleWorkOrders = workOrdersData?.results || [];

  const vehicleAppointments = appointmentsData?.results?.filter(
    (apt) =>
      (typeof apt.vehicle === "object" && apt.vehicle !== null
        ? apt.vehicle.id
        : apt.vehicle) === vehicleId
  ) || [];


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary dark:border-orange-400"></div>
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-4 rounded-md">
          Error loading vehicle. Please try again.
        </div>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "active":
        return "success";
      case "in_service":
        return "warning";
      case "sold":
        return "secondary";
      default:
        return "default";
    }
  };

  const renderContent = () => {
    switch (activeView) {
      case "profile":
        return (
          <VehicleProfileView
            vehicle={vehicle}
            vehicleWorkOrders={vehicleWorkOrders}
            vehicleAppointments={vehicleAppointments}
          />
        );
      case "history":
        return (
          <VehicleHistoryView
            vehicleId={vehicleId}
            workOrders={vehicleWorkOrders}
          />
        );

      case "documents":
        return <VehicleDocumentsView vehicleId={vehicleId} />;
      case "roadside":
        return <VehicleRoadsideView roadsideRequests={roadsideRequests} />;
      default:
        return <VehicleProfileView vehicle={vehicle} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <Link href="/vehicles">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to List
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {vehicle.make} {vehicle.model} {vehicle.year}
              </h1>
              <Badge variant={getStatusVariant(vehicle.status) as any} className="capitalize">
                {vehicle.status?.replace("_", " ") || vehicle.status}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-mono">
              VIN: {vehicle.vin}
            </p>
          </div>
        </div>
        <PermissionGuard permission="edit_vehicles">
          <Link href={`/vehicles/${vehicleId}/edit`}>
            <Button variant="outline" size="sm">
              <Edit className="w-4 h-4 mr-2" />
              Edit Vehicle
            </Button>
          </Link>
        </PermissionGuard>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <VehicleSidebar
          vehicleId={vehicleId}
          activeView={activeView}
          onViewChange={handleViewChange}
        />
        <div className="flex-1 min-w-0">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
