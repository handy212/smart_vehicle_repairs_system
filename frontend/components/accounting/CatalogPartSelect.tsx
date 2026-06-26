"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import {
  QboSearchableSelect,
  type QboSearchableOption,
} from "@/components/integrations/QboSearchableSelect";

const NONE_VALUE = "__none__";

type Props = {
  value?: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  className?: string;
};

export function CatalogPartSelect({ value, onChange, disabled, className }: Props) {
  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ["catalog-parts", "service"],
    queryFn: () =>
      inventoryApi.list({
        search: "REV-",
        item_type: "service",
        is_active: true,
        page: 1,
        ordering: "part_number",
      }),
    staleTime: 60 * 1000,
  });

  const { data: selectedPart, isLoading: selectedLoading } = useQuery({
    queryKey: ["catalog-parts", "selected", value],
    queryFn: () => inventoryApi.get(value!),
    enabled: value != null,
  });

  const parts = useMemo(() => {
    const rows = searchData?.results ?? [];
    if (selectedPart && !rows.some((part) => part.id === selectedPart.id)) {
      return [selectedPart, ...rows];
    }
    return rows;
  }, [searchData?.results, selectedPart]);

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
        searchText: `${part.part_number} ${part.name} ${part.item_type ?? ""}`.toLowerCase(),
        hint: part.qbo_sync_status ? `QBO: ${part.qbo_sync_status}` : "Service catalog item",
      })),
    ];
    return rows;
  }, [parts]);

  const selectedValue = value != null ? String(value) : NONE_VALUE;
  const loading = searchLoading || (value != null && selectedLoading);

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
        options={options}
        placeholder={loading ? "Loading catalog items…" : "Select service catalog item…"}
        emptyMessage="No service catalog items found. Run seed or create REV-* service parts."
        className={className}
      />
      <p className="text-[10px] text-muted-foreground">
        Service/non-inventory part synced to QuickBooks as the Item for this income category.
      </p>
    </div>
  );
}
