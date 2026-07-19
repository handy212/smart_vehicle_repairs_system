import { NextResponse } from 'next/server';

/** Match Django `apps.accounts.jwt_cookies` defaults. */
export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'svr_refresh_token';
export const IMPERSONATOR_COOKIE = 'svr_impersonator_refresh';
export const SESSION_PRESENCE_COOKIE = 'svr_session_present';
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

type CookieSameSite = 'lax' | 'strict' | 'none';

type UpstreamCookie = {
  name: string;
  value: string;
  maxAge?: number;
  expires?: Date;
  secure: boolean;
  sameSite?: CookieSameSite;
};

type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

function upstreamSetCookieHeaders(headers?: Headers): string[] {
  if (!headers) return [];

  const values = (headers as HeadersWithSetCookie).getSetCookie?.();
  if (values?.length) return values;

  const combined = headers.get('set-cookie');
  if (!combined) return [];
  return combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/);
}

function parseUpstreamCookie(header: string): UpstreamCookie | undefined {
  const parts = header.split(';').map((part) => part.trim());
  const separator = parts[0]?.indexOf('=') ?? -1;
  if (separator < 1) return undefined;

  const cookie: UpstreamCookie = {
    name: parts[0].slice(0, separator),
    value: parts[0].slice(separator + 1),
    secure: false,
  };

  for (const attribute of parts.slice(1)) {
    const [rawName, ...rawValue] = attribute.split('=');
    const name = rawName.toLowerCase();
    const value = rawValue.join('=');
    if (name === 'max-age' && /^-?\d+$/.test(value)) {
      cookie.maxAge = Number(value);
    } else if (name === 'expires') {
      const expires = new Date(value);
      if (!Number.isNaN(expires.getTime())) cookie.expires = expires;
    } else if (name === 'secure') {
      cookie.secure = true;
    } else if (name === 'samesite') {
      const sameSite = value.toLowerCase();
      if (sameSite === 'lax' || sameSite === 'strict' || sameSite === 'none') {
        cookie.sameSite = sameSite;
      }
    }
  }

  return cookie;
}

function jwtMaxAge(token: string, nowSeconds = Math.floor(Date.now() / 1000)): number | undefined {
  try {
    const payload = token.split('.')[1];
    if (!payload) return undefined;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    if (typeof decoded.exp !== 'number' || !Number.isFinite(decoded.exp)) return undefined;
    return Math.max(0, Math.floor(decoded.exp - nowSeconds));
  } catch {
    return undefined;
  }
}

function cookieMaxAge(cookie: UpstreamCookie, token: string): number | undefined {
  if (cookie.maxAge !== undefined) return cookie.maxAge;
  if (cookie.expires) {
    return Math.max(0, Math.floor((cookie.expires.getTime() - Date.now()) / 1000));
  }
  return jwtMaxAge(token);
}

function authCookiesFromUpstream(headers?: Headers): Map<string, UpstreamCookie> {
  const allowed = new Set([ACCESS_COOKIE, REFRESH_COOKIE, IMPERSONATOR_COOKIE]);
  const cookies = new Map<string, UpstreamCookie>();
  for (const header of upstreamSetCookieHeaders(headers)) {
    const cookie = parseUpstreamCookie(header);
    if (cookie && allowed.has(cookie.name)) cookies.set(cookie.name, cookie);
  }
  return cookies;
}

/**
 * Mirror known upstream auth cookies onto the frontend origin. Token values are
 * accepted only from trusted Django JSON/headers and never returned to client JS.
 */
export function applyAuthCookies(
  response: NextResponse,
  data: AuthTokenPayload,
  upstreamHeaders?: Headers,
  markerFallbackToken?: string,
): void {
  const upstreamCookies = authCookiesFromUpstream(upstreamHeaders);
  const candidates: Array<[string, string | undefined, string]> = [
    [REFRESH_COOKIE, data.refresh, REFRESH_COOKIE_PATH],
    [ACCESS_COOKIE, data.access, '/'],
    [IMPERSONATOR_COOKIE, data.impersonator_refresh, REFRESH_COOKIE_PATH],
  ];
  let markerToken = markerFallbackToken;
  let markerMaxAge = markerFallbackToken ? jwtMaxAge(markerFallbackToken) : undefined;

  for (const [name, jsonToken, path] of candidates) {
    const upstreamCookie = upstreamCookies.get(name);
    const token = upstreamCookie?.value ?? jsonToken;
    if (token === undefined) continue;

    const metadata = upstreamCookie ?? { name, value: token, secure: false };
    const maxAge = cookieMaxAge(metadata, token);
    response.cookies.set(name, token, {
      httpOnly: true,
      secure: metadata.secure || cookieSecure(),
      sameSite: metadata.sameSite ?? 'lax',
      path,
      ...(maxAge !== undefined ? { maxAge } : {}),
    });

    if (name === REFRESH_COOKIE && token && (maxAge === undefined || maxAge > 0)) {
      markerToken = token;
      markerMaxAge = maxAge;
    }
  }

  if (markerToken && (markerMaxAge === undefined || markerMaxAge > 0)) {
    response.cookies.set(SESSION_PRESENCE_COOKIE, '1', {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: 'lax',
      path: '/',
      ...(markerMaxAge !== undefined ? { maxAge: markerMaxAge } : {}),
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
  response.cookies.set(SESSION_PRESENCE_COOKIE, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
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
