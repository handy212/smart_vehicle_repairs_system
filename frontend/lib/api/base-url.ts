/**
 * Browser: same-origin `/api` (Next.js rewrite) so HttpOnly JWT cookies are sent.
 * Server/SSR: absolute backend URL from env.
 */
export function getServerApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
}

export function getBrowserApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_USE_DIRECT === "true") {
    return getServerApiBaseUrl();
  }
  return "/api";
}

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return getBrowserApiBaseUrl();
  }
  return getServerApiBaseUrl();
}

/**
 * Build an absolute URL for browser navigation (OAuth redirects, etc.).
 * Relative API bases such as `/api` are resolved against the current origin.
 */
export function resolveApiUrl(path: string): string {
  const baseUrl = getApiBaseUrl().replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const absolutePath = `${baseUrl}${normalizedPath}`;

  if (absolutePath.startsWith("http://") || absolutePath.startsWith("https://")) {
    return absolutePath;
  }

  if (typeof window !== "undefined") {
    return new URL(absolutePath, window.location.origin).toString();
  }

  const backendOrigin = getServerApiBaseUrl().replace(/\/api\/?$/, "") || "http://localhost:8000";
  return new URL(absolutePath, backendOrigin).toString();
}

/** Backend origin without `/api` suffix (media, WebSockets). */
export function getBackendOrigin(): string {
  return getServerApiBaseUrl().replace(/\/api\/?$/, "");
}
