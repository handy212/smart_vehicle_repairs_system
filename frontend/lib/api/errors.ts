type ApiErrorLike = {
  message?: string;
  response?: {
    data?: unknown;
  };
};

export function getApiErrorMessage(error: unknown, fallback = "Something went wrong") {
  const apiError = error as ApiErrorLike;
  const data = apiError?.response?.data;

  if (!data) {
    return apiError?.message || fallback;
  }

  if (typeof data === "string") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.filter(Boolean).join(", ") || fallback;
  }

  if (typeof data === "object") {
    const errorData = data as Record<string, unknown>;
    if (errorData.detail) return String(errorData.detail);
    if (errorData.message) return String(errorData.message);
    if (errorData.error) return String(errorData.error);

    const messages = Object.entries(errorData)
      .flatMap(([field, value]) => {
        const values = Array.isArray(value) ? value : [value];
        return values.map((message) => `${field}: ${String(message)}`);
      })
      .filter(Boolean);

    return messages.join(", ") || fallback;
  }

  return fallback;
}
