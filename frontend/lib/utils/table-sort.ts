import type { SortConfig } from "@/components/ui/sortable-header";

/** Cycle sort: asc → desc → off (same behavior as work orders list). */
export function toggleSortConfig(
  current: SortConfig | null,
  field: string,
): SortConfig | null {
  if (current?.field === field) {
    if (current.direction === "asc") {
      return { field, direction: "desc" };
    }
    if (current.direction === "desc") {
      return null;
    }
  }
  return { field, direction: "asc" };
}

export function sortOrderingParam(sortConfig: SortConfig | null): string | undefined {
  if (!sortConfig?.field || !sortConfig.direction) return undefined;
  return `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`;
}

type SortableValue = string | number | boolean | null | undefined;

/** Client-side sort for list endpoints that return full result sets. */
export function sortClientRecords<T>(
  records: T[],
  sortConfig: SortConfig | null,
  getters?: Record<string, (item: T) => SortableValue>,
): T[] {
  if (!sortConfig?.field || !sortConfig.direction) return records;

  const { field, direction } = sortConfig;
  const getValue =
    getters?.[field] ??
    ((item: T) => (item as Record<string, SortableValue>)[field]);

  const multiplier = direction === "asc" ? 1 : -1;

  return [...records].sort((left, right) => {
    const leftValue = getValue(left);
    const rightValue = getValue(right);

    if (leftValue == null && rightValue == null) return 0;
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;

    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * multiplier;
    }

    return String(leftValue).localeCompare(String(rightValue), undefined, {
      numeric: true,
      sensitivity: "base",
    }) * multiplier;
  });
}
