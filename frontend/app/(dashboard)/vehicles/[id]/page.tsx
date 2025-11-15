"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { vehiclesApi } from "@/lib/api/vehicles";
import { workordersApi } from "@/lib/api/workorders";
import { appointmentsApi } from "@/lib/api/appointments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Car, Calendar, Gauge, Fuel, FileText } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

export default function VehicleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const vehicleId = parseInt(params.id as string);

  const { data: vehicle, isLoading, error } = useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => vehiclesApi.get(vehicleId),
  });

  // Fetch work orders and appointments for this vehicle
  const { data: workOrdersData } = useQuery({
    queryKey: ["workorders", "vehicle", vehicleId],
    queryFn: () => workordersApi.list(),
    enabled: !!vehicleId,
  });

  const { data: appointmentsData } = useQuery({
    queryKey: ["appointments", "vehicle", vehicleId],
    queryFn: () => appointmentsApi.list(),
    enabled: !!vehicleId,
  });

  // Filter work orders and appointments for this vehicle
  const vehicleWorkOrders =
    workOrdersData?.results?.filter(
      (wo) =>
        (typeof wo.vehicle === "object" && wo.vehicle !== null
          ? wo.vehicle.id
          : wo.vehicle) === vehicleId
    ) || [];

  const vehicleAppointments =
    appointmentsData?.results?.filter(
      (apt) =>
        (typeof apt.vehicle === "object" && apt.vehicle !== null
          ? apt.vehicle.id
          : apt.vehicle) === vehicleId
    ) || [];

  // Calculate stats
  const totalServices = vehicleWorkOrders.length;
  const totalSpent = vehicleWorkOrders.reduce((sum, wo) => {
    const cost = wo.total_cost ? parseFloat(wo.total_cost.toString()) : 0;
    return sum + cost;
  }, 0);
  
  const completedWorkOrders = vehicleWorkOrders.filter((wo) => wo.status === "completed");
  const lastServiceDate = completedWorkOrders.length > 0
    ? completedWorkOrders.sort((a, b) => 
        new Date(b.completed_at || b.created_at).getTime() - 
        new Date(a.completed_at || a.created_at).getTime()
      )[0]?.completed_at || completedWorkOrders[0]?.created_at
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">Error loading vehicle. Please try again.</p>
          </CardContent>
        </Card>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {vehicle.make} {vehicle.model} {vehicle.year}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              VIN: {vehicle.vin}
            </p>
          </div>
        </div>
        <Link href={`/vehicles/${vehicleId}/edit`}>
          <Button>
            <Edit className="w-4 h-4 mr-2" />
            Edit Vehicle
          </Button>
        </Link>
      </div>

      {/* Status Badge */}
      <div>
        <Badge variant={getStatusVariant(vehicle.status) as any} className="text-sm px-3 py-1">
          {vehicle.status?.replace("_", " ") || vehicle.status}
        </Badge>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Vehicle Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Vehicle Details */}
          <Card>
            <CardHeader>
              <CardTitle>Vehicle Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Make</p>
                  <p className="text-gray-900">{vehicle.make || "-"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Model</p>
                  <p className="text-gray-900">{vehicle.model || "-"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Year</p>
                  <p className="text-gray-900">{vehicle.year || "-"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">VIN</p>
                  <p className="text-gray-900 font-mono text-sm">{vehicle.vin || "-"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">License Plate</p>
                  <p className="text-gray-900">{vehicle.license_plate || "-"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Color</p>
                  <p className="text-gray-900">{(vehicle as any).exterior_color || "-"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Specifications */}
          <Card>
            <CardHeader>
              <CardTitle>Specifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start space-x-3">
                <Gauge className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Mileage</p>
                  <p className="text-gray-900">
                    {(vehicle as any).current_mileage ? `${((vehicle as any).current_mileage).toLocaleString()} miles` : "-"}
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Fuel className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Engine Type</p>
                  <p className="text-gray-900 capitalize">{((vehicle as any).engine_type || "-").replace("_", " ")}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Service History */}
          <Card>
            <CardHeader>
              <CardTitle>Service History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                View complete service history, work orders, and appointments for this vehicle.
              </p>
              <Link href={`/vehicles/${vehicleId}/history`}>
                <Button>
                  <FileText className="w-4 h-4 mr-2" />
                  View Full History
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Quick Info */}
        <div className="space-y-6">
          {/* Owner Information */}
          <Card>
            <CardHeader>
              <CardTitle>Owner</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-2">Customer</p>
              {vehicle.owner ? (
                <Link
                  href={`/customers/${typeof vehicle.owner === 'object' && vehicle.owner !== null ? vehicle.owner.id : vehicle.owner}`}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  {vehicle.owner_name || "View Customer"}
                </Link>
              ) : (
                <p className="text-gray-900">-</p>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Total Services</span>
                <span className="text-lg font-semibold">{totalServices}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Appointments</span>
                <span className="text-lg font-semibold">{vehicleAppointments.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Last Service</span>
                <span className="text-sm font-medium">
                  {lastServiceDate
                    ? format(new Date(lastServiceDate), "MMM dd, yyyy")
                    : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Total Spent</span>
                <span className="text-lg font-semibold">${totalSpent.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={`/appointments/new?vehicle=${vehicleId}`} className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Calendar className="w-4 h-4 mr-2" />
                  Schedule Service
                </Button>
              </Link>
              <Link href={`/workorders/new?vehicle=${vehicleId}`} className="block">
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="w-4 h-4 mr-2" />
                  Create Work Order
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

