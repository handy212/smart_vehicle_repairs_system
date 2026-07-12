/** Ghana's 16 administrative regions */
export const GHANA_REGIONS = [
  "Ahafo",
  "Ashanti",
  "Bono",
  "Bono East",
  "Central",
  "Eastern",
  "Greater Accra",
  "North East",
  "Northern",
  "Oti",
  "Savannah",
  "Upper East",
  "Upper West",
  "Volta",
  "Western",
  "Western North",
] as const;

export type GhanaRegion = (typeof GHANA_REGIONS)[number];

export function formatBranchLocation(branch: {
  area?: string | null;
  city?: string | null;
  region?: string | null;
  /** @deprecated use region */
  state?: string | null;
}): string {
  const region = branch.region || branch.state || "";
  return [branch.area, branch.city, region].filter(Boolean).join(", ");
}
