import { NextRequest, NextResponse } from 'next/server';
import {
  applyAuthCookies,
  getDjangoApiBase,
  REFRESH_COOKIE,
  refreshCookieHeader,
  stripTokensFromBody,
} from '@/lib/auth/bff-cookies';

/** BFF token refresh — rotate access token using HttpOnly refresh cookie. */
export async function POST(request: NextRequest) {
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!refresh) {
    return NextResponse.json({ detail: 'Refresh token was not provided.' }, { status: 401 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${getDjangoApiBase()}/auth/token/refresh/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: refreshCookieHeader(refresh)!,
      },
      body: JSON.stringify({ refresh }),
    });
  } catch {
    return NextResponse.json({ detail: 'Refresh unavailable' }, { status: 503 });
  }

  const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;

  if (!upstream.ok) {
    const response = NextResponse.json(data, { status: upstream.status });
    if (upstream.status === 401) {
      const { clearAuthCookies } = await import('@/lib/auth/bff-cookies');
      clearAuthCookies(response);
    }
    return response;
  }

  const response = NextResponse.json(stripTokensFromBody(data));
  applyAuthCookies(response, data as { access?: string; refresh?: string });
  return response;
}
