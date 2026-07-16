import { NextResponse } from 'next/server';

/** Match Django `apps.accounts.jwt_cookies` defaults. */
export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'svr_refresh_token';
export const IMPERSONATOR_COOKIE = 'svr_impersonator_refresh';
/** Match Django `JWT_REFRESH_COOKIE_PATH` (trailing slash). */
const REFRESH_COOKIE_PATH = '/api/auth/';

export function getDjangoApiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001/api').replace(/\/$/, '');
}

function cookieSecure(): boolean {
  return process.env.NODE_ENV === 'production';
}

type AuthTokenPayload = {
  access?: string;
  refresh?: string;
  impersonator_refresh?: string;
  requires_2fa?: boolean;
};

/** Set HttpOnly auth cookies on a Next.js response (frontend origin). */
export function applyAuthCookies(
  response: NextResponse,
  data: AuthTokenPayload,
): void {
  const secure = cookieSecure();

  if (data.refresh) {
    response.cookies.set(REFRESH_COOKIE, data.refresh, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: 24 * 60 * 60,
    });
  }

  if (data.access) {
    response.cookies.set(ACCESS_COOKIE, data.access, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60,
    });
  }

  if (data.impersonator_refresh) {
    response.cookies.set(IMPERSONATOR_COOKIE, data.impersonator_refresh, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: 24 * 60 * 60,
    });
  }
}

/** Clear auth cookies on logout. */
export function clearAuthCookies(response: NextResponse): void {
  const secure = cookieSecure();
  response.cookies.set(ACCESS_COOKIE, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(REFRESH_COOKIE, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: 0,
  });
  response.cookies.set(IMPERSONATOR_COOKIE, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: 0,
  });
}

export function clearImpersonatorCookie(response: NextResponse): void {
  const secure = cookieSecure();
  response.cookies.set(IMPERSONATOR_COOKIE, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: 0,
  });
}

/** Strip tokens from JSON returned to the browser. */
export function stripTokensFromBody<T extends Record<string, unknown>>(data: T): T {
  const next = { ...data };
  delete next.access;
  delete next.refresh;
  delete next.impersonator_refresh;
  return next;
}

/** Forward refresh cookie to Django refresh endpoint. */
export function refreshCookieHeader(cookieValue: string | undefined): string | undefined {
  if (!cookieValue) return undefined;
  return `${REFRESH_COOKIE}=${cookieValue}`;
}

export function authCookieHeader(requestCookies: {
  get: (name: string) => { value: string } | undefined;
}): string {
  const parts: string[] = [];
  const access = requestCookies.get(ACCESS_COOKIE)?.value;
  const refresh = requestCookies.get(REFRESH_COOKIE)?.value;
  const impersonator = requestCookies.get(IMPERSONATOR_COOKIE)?.value;
  if (access) parts.push(`${ACCESS_COOKIE}=${access}`);
  if (refresh) parts.push(`${REFRESH_COOKIE}=${refresh}`);
  if (impersonator) parts.push(`${IMPERSONATOR_COOKIE}=${impersonator}`);
  return parts.join('; ');
}
