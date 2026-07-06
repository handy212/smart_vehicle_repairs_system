"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Car, Loader2, Search } from "lucide-react";
import { vehiclesApi, type Vehicle } from "@/lib/api/vehicles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

interface VehicleSelectorProps {
  onSelect: (vehicle: Vehicle) => void;
  selectedVehicleId?: number;
  ownerId?: number | null;
  placeholder?: string;
  disabled?: boolean;
}

function getVehicleLabel(vehicle?: Partial<Vehicle> | null) {
  if (!vehicle) return "Vehicle";
  const title = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  return title || vehicle.license_plate || vehicle.vin || (vehicle.id ? `Vehicle #${vehicle.id}` : "Vehicle");
}

function getVehicleMeta(vehicle?: Partial<Vehicle> | null) {
  if (!vehicle) return "";
  return [vehicle.license_plate, vehicle.vin].filter(Boolean).join(" • ");
}

export function VehicleSelector({
  onSelect,
  selectedVehicleId,
  ownerId,
  placeholder = "Search and select a vehicle...",
  disabled = false,
}: VehicleSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading } = useQuery({
    queryKey: ["vehicles-search", ownerId, debouncedQuery],
    queryFn: () =>
      vehiclesApi.list({
        owner: ownerId || undefined,
        search: debouncedQuery || undefined,
        page: 1,
        page_size: 10,
      }),
    enabled: open && !!ownerId,
  });

  const { data: selectedVehicle } = useQuery({
    queryKey: ["vehicle", selectedVehicleId],
    queryFn: () => vehiclesApi.get(selectedVehicleId!),
    enabled: !!selectedVehicleId,
  });

  const vehicles = data?.results || [];

  const handleSelect = (vehicle: Vehicle) => {
    onSelect(vehicle);
    setOpen(false);
    setSearchQuery("");
  };

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal text-left h-auto min-h-11 py-2 px-3 border-border",
            disabled && "opacity-50"
          )}
        >
          {selectedVehicle ? (
            <div className="flex flex-col items-start overflow-hidden">
              <span className="font-medium truncate w-full">{getVehicleLabel(selectedVehicle)}</span>
              <span className="text-xs text-muted-foreground truncate w-full">{getVehicleMeta(selectedVehicle)}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[500px] p-0 shadow-lg border-border" align="start">
        {!ownerId ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Select a customer first.</div>
        ) : (
          <>
            <div className="flex items-center border-b px-3 bg-muted/30">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50 text-muted-foreground" />
              <Input
                placeholder="Search by make, model, plate, or VIN..."
                className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground border-none shadow-none focus-visible:ring-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-[350px] overflow-y-auto p-2">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" /> Searching vehicles...
                </div>
              ) : vehicles.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {searchQuery ? "No vehicles found matching your search." : "Type to search for vehicles."}
                </div>
              ) : (
                <div className="space-y-1">
                  {vehicles.map((vehicle) => (
                    <div
                      key={vehicle.id}
                      onClick={() => handleSelect(vehicle)}
                      className={cn(
                        "flex items-center gap-3 cursor-pointer rounded-lg px-3 py-2.5 text-sm transition-colors",
                        "hover:bg-primary/5 hover:text-primary",
                        selectedVehicleId === vehicle.id
                          ? "bg-primary/10 text-primary font-medium border border-primary/20"
                          : "text-foreground"
                      )}
                    >
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <Car className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex justify-between items-center mb-0.5 gap-2">
                          <span className="font-semibold truncate">{getVehicleLabel(vehicle)}</span>
                          <Badge variant="outline" className="text-[10px] font-mono h-4 px-1.5 opacity-70">
                            {vehicle.license_plate || "No plate"}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {vehicle.vin || "No VIN"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
