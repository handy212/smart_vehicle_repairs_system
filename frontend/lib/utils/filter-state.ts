export type FilterPrimitive = string | number | boolean;
// Shared callers currently include both string-only maps and page-specific shapes.
// `any` here preserves that public compatibility while component inputs remain typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FilterState = Record<string, any>;

/**
 * Returns the canonical state emitted by shared filters.
 * Empty strings and nullish values are omitted; meaningful falsy values are kept.
 */
export function normalizeFilterState(filters: FilterState): FilterState {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== "" && value !== null && value !== undefined)
  );
}

export function areFilterStatesEqual(left: FilterState, right: FilterState): boolean {
  const normalizedLeft = normalizeFilterState(left);
  const normalizedRight = normalizeFilterState(right);
  const leftKeys = Object.keys(normalizedLeft);
  const rightKeys = Object.keys(normalizedRight);

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => normalizedLeft[key] === normalizedRight[key])
  );
}
