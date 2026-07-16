"use client";

import { useQuery } from "@tanstack/react-query";
import { vehiclesApi } from "@/lib/api/vehicles";
import { authApi } from "@/lib/api/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalList } from "../components/PortalList";
import { PortalCard } from "../components/PortalCard";
import { PremiumIcons } from "@/components/ui/icons";
import { Vehicle } from "@/lib/api/vehicles";

export default function MyVehiclesPage() {
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const { data: vehiclesData, isLoading } = useQuery({
    queryKey: ["portal", "vehicles"],
    queryFn: () => {
      const customerId = user?.customer_profile?.id || user?.customer?.id;
      if (!customerId) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });
      return vehiclesApi.list({ owner: customerId });
    },
    enabled: !!user && !!(user?.customer_profile?.id || user?.customer?.id),
  });

  const vehicles = (Array.isArray(vehiclesData) ? vehiclesData : vehiclesData?.results || []) as Vehicle[];

  return (
    <div className="space-y-8 w-full">
      <PortalPageHeader
        title="My Vehicles"
        description="Manage your registered vehicles and view their maintenance history."
        action={
          <Link href="/portal/vehicles/new">
            <Button size="sm" className="gap-2">
              <PremiumIcons.Plus className="w-4 h-4" />
              Register Vehicle
            </Button>
          </Link>
        }
      />

      <div>
        <PortalList
          data={vehicles}
          isLoading={isLoading}
          emptyMessage="Your garage is empty. Register your first vehicle to schedule services."
          emptyAction={
            <Link href="/portal/vehicles/new">
              <Button variant="outline" size="sm" className="mt-3 gap-2">
                <PremiumIcons.Plus className="w-4 h-4 text-primary" />
                Add Vehicle
              </Button>
            </Link>
          }
          columns={[
            {
              header: "Vehicle Details",
              cell: (vehicle) => (
                <div className="flex items-center gap-4">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <PremiumIcons.Car className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </div>
                    {vehicle.color && (
                      <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-0.5 opacity-60">{vehicle.color}</div>
                    )}
                  </div>
                </div>
              )
            },
            {
              header: "Identification",
              cell: (vehicle) => (
                <div className="space-y-1">
                  <div className="font-semibold text-xs text-foreground bg-muted/30 px-2 py-0.5 rounded-md inline-block border border-border/50">
                    {vehicle.license_plate || "NO PLATE"}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono tracking-tighter opacity-70">
                    VIN: {vehicle.vin || "NOT PROVIDED"}
                  </div>
                </div>
              )
            },
            {
              header: "Current Mileage",
              cell: (vehicle) => (
                <div className="flex items-center gap-2">
                  <PremiumIcons.History className="w-3.5 h-3.5 text-muted-foreground/40" />
                  <span className="text-sm font-bold text-foreground/80">
                    {vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : "N/A"}
                  </span>
                </div>
              )
            },
            {
              header: "Actions",
              className: "text-right",
              cell: (vehicle) => (
                <div className="flex justify-end gap-2">
                  <Link href={`/portal/vehicles/${vehicle.id}`}>
                    <Button variant="ghost" size="sm" className="gap-2 text-primary">
                      View Details
                      <PremiumIcons.ArrowRight className="w-3.5 h-3.5" />
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
              icon={<PremiumIcons.Car className="w-6 h-6" />}
              title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              subtitle={
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-[10px] text-primary tracking-widest uppercase">{vehicle.license_plate || "No Plate"}</span>
                  {vehicle.mileage && (
                    <span className="text-xs font-medium opacity-60">
                       {vehicle.mileage.toLocaleString()} miles recorded
                    </span>
                  )}
                </div>
              }
            />
          )}
        />
      </div>
    </div>
  );
}
