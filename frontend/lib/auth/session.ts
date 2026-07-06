import { authApi } from "@/lib/api/auth";
import { refreshAccessToken } from "@/lib/auth/refresh-access-token";
import { getAccessToken } from "@/lib/utils/token";
import { useAuthStore } from "@/store/authStore";

let inflightSession: Promise<boolean> | null = null;

/**
 * After login/2FA — tokens are set as HttpOnly cookies by BFF or Django proxy.
 * Optionally warm the session when legacy JSON access is still returned.
 */
export async function applyLoginTokens(_access?: string | null): Promise<void> {
  if (_access) {
    return;
  }
  await refreshAccessToken();
}

/**
 * Restore API auth after a full page load. Zustand may still show the user as
 * logged in while HttpOnly cookies carry the real session.
 */
export async function ensureApiSession(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  if (getAccessToken()) {
    return true;
  }

  if (!useAuthStore.getState().isAuthenticated) {
    return false;
  }

  if (inflightSession) {
    return inflightSession;
  }

  inflightSession = (async () => {
    try {
      const user = await authApi.getCurrentUser();
      useAuthStore.getState().setUser(user);
      return true;
    } catch {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        try {
          const user = await authApi.getCurrentUser();
          useAuthStore.getState().setUser(user);
          return true;
        } catch {
          useAuthStore.getState().logout();
          return false;
        }
      }
      useAuthStore.getState().logout();
      return false;
    }
  })().finally(() => {
    inflightSession = null;
  });

  return inflightSession;
}
