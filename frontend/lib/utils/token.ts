/**
 * In-memory access token (never localStorage — reduces XSS persistence).
 * HttpOnly access_token cookie is set by Django for API + Next.js edge auth.
 * Refresh token is HttpOnly-only on the API host.
 */

const ACCESS_TOKEN_KEY = 'access_token';

let accessTokenMemory: string | null = null;

/** Non-httpOnly mirror for Next.js edge middleware on the frontend origin. */
function setEdgeAccessCookie(access: string) {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? 'Secure;' : '';
  document.cookie = `${ACCESS_TOKEN_KEY}=${encodeURIComponent(access)}; path=/; max-age=3600; SameSite=Lax; ${secure}`;
}

function deleteEdgeAccessCookie() {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? 'Secure;' : '';
  document.cookie = `${ACCESS_TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax; ${secure}`;
}

/** Store access in memory; API sets HttpOnly cookie; edge gets a same-origin mirror. */
export function setTokens(access: string, _refresh?: string) {
  if (typeof window === 'undefined') return;
  accessTokenMemory = access;
  setEdgeAccessCookie(access);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem('refresh_token');
}

export function setAccessToken(access: string) {
  if (typeof window === 'undefined') return;
  accessTokenMemory = access;
  setEdgeAccessCookie(access);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  if (accessTokenMemory) {
    return accessTokenMemory;
  }
  const e2e = sessionStorage.getItem('e2e_access');
  return e2e || null;
}

/** Refresh token is HttpOnly — not readable from JavaScript. */
export function getRefreshToken(): string | null {
  return null;
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  accessTokenMemory = null;
  deleteEdgeAccessCookie();
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem('refresh_token');
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}
