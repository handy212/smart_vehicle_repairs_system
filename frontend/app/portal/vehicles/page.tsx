"use client";

import { useQuery } from "@tanstack/react-query";
import { vehiclesApi } from "@/lib/api/vehicles";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Car, Calendar, Wrench, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function MyVehiclesPage() {
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const { data: vehiclesData, isLoading } = useQuery({
    queryKey: ["portal", "vehicles"],
    queryFn: () => {
      const customerId = user?.customer_profile?.id || (user as any)?.customer?.id;
      if (!customerId) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });
      return vehiclesApi.list({ owner: customerId });
    },
    enabled: !!user && !!(user?.customer_profile?.id || (user as any)?.customer?.id),
  });

  const vehicles = (vehiclesData?.results || vehiclesData || []) as any[];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">My Vehicles</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            View and manage your registered vehicles
          </p>
        </div>
        <Link href="/portal/vehicles/new">
          <Button>
            <Car className="w-4 h-4 mr-2" />
            Add Vehicle
          </Button>
        </Link>
      </div>

      {vehicles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Car className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              No vehicles registered
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Register your vehicle to start booking appointments and tracking service history.
            </p>
            <div className="flex items-center justify-center space-x-4">
              <Link href="/portal/vehicles/new">
                <Button>
                  <Car className="w-4 h-4 mr-2" />
                  Add Your First Vehicle
                </Button>
              </Link>
              <Link href="/portal/book">
                <Button variant="secondary">
                  Book Appointment
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {vehicles.map((vehicle: any) => (
            <Link key={vehicle.id} href={`/portal/vehicles/${vehicle.id}`}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </CardTitle>
                    <Car className="w-6 h-6 text-blue-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">License Plate:</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {vehicle.license_plate || "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">VIN:</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100 font-mono text-xs">
                        {vehicle.vin || "N/A"}
                      </span>
                    </div>
                    {vehicle.color && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Color:</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {vehicle.color}
                        </span>
                      </div>
                    )}
                    {vehicle.mileage && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Mileage:</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {parseInt(vehicle.mileage).toLocaleString()} miles
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        View details
                      </span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

