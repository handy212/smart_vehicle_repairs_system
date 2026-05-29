import { authApi } from "@/lib/api/auth";
import { refreshAccessToken } from "@/lib/auth/refresh-access-token";
import { getAccessToken, setTokens } from "@/lib/utils/token";
import { useAuthStore } from "@/store/authStore";

let inflightSession: Promise<boolean> | null = null;

/** After login/2FA when tokens may be HttpOnly-only (no access in JSON). */
export async function applyLoginTokens(access?: string | null): Promise<void> {
  if (access) {
    setTokens(access);
    return;
  }
  await refreshAccessToken();
}

/**
 * Restore API auth after a full page load. Zustand may still show the user as
 * logged in while the in-memory access token was cleared.
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
    const access = await refreshAccessToken();
    if (access) {
      return true;
    }

    try {
      const user = await authApi.getCurrentUser();
      useAuthStore.getState().setUser(user);
      return true;
    } catch {
      useAuthStore.getState().logout();
      return false;
    }
  })().finally(() => {
    inflightSession = null;
  });

  return inflightSession;
}
