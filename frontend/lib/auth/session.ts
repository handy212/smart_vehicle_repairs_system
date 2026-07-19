import { authApi } from "@/lib/api/auth";
import { refreshAccessToken } from "@/lib/auth/refresh-access-token";
import { getAccessToken } from "@/lib/utils/token";
import { useAuthStore } from "@/store/authStore";

export type ApiSessionOutcome =
  | { status: "authenticated" }
  | { status: "expired" }
  | { status: "transient"; error: unknown };

let inflightSession: Promise<ApiSessionOutcome> | null = null;

function isDefinitiveAuthError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "AUTH_EXPIRED") return true;
  if ("response" in error) {
    return (error as { response?: { status?: number } }).response?.status === 401;
  }
  return false;
}

/**
 * After login/2FA — tokens are set as HttpOnly cookies by BFF or Django proxy.
 * Optionally warm the session when legacy JSON access is still returned.
 */
export async function applyLoginTokens(_access?: string | null): Promise<void> {
  if (_access) {
    return;
  }
  const outcome = await refreshAccessToken();
  if (outcome.status === "expired") {
    useAuthStore.getState().logout();
    throw new Error("Session expired");
  }
  if (outcome.status === "transient") {
    throw outcome.error;
  }
}

/**
 * Restore API auth after a full page load. Zustand may still show the user as
 * logged in while HttpOnly cookies carry the real session.
 */
export async function getApiSessionOutcome(): Promise<ApiSessionOutcome> {
  if (typeof window === "undefined") {
    return { status: "expired" };
  }

  if (getAccessToken()) {
    return { status: "authenticated" };
  }

  if (!useAuthStore.getState().isAuthenticated) {
    return { status: "expired" };
  }

  if (inflightSession) {
    return inflightSession;
  }

  const sessionCheck = (async (): Promise<ApiSessionOutcome> => {
    try {
      const user = await authApi.getCurrentUser();
      useAuthStore.getState().setUser(user);
      return { status: "authenticated" };
    } catch (error) {
      if (isDefinitiveAuthError(error)) {
        useAuthStore.getState().logout();
        return { status: "expired" };
      }
      // A rate limit, backend outage, or network failure does not invalidate
      // the persisted session. Keep the cached user while connectivity recovers.
      return { status: "transient", error };
    }
  })();
  inflightSession = sessionCheck.finally(() => {
    inflightSession = null;
  });

  return sessionCheck;
}

/**
 * Backward-compatible gate for callers that can continue with cached state
 * during a transient outage.
 */
export async function ensureApiSession(): Promise<boolean> {
  const outcome = await getApiSessionOutcome();
  return outcome.status !== "expired";
}
