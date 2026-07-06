"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { revenueProductsApi } from "@/lib/api/revenue-products";
import {
  QboSearchableSelect,
  type QboSearchableOption,
} from "@/components/integrations/QboSearchableSelect";
import { getUserFacingError } from "@/lib/api/errors";

const NONE_VALUE = "__none__";

type Props = {
  value?: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  className?: string;
};

export function CatalogPartSelect({ value, onChange, disabled, className }: Props) {
  const { data: parts = [], isLoading, isError, error } = useQuery({
    queryKey: ["revenue-products", "catalog-parts"],
    queryFn: () => revenueProductsApi.listCatalogParts(),
    staleTime: 60 * 1000,
  });

  const options = useMemo<QboSearchableOption[]>(() => {
    const rows: QboSearchableOption[] = [
      {
        value: NONE_VALUE,
        label: "— No QBO item template —",
        searchText: "none unmapped",
      },
      ...parts.map((part) => ({
        value: String(part.id),
        label: `${part.part_number} · ${part.name}`,
        searchText: `${part.part_number} ${part.name}`.toLowerCase(),
        hint: "Service catalog item for QuickBooks sync",
      })),
    ];
    return rows;
  }, [parts]);

  const selectedValue = value != null ? String(value) : NONE_VALUE;
  const selectedPart = value != null ? parts.find((part) => part.id === value) : null;
  const displayOptions =
    selectedPart && !parts.some((part) => part.id === selectedPart.id)
      ? [
          ...options.slice(0, 1),
          {
            value: String(selectedPart.id),
            label: `${selectedPart.part_number} · ${selectedPart.name}`,
            searchText: `${selectedPart.part_number} ${selectedPart.name}`.toLowerCase(),
            hint: "Currently linked template",
          },
          ...options.slice(1),
        ]
      : options;

  return (
    <div className="space-y-1.5">
      <QboSearchableSelect
        value={selectedValue}
        onValueChange={(next) => {
          if (disabled) {
            return;
          }
          onChange(next === NONE_VALUE ? null : Number(next));
        }}
        options={displayOptions}
        placeholder={isLoading ? "Loading templates…" : "Select service catalog item…"}
        emptyMessage={
          isError
            ? getUserFacingError(error, "Could not load item templates.")
            : "No templates found. Run seed_owner_revenue_products on the server."
        }
        className={className}
      />
      <p className="text-[10px] text-muted-foreground">
        Links this income category to a service catalog part that syncs to QuickBooks as an Item.
      </p>
      {isError ? (
        <p className="text-[10px] text-destructive">
          {getUserFacingError(error, "Could not load catalog templates.")}
        </p>
      ) : null}
    </div>
  );
}
