/**
 * Auth token helpers — Phase B (HttpOnly cookies via Next.js BFF route handlers).
 *
 * Access and refresh tokens live in HttpOnly cookies set by /api/auth/login and /api/auth/refresh.
 * No localStorage or document.cookie mirrors. E2E tests may inject sessionStorage e2e_access.
 */

const ACCESS_TOKEN_KEY = 'access_token';

/** @deprecated Tokens are HttpOnly-only; kept for backward-compatible call sites during migration. */
export function setTokens(_access?: string, _refresh?: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem('refresh_token');
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

/** @deprecated Tokens are HttpOnly-only. */
export function setAccessToken(_access?: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

/**
 * Returns a bearer token only for E2E cross-origin fallbacks.
 * Normal browser auth uses HttpOnly cookies via withCredentials.
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  const e2e = sessionStorage.getItem('e2e_access');
  return e2e || null;
}

/** Refresh token is HttpOnly — not readable from JavaScript. */
export function getRefreshToken(): string | null {
  return null;
}

/** Clear legacy client storage; HttpOnly cookies cleared via /api/auth/logout BFF. */
export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem('refresh_token');
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}
