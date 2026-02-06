"use client";

import { useQuery } from "@tanstack/react-query";
import { vehiclesApi } from "@/lib/api/vehicles";
import { authApi } from "@/lib/api/auth";
import { Car, ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalList } from "../components/PortalList";
import { PortalCard } from "../components/PortalCard";

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

  return (
    <div>
      <PortalPageHeader
        title="Vehicles"
        action={
          <Link href="/portal/vehicles/new">
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Vehicle
            </Button>
          </Link>
        }
      />

      <div className="mt-8">
        <PortalList
          data={vehicles}
          isLoading={isLoading}
          emptyMessage="No vehicles registered. Add your first vehicle to get started."
          emptyAction={
            <Link href="/portal/vehicles/new">
              <Button variant="outline" size="sm" className="mt-4 gap-2">
                <Plus className="w-4 h-4" />
                Add Vehicle
              </Button>
            </Link>
          }
          columns={[
            {
              header: "Vehicle",
              cell: (vehicle) => (
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 dark:bg-orange-900/20 flex items-center justify-center text-primary">
                    <Car className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </div>
                    {vehicle.color && (
                      <div className="text-xs text-muted-foreground capitalize">{vehicle.color}</div>
                    )}
                  </div>
                </div>
              )
            },
            {
              header: "License / VIN",
              cell: (vehicle) => (
                <div className="text-sm">
                  <div className="font-medium text-foreground">{vehicle.license_plate || "N/A"}</div>
                  <div className="text-xs text-muted-foreground font-mono">{vehicle.vin || "N/A"}</div>
                </div>
              )
            },
            {
              header: "Mileage",
              cell: (vehicle) => (
                <span className="text-muted-foreground">
                  {vehicle.mileage ? `${parseInt(vehicle.mileage).toLocaleString()} miles` : "N/A"}
                </span>
              )
            },
            {
              header: "Action",
              className: "text-right",
              cell: (vehicle) => (
                <div className="flex justify-end">
                  <Link href={`/portal/vehicles/${vehicle.id}`}>
                    <Button variant="ghost" size="sm" className="gap-1">
                      View
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              )
            }
          ]}
          renderMobileItem={(vehicle) => (
            <PortalCard
              key={vehicle.id}
              href={`/portal/vehicles/${vehicle.id}`}
              icon={<Car className="w-5 h-5 text-primary" />}
              title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              subtitle={
                <span className="flex items-center gap-2">
                  <span>{vehicle.license_plate || "No Plate"}</span>
                  {vehicle.mileage && (
                    <>• {parseInt(vehicle.mileage).toLocaleString()} mi</>
                  )}
                </span>
              }
            />
          )}
        />
      </div>
    </div>
  );
}

