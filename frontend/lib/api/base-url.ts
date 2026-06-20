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

/** Backend origin without `/api` suffix (media, WebSockets). */
export function getBackendOrigin(): string {
  return getServerApiBaseUrl().replace(/\/api\/?$/, "");
}
