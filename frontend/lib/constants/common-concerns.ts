/** Shared quick-pick customer concerns for intake and work order forms */
export const COMMON_CUSTOMER_CONCERNS = [
  "Check engine light is on",
  "Engine makes unusual noise",
  "Engine won't start",
  "Vehicle is overheating",
  "Brakes are making noise",
  "Brakes feel spongy or soft",
  "Brake pedal vibrates",
  "Transmission slipping",
  "Transmission shifting rough",
  "Steering wheel vibration",
  "Vehicle pulls to one side",
  "Squeaking or rattling noise",
  "Exhaust smoke",
  "AC not working",
  "Heater not working",
  "Electrical issues",
  "Battery keeps dying",
  "Headlights not working",
  "Windshield wipers not working",
  "Oil leak",
  "Fluid leak (unknown)",
  "Flat tire",
  "Tire wear issues",
  "Suspension problems",
  "Alignment needed",
  "Regular maintenance/service",
  "Oil change needed",
  "Tire rotation needed",
  "State inspection due",
  "Safety inspection needed",
] as const;

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
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const selected = lines.filter((line) =>
    (COMMON_CUSTOMER_CONCERNS as readonly string[]).includes(line)
  );
  const custom = lines.filter(
    (line) => !(COMMON_CUSTOMER_CONCERNS as readonly string[]).includes(line)
  );
  return { selected, custom: custom.join("\n") };
}
