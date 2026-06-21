import { authApi } from "@/lib/api/auth";

let inflightRefresh: Promise<boolean> | null = null;

/**
 * Single in-flight refresh via BFF /api/auth/refresh (HttpOnly cookie rotation).
 */
export function refreshAccessToken(): Promise<boolean> {
  if (inflightRefresh) {
    return inflightRefresh;
  }

  inflightRefresh = authApi
    .refreshToken()
    .then(() => true)
    .catch(() => false)
    .finally(() => {
      inflightRefresh = null;
    });

  return inflightRefresh;
}
