"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { vehiclesApi } from "@/lib/api/vehicles";
import { workordersApi } from "@/lib/api/workorders";
import { appointmentsApi } from "@/lib/api/appointments";
import { inspectionsApi } from "@/lib/api/inspections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Car, Calendar, Wrench, Search, ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";
import { useCurrency } from "@/lib/hooks/useCurrency";

export default function VehicleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const vehicleId = parseInt(params.id as string);
  const [activeTab, setActiveTab] = useState<string>("overview");
  const { formatCurrency } = useCurrency();

  const { data: vehicle, isLoading: vehicleLoading } = useQuery({
    queryKey: ["portal", "vehicle", vehicleId],
    queryFn: () => vehiclesApi.get(vehicleId),
    enabled: !!vehicleId,
  });

  const { data: workOrdersData } = useQuery({
    queryKey: ["portal", "vehicle", vehicleId, "workorders"],
    queryFn: () => workordersApi.list({ vehicle: vehicleId, ordering: "-created_at" } as any),
    enabled: !!vehicleId,
  });

  const { data: appointmentsData } = useQuery({
    queryKey: ["portal", "vehicle", vehicleId, "appointments"],
    queryFn: () =>
      appointmentsApi.list({
        vehicle: vehicleId,
        ordering: "-appointment_date,-appointment_time",
      }),
    enabled: !!vehicleId,
  });

  const { data: inspectionsData } = useQuery({
    queryKey: ["portal", "vehicle", vehicleId, "inspections"],
    queryFn: () => inspectionsApi.list({ vehicle: vehicleId, ordering: "-inspection_date" } as any),
    enabled: !!vehicleId,
  });

  const workOrders = (workOrdersData?.results || workOrdersData || []) as any[];
  const appointments = (appointmentsData?.results || appointmentsData || []) as any[];
  const inspections = (inspectionsData?.results || inspectionsData || []) as any[];

  if (vehicleLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground mb-4">Vehicle not found</p>
        <Button onClick={() => router.push("/portal/vehicles")}>Back to Vehicles</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-2 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-foreground">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vehicle Details & Service History
          </p>
        </div>
        <Link href="/portal/book">
          <Button>Book Service</Button>
        </Link>
      </div>

      {/* Vehicle Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Car className="w-5 h-5" />
            <span>Vehicle Info</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-muted-foreground mb-1">VIN</p>
              <p className="font-mono text-sm font-medium text-foreground">
                {vehicle.vin || "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">License Plate</p>
              <p className="font-medium text-foreground">
                {vehicle.license_plate || "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Year</p>
              <p className="font-medium text-foreground">{vehicle.year}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Make</p>
              <p className="font-medium text-foreground">{vehicle.make}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Model</p>
              <p className="font-medium text-foreground">{vehicle.model}</p>
            </div>
            {(vehicle.color || vehicle.exterior_color) && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Color</p>
                <p className="font-medium text-foreground">
                  {vehicle.color || vehicle.exterior_color}
                </p>
              </div>
            )}
            {(vehicle.mileage || vehicle.current_mileage) && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Mileage</p>
                <p className="font-medium text-foreground">
                  {parseInt(String(vehicle.mileage || vehicle.current_mileage || 0)).toLocaleString()}{" "}
                  miles
                </p>
              </div>
            )}
            {vehicle.engine_type && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Engine</p>
                <p className="font-medium text-foreground">{vehicle.engine_type}</p>
              </div>
            )}
            {vehicle.fuel_type && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Fuel Type</p>
                <p className="font-medium text-foreground">{vehicle.fuel_type}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="workorders">
            Work Orders ({workOrders.length})
          </TabsTrigger>
          <TabsTrigger value="appointments">
            Appointments ({appointments.length})
          </TabsTrigger>
          <TabsTrigger value="inspections">
            Inspections ({inspections.length})
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Services
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">
                  {workOrders.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Work orders</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Appointments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">
                  {appointments.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Total appointments</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Inspections
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">
                  {inspections.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Total inspections</p>
              </CardContent>
            </Card>
          </div>

          {workOrders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Work Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {workOrders.slice(0, 5).map((wo: any) => (
                    <div
                      key={wo.id}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-sm text-foreground">
                          Work Order #{wo.work_order_number}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(wo.created_at), "MMM d, yyyy")}
                        </p>
                      </div>
                      <Badge variant="secondary">{wo.status}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Work Orders Tab */}
        <TabsContent value="workorders" className="space-y-4">
          {workOrders.length > 0 ? (
            workOrders.map((wo: any) => (
              <Card key={wo.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <Wrench className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold text-foreground">
                          Work Order #{wo.work_order_number}
                        </h3>
                      </div>
                      <div className="ml-8 space-y-1">
                        <p className="text-sm text-muted-foreground">
                          Date: {format(new Date(wo.created_at), "MMM d, yyyy")}
                        </p>
                        {wo.customer_concerns && (
                          <p className="text-sm text-muted-foreground mt-2">
                            {wo.customer_concerns}
                          </p>
                        )}
                        {wo.estimated_total && (
                          <p className="text-sm font-medium text-foreground mt-2">
                            Total: {formatCurrency(wo.estimated_total || 0)}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="secondary">{wo.status.replace(/_/g, " ")}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No work orders found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Appointments Tab */}
        <TabsContent value="appointments" className="space-y-4">
          {appointments.length > 0 ? (
            appointments.map((apt: any) => (
              <Card key={apt.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <Calendar className="w-5 h-5 text-green-500" />
                        <h3 className="text-lg font-semibold text-foreground">
                          {format(new Date(apt.appointment_date), "EEEE, MMMM d, yyyy")}
                        </h3>
                      </div>
                      <div className="ml-8 space-y-1">
                        <p className="text-sm text-muted-foreground">
                          Time: {apt.appointment_time}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Service: {apt.service_type}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">{apt.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No appointments found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Inspections Tab */}
        <TabsContent value="inspections" className="space-y-4">
          {inspections.length > 0 ? (
            inspections.map((inspection: any) => (
              <Card key={inspection.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <Search className="w-5 h-5 text-purple-500" />
                        <h3 className="text-lg font-semibold text-foreground">
                          Inspection #{inspection.inspection_number || inspection.id}
                        </h3>
                      </div>
                      <div className="ml-8 space-y-1">
                        <p className="text-sm text-muted-foreground">
                          Date: {format(new Date(inspection.inspection_date), "MMM d, yyyy")}
                        </p>
                        {inspection.inspection_type && (
                          <p className="text-sm text-muted-foreground">
                            Type: {inspection.inspection_type}
                          </p>
                        )}
                        {inspection.overall_condition && (
                          <p className="text-sm font-medium text-foreground mt-2">
                            Condition: {inspection.overall_condition}
                          </p>
                        )}
                      </div>
                    </div>
                    <Link href={`/portal/inspections/${inspection.id}`}>
                      <Badge variant="secondary">View Details</Badge>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No inspections found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

