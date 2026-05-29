/** Extract a human-readable message from a DRF/axios error response. */
export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong"
): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (typeof data !== "object" || data === null) return fallback;

  const record = data as Record<string, unknown>;
  if (typeof record.detail === "string") return record.detail;
  if (typeof record.error === "string") return record.error;

  for (const value of Object.values(record)) {
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  }

  return fallback;
}
