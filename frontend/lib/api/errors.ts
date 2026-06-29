type ApiErrorLike = {
  message?: string;
  userMessage?: string;
  response?: {
    status?: number;
    data?: unknown;
  };
};

const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: "Please check the information you entered and try again.",
  401: "Your session has expired. Please sign in again.",
  403: "You don't have permission to do that. Contact your administrator if you need access.",
  404: "We couldn't find what you're looking for. It may have been moved or deleted.",
  409: "This action conflicts with existing data. Refresh the page and try again.",
  422: "Some of the information provided isn't valid. Please review and try again.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "Something went wrong on our end. Please try again in a moment.",
  503: "The system is temporarily unavailable. Please try again shortly.",
};

const FIELD_LABELS: Record<string, string> = {
  customer: "Customer",
  vehicle: "Vehicle",
  work_order: "Work order",
  appointment_date: "Appointment date",
  appointment_time: "Appointment time",
  service_type: "Service type",
  email: "Email",
  phone: "Phone",
  vin: "VIN",
  license_plate: "License plate",
  part_number: "Part number",
  bank_account: "Bank account",
  cash_account: "Cash account",
  payment_method: "Payment method",
  lines: "Bills to pay",
  non_field_errors: "Error",
  detail: "Error",
  error: "Error",
};

function stripTechnicalMessage(message: string, status?: number): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return status ? HTTP_STATUS_MESSAGES[status] ?? "Something went wrong." : "Something went wrong.";
  }

  if (/^Request failed with status code \d+$/i.test(trimmed)) {
    const match = trimmed.match(/\d+/);
    const code = match ? Number(match[0]) : status;
    return code ? HTTP_STATUS_MESSAGES[code] ?? "Something went wrong." : "Something went wrong.";
  }

  if (trimmed === "Network Error") {
    return "Unable to reach the server. Check your connection and try again.";
  }

  if (trimmed.startsWith("Internal server error:")) {
    return HTTP_STATUS_MESSAGES[500];
  }

  return trimmed;
}

function formatFieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatBlockingList(
  items: unknown[],
  pickLabel: (item: Record<string, unknown>) => string | undefined,
  itemLabel: string,
): string | null {
  const names = items
    .map((entry) => (typeof entry === "object" && entry !== null ? pickLabel(entry as Record<string, unknown>) : undefined))
    .filter((name): name is string => Boolean(name && name.trim()));

  if (!names.length) return null;

  const list = names.slice(0, 4).join(", ");
  const more = names.length > 4 ? `, +${names.length - 4} more` : "";
  return `${itemLabel}: ${list}${more}.`;
}

function extractWorkflowBlockers(data: Record<string, unknown>): string | null {
  const taskBlockers = Array.isArray(data.blocking_tasks)
    ? formatBlockingList(data.blocking_tasks, (task) => String(task.description || ""), "Blocking tasks")
    : null;
  if (taskBlockers) {
    const prefix =
      typeof data.next_step === "string" && data.next_step.trim()
        ? data.next_step.trim()
        : "Open the Tasks tab and resolve the blocking tasks.";
    return `${prefix} ${taskBlockers}`.trim();
  }

  const partBlockers = Array.isArray(data.blocking_parts)
    ? formatBlockingList(data.blocking_parts, (part) => String(part.part_name || part.name || ""), "Blocking parts")
    : null;
  if (partBlockers) {
    const prefix =
      typeof data.next_step === "string" && data.next_step.trim()
        ? data.next_step.trim()
        : "Open the Parts tab and resolve the blocking parts.";
    return `${prefix} ${partBlockers}`.trim();
  }

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors.filter(Boolean).map(String).join("; ");
  }

  return null;
}

function extractFromObject(data: Record<string, unknown>, fallback: string): string {
  const workflowMessage = extractWorkflowBlockers(data);
  if (workflowMessage) {
    return workflowMessage;
  }

  if (typeof data.detail === "string" && data.detail.trim()) {
    return data.detail;
  }
  if (Array.isArray(data.detail) && data.detail.length > 0) {
    return String(data.detail[0]);
  }
  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }
  if (typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }
  if (typeof data.next_step === "string" && data.next_step.trim()) {
    const base =
      typeof data.error === "string" && data.error.trim()
        ? data.error
        : "This action can't be completed yet.";
    return `${base} ${data.next_step}`.trim();
  }

  const messages = Object.entries(data)
    .filter(([field]) => !["pay_as_you_go_available", "blocking_tasks", "blocking_parts"].includes(field))
    .flatMap(([field, value]) => {
      const label = formatFieldLabel(field);
      const values = Array.isArray(value) ? value : [value];
      return values
        .filter((entry) => entry !== null && entry !== undefined && String(entry).trim())
        .map((entry) => `${label}: ${String(entry)}`);
    });

  return messages.join(" ") || fallback;
}

/** User-facing message from an API or network error. */
export function getUserFacingError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;

  const apiError = error as ApiErrorLike & { isOffline?: boolean; queued?: boolean };
  if (apiError.isOffline || apiError.queued || (apiError.response?.data as Record<string, unknown> | undefined)?.queued) {
    return (
      (apiError.response?.data as Record<string, unknown> | undefined)?.message as string | undefined ||
      apiError.userMessage ||
      "Your changes were saved offline and will sync when you're back online."
    );
  }

  if (typeof apiError.userMessage === "string" && apiError.userMessage.trim()) {
    return apiError.userMessage;
  }

  const status = apiError.response?.status;
  const data = apiError.response?.data;

  if (!data) {
    return stripTechnicalMessage(apiError.message || fallback, status);
  }

  if (typeof data === "string") {
    return stripTechnicalMessage(data, status);
  }

  if (Array.isArray(data)) {
    const joined = data.filter(Boolean).map(String).join(", ");
    return joined || (status ? HTTP_STATUS_MESSAGES[status] ?? fallback : fallback);
  }

  if (typeof data === "object" && data !== null) {
    const message = extractFromObject(data as Record<string, unknown>, fallback);
    return stripTechnicalMessage(message, status);
  }

  return status ? HTTP_STATUS_MESSAGES[status] ?? fallback : fallback;
}

/** @deprecated Use getUserFacingError — kept for existing imports. */
export function getApiErrorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  return getUserFacingError(error, fallback);
}

export function getPermissionDeniedMessage(action = "access this area"): string {
  return `You don't have permission to ${action}. Contact your administrator if you need access.`;
}
