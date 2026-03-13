/**
 * Token storage utilities.
 *
 * Keeps JWT tokens in both localStorage (for client-side API calls via Axios)
 * AND a plain cookie (so Next.js middleware can check auth server-side).
 *
 * The cookie is NOT httpOnly — the middleware reads it from `request.cookies`,
 * and the client needs to write it. This is an incremental improvement;
 * a full BFF pattern would use httpOnly cookies set by the backend.
 */

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const COOKIE_PATH = '/';

function setCookie(name: string, value: string, maxAgeSeconds = 3600) {
    if (typeof document === 'undefined') return;
    const secure = window.location.protocol === 'https:' ? 'Secure;' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; path=${COOKIE_PATH}; max-age=${maxAgeSeconds}; SameSite=Lax; ${secure}`;
}

function deleteCookie(name: string) {
    if (typeof document === 'undefined') return;
    const secure = window.location.protocol === 'https:' ? 'Secure;' : '';
    document.cookie = `${name}=; path=${COOKIE_PATH}; max-age=0; SameSite=Lax; ${secure}`;
}

/** Store both access and refresh tokens */
export function setTokens(access: string, refresh: string) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
    // Cookie for server-side middleware check (1h = access token lifetime)
    setCookie(ACCESS_TOKEN_KEY, access, 3600);
}

/** Update just the access token (e.g. after refresh) */
export function setAccessToken(access: string) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    setCookie(ACCESS_TOKEN_KEY, access, 3600);
}

/** Read the access token from localStorage */
export function getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/** Read the refresh token from localStorage */
export function getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Clear all tokens (localStorage + cookie) */
export function clearTokens() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    deleteCookie(ACCESS_TOKEN_KEY);
}
