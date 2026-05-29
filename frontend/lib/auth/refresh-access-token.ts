import { authApi } from "@/lib/api/auth";
import { setAccessToken } from "@/lib/utils/token";

let inflightRefresh: Promise<string | null> | null = null;

/**
 * Single in-flight refresh to avoid duplicate POST /auth/token/refresh/ 401 noise.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (inflightRefresh) {
    return inflightRefresh;
  }

  inflightRefresh = authApi
    .refreshToken()
    .then(({ access }) => {
      if (access) {
        setAccessToken(access);
        return access;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      inflightRefresh = null;
    });

  return inflightRefresh;
}
