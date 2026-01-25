"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { workordersApi } from "@/lib/api/workorders";
import { inspectionsApi } from "@/lib/api/inspections";
import { vehiclesApi } from "@/lib/api/vehicles";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { History, Wrench, Search, Car } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function ServiceHistoryPage() {
  const [vehicleFilter, setVehicleFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("workorders");
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ["portal", "vehicles"],
    queryFn: () => {
      const customerId = user?.customer_profile?.id || (user as any)?.customer?.id;
      if (!customerId) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });
      return vehiclesApi.list({ owner: customerId });
    },
    enabled: !!user && !!(user?.customer_profile?.id || (user as any)?.customer?.id),
  });

  const { data: workOrdersData, isLoading: workOrdersLoading } = useQuery({
    queryKey: ["portal", "history", "workorders", vehicleFilter],
    queryFn: () => {
      const customerId = user?.customer_profile?.id || (user as any)?.customer?.id;
      if (!customerId) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });
      const vehicles = (vehiclesData?.results || vehiclesData || []) as any[];
      if (vehicles.length === 0) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });
      
      const vehicleIds = vehicleFilter === "all" 
        ? vehicles.map((v: any) => v.id)
        : [parseInt(vehicleFilter)];
      
      // Fetch work orders for all customer vehicles
      return Promise.all(
        vehicleIds.map((vehicleId: number) =>
          workordersApi.list({ vehicle: vehicleId, ordering: "-created_at" } as any)
        )
      ).then((results) => {
        const allWorkOrders: any[] = [];
        results.forEach((result: any) => {
          const orders = result.results || result || [];
          allWorkOrders.push(...(Array.isArray(orders) ? orders : []));
        });
        return { count: 0, next: null, previous: null, results: allWorkOrders.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ) };
      });
    },
    enabled: !!user && !!(user?.customer_profile?.id || (user as any)?.customer?.id) && !!vehiclesData,
  });

  const { data: inspectionsData, isLoading: inspectionsLoading } = useQuery({
    queryKey: ["portal", "history", "inspections", vehicleFilter],
    queryFn: () => {
      const customerId = user?.customer_profile?.id || (user as any)?.customer?.id;
      if (!customerId) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });
      const vehicles = (vehiclesData?.results || vehiclesData || []) as any[];
      if (vehicles.length === 0) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });
      
      const vehicleIds = vehicleFilter === "all" 
        ? vehicles.map((v: any) => v.id)
        : [parseInt(vehicleFilter)];
      
      return Promise.all(
        vehicleIds.map((vehicleId: number) =>
          inspectionsApi.list({ vehicle: vehicleId, ordering: "-inspection_date" })
        )
      ).then((results) => {
        const allInspections: any[] = [];
        results.forEach((result: any) => {
          const inspections = result.results || result || [];
          allInspections.push(...(Array.isArray(inspections) ? inspections : []));
        });
        return { count: 0, next: null, previous: null, results: allInspections.sort((a, b) => 
          new Date(b.inspection_date).getTime() - new Date(a.inspection_date).getTime()
        ) };
      });
    },
    enabled: !!user && !!(user?.customer_profile?.id || (user as any)?.customer?.id) && !!vehiclesData,
  });

  const vehicles = (vehiclesData?.results || vehiclesData || []) as any[];
  const workOrders = (workOrdersData?.results || workOrdersData || []) as any[];
  const inspections = (inspectionsData?.results || inspectionsData || []) as any[];

  if (workOrdersLoading || inspectionsLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-48 mb-4" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "success";
      case "in_progress":
        return "default";
      case "pending":
        return "warning";
      default:
        return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Service History</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          View complete service history for your vehicles
        </p>
      </div>

      {/* Vehicle Filter */}
      {vehicles.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-4">
              <Car className="w-5 h-5 text-gray-400" />
              <Select
                value={vehicleFilter}
                onChange={(e) => setVehicleFilter(e.target.value)}
                className="w-64"
              >
                <option value="all">All Vehicles</option>
                {vehicles.map((vehicle: any) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.license_plate || "N/A"})
                  </option>
                ))}
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="workorders">
              Work Orders ({workOrders.length})
            </TabsTrigger>
            <TabsTrigger value="inspections">
              Inspections ({inspections.length})
            </TabsTrigger>
          </TabsList>

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
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Work Order #{wo.work_order_number}
                        </h3>
                      </div>
                      <div className="ml-8 space-y-1">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Date: {format(new Date(wo.created_at), "MMM d, yyyy")}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Vehicle: {wo.vehicle_info || "N/A"}
                        </p>
                        {wo.customer_concerns && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                            {wo.customer_concerns}
                          </p>
                        )}
                        {wo.estimated_total && (
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-2">
                            Total: ${parseFloat(wo.estimated_total || 0).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant={getStatusVariant(wo.status)}>
                      {wo.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Wrench className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">No work orders found</p>
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
                        <Search className="w-5 h-5 text-green-500" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Inspection #{inspection.inspection_number || inspection.id}
                        </h3>
                      </div>
                      <div className="ml-8 space-y-1">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Date: {format(new Date(inspection.inspection_date), "MMM d, yyyy")}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Vehicle: {inspection.vehicle_info || "N/A"}
                        </p>
                        {inspection.inspection_type && (
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Type: {inspection.inspection_type}
                          </p>
                        )}
                        {inspection.overall_condition && (
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-2">
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
                <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">No inspections found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

