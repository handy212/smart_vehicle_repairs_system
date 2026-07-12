/** JobType.category values used to filter quick-pick concerns */
export type ConcernCategory =
  | "all"
  | "repair"
  | "maintenance"
  | "diagnostic"
  | "inspection"
  | "body"
  | "commercial"
  | "installation";

export interface CommonConcern {
  text: string;
  categories: ConcernCategory[];
}

/**
 * Shared quick-pick customer concerns for intake and work order forms.
 * Categories align with JobType.category; "all" always matches.
 */
export const COMMON_CUSTOMER_CONCERN_ENTRIES: CommonConcern[] = [
  { text: "Check engine light is on", categories: ["all", "diagnostic", "repair"] },
  { text: "Engine makes unusual noise", categories: ["all", "diagnostic", "repair"] },
  { text: "Engine won't start", categories: ["all", "diagnostic", "repair"] },
  { text: "Vehicle is overheating", categories: ["all", "diagnostic", "repair"] },
  { text: "Brakes are making noise", categories: ["all", "repair"] },
  { text: "Brakes feel spongy or soft", categories: ["all", "repair"] },
  { text: "Brake pedal vibrates", categories: ["all", "repair"] },
  { text: "Transmission slipping", categories: ["all", "repair", "diagnostic"] },
  { text: "Transmission shifting rough", categories: ["all", "repair", "diagnostic"] },
  { text: "Steering wheel vibration", categories: ["all", "repair", "diagnostic"] },
  { text: "Vehicle pulls to one side", categories: ["all", "repair", "diagnostic"] },
  { text: "Squeaking or rattling noise", categories: ["all", "repair", "diagnostic"] },
  { text: "Exhaust smoke", categories: ["all", "diagnostic", "repair"] },
  { text: "AC not working", categories: ["all", "repair"] },
  { text: "Heater not working", categories: ["all", "repair"] },
  { text: "Electrical issues", categories: ["all", "repair", "diagnostic", "installation"] },
  { text: "Battery keeps dying", categories: ["all", "repair", "diagnostic"] },
  { text: "Headlights not working", categories: ["all", "repair", "installation"] },
  { text: "Windshield wipers not working", categories: ["all", "repair"] },
  { text: "Oil leak", categories: ["all", "repair", "maintenance"] },
  { text: "Fluid leak (unknown)", categories: ["all", "repair", "diagnostic"] },
  { text: "Flat tire", categories: ["all", "repair", "maintenance"] },
  { text: "Tire wear issues", categories: ["all", "maintenance", "repair"] },
  { text: "Suspension problems", categories: ["all", "repair"] },
  { text: "Alignment needed", categories: ["all", "maintenance", "repair"] },
  { text: "Regular maintenance/service", categories: ["all", "maintenance"] },
  { text: "Oil change needed", categories: ["all", "maintenance"] },
  { text: "Tire rotation needed", categories: ["all", "maintenance"] },
  { text: "State inspection due", categories: ["all", "inspection"] },
  { text: "Safety inspection needed", categories: ["all", "inspection"] },
  { text: "Body damage / collision repair", categories: ["body", "commercial"] },
  { text: "Paint / panel repair needed", categories: ["body"] },
  { text: "Warranty claim / comeback", categories: ["commercial"] },
  { text: "Insurance estimate needed", categories: ["commercial", "body"] },
  { text: "Accessory / equipment installation", categories: ["installation"] },
];

/** Flat list of concern texts (backward compatible). */
export const COMMON_CUSTOMER_CONCERNS = COMMON_CUSTOMER_CONCERN_ENTRIES.map((e) => e.text) as readonly string[];

const POPULAR_DEFAULTS = new Set([
  "Check engine light is on",
  "Engine makes unusual noise",
  "Brakes are making noise",
  "Regular maintenance/service",
  "Oil change needed",
  "AC not working",
  "Electrical issues",
  "State inspection due",
]);

/**
 * Filter common concerns by selected job type categories.
 * When no categories are provided, returns "all" + popular defaults.
 */
export function getCommonConcernsForCategories(
  categories: Array<string | null | undefined> | null | undefined
): string[] {
  const normalized = (categories || [])
    .map((c) => (c || "").trim().toLowerCase())
    .filter(Boolean) as ConcernCategory[];

  if (normalized.length === 0) {
    return COMMON_CUSTOMER_CONCERN_ENTRIES.filter(
      (e) => e.categories.includes("all") && POPULAR_DEFAULTS.has(e.text)
    ).map((e) => e.text);
  }

  const categorySet = new Set(normalized);
  const matched = COMMON_CUSTOMER_CONCERN_ENTRIES.filter((e) =>
    e.categories.some((cat) => cat === "all" || categorySet.has(cat))
  ).map((e) => e.text);

  // Prefer category-specific matches first, then keep "all" items that also match a category
  const specific = COMMON_CUSTOMER_CONCERN_ENTRIES.filter((e) =>
    e.categories.some((cat) => cat !== "all" && categorySet.has(cat))
  ).map((e) => e.text);

  if (specific.length > 0) {
    const seen = new Set(specific);
    for (const text of matched) {
      if (!seen.has(text)) {
        specific.push(text);
        seen.add(text);
      }
    }
    return specific;
  }

  return matched;
}

export function mergeConcernSelections(selected: string[], customText: string): string {
  const lines = [...selected];
  const trimmed = customText.trim();
  if (trimmed) {
    const customLines = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of customLines) {
      if (!lines.includes(line)) lines.push(line);
    }
  }
  return lines.join("\n");
}

export function splitConcernsText(text: string): { selected: string[]; custom: string } {
  const known = new Set(COMMON_CUSTOMER_CONCERNS);
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const selected = lines.filter((line) => known.has(line));
  const custom = lines.filter((line) => !known.has(line));
  return { selected, custom: custom.join("\n") };
}
