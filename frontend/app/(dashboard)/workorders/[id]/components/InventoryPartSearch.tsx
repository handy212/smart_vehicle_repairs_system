"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { inventoryApi, Part } from "@/lib/api/inventory";
import { cn } from "@/lib/utils/cn";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";

export type FitmentVehicle = {
  id?: number;
  make?: string;
  model?: string;
  year?: number;
};

export type FitmentStatus = "likely" | "unlikely" | "unknown";

interface InventoryPartSearchProps {
  onSelect: (part: Part) => void;
  className?: string;
  /** When set, search ranks/filters by soft vehicle fitment and shows badges. */
  vehicle?: FitmentVehicle | null;
}

function fitmentBadge(status?: FitmentStatus | string | null) {
  if (status === "likely") {
    return (
      <Badge variant="success" className="text-[10px] h-5 px-1.5 font-normal">
        Likely fit
      </Badge>
    );
  }
  if (status === "unlikely") {
    return (
      <Badge variant="danger" className="text-[10px] h-5 px-1.5 font-normal">
        May not fit
      </Badge>
    );
  }
  if (status === "unknown") {
    return (
      <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground">
        Unknown fit
      </Badge>
    );
  }
  return null;
}

export default function InventoryPartSearch({
  onSelect,
  className,
  vehicle,
}: InventoryPartSearchProps) {
  const { formatCurrency } = useCurrency();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const vehicleParams = vehicle
    ? {
        vehicle_id: vehicle.id,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
      }
    : {};

  const { data, isLoading } = useQuery({
    queryKey: [
      "inventory-parts-search",
      debouncedSearch,
      vehicle?.id,
      vehicle?.make,
      vehicle?.model,
      vehicle?.year,
    ],
    queryFn: () =>
      inventoryApi.list({
        search: debouncedSearch,
        is_active: true,
        ...vehicleParams,
      }),
    enabled: debouncedSearch.length > 1,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectPart = (part: Part) => {
    onSelect(part);
    setSearchTerm("");
    setIsOpen(false);
  };

  const handleSelect = async (part: Part) => {
    const fitment = (part as Part & { fitment?: FitmentStatus }).fitment;
    if (vehicle && fitment === "unlikely") {
      const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model]
        .filter(Boolean)
        .join(" ");
      const ok = await confirm({
        title: "Part may not fit this vehicle",
        description: `${part.part_number} — ${part.name} looks incompatible with ${vehicleLabel || "this vehicle"} based on catalog fitment. Add it anyway?`,
        confirmLabel: "Add anyway",
        cancelLabel: "Cancel",
        variant: "destructive",
      });
      if (!ok) return;
    }
    selectPart(part);
  };

  const vehicleHint =
    vehicle && (vehicle.make || vehicle.model || vehicle.year)
      ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
      : null;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={
            vehicleHint
              ? `Search parts for ${vehicleHint}...`
              : "Search inventory parts..."
          }
          className="pl-9"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        {isLoading && (
          <div className="absolute right-2.5 top-2.5">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {isOpen && debouncedSearch.length > 1 && data && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card shadow-lg max-h-60 overflow-auto">
          {data.results.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">No parts found</div>
          ) : (
            <div className="py-1">
              {data.results.map((part) => {
                const fitment = (part as Part & { fitment?: FitmentStatus }).fitment;
                return (
                  <button
                    key={part.id}
                    type="button"
                    className="w-full text-left px-4 py-2 text-sm hover:bg-muted focus:bg-muted flex flex-col items-start gap-1"
                    onClick={() => handleSelect(part)}
                  >
                    <div className="flex justify-between w-full font-medium text-foreground gap-2">
                      <span className="min-w-0 truncate">
                        {part.part_number} - {part.name}
                      </span>
                      <span className="shrink-0 text-muted-foreground text-xs">
                        {part.available_quantity
                          ? `${part.available_quantity} in stock`
                          : "Out of stock"}
                      </span>
                    </div>
                    <div className="flex justify-between w-full text-xs text-muted-foreground gap-2 items-center">
                      <span className="flex items-center gap-1.5 min-w-0">
                        {vehicle ? fitmentBadge(fitment) : null}
                        <span className="truncate">
                          {part.description
                            ? part.description.substring(0, 40) +
                              (part.description.length > 40 ? "..." : "")
                            : "No description"}
                        </span>
                      </span>
                      <span className="shrink-0">
                        {formatCurrency(parseFloat(String(part.selling_price || "0")))}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      <ConfirmDialog />
    </div>
  );
}
