import { authApi } from "@/lib/api/auth";
import { getAccessToken, setAccessToken, setTokens } from "@/lib/utils/token";
import { useAuthStore } from "@/store/authStore";

/** After login/2FA when tokens may be HttpOnly-only (no access in JSON). */
export async function applyLoginTokens(access?: string | null): Promise<void> {
  if (access) {
    setTokens(access);
    return;
  }
  try {
    const { access: refreshed } = await authApi.refreshToken();
    if (refreshed) {
      setAccessToken(refreshed);
    }
  } catch {
    // Cookie-only session; subsequent getCurrentUser validates via JWTCookieAuthentication.
  }
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

  try {
    const { access } = await authApi.refreshToken();
    if (access) {
      setAccessToken(access);
      return true;
    }
  } catch {
    // Fall through — cookie-only session may still work once JWTCookieAuthentication runs.
  }

  try {
    const user = await authApi.getCurrentUser();
    useAuthStore.getState().setUser(user);
    return true;
  } catch {
    useAuthStore.getState().logout();
    return false;
  }
}
