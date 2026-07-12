import { NextRequest, NextResponse } from 'next/server';
import {
  applyAuthCookies,
  authCookieHeader,
  clearImpersonatorCookie,
  getDjangoApiBase,
  IMPERSONATOR_COOKIE,
  REFRESH_COOKIE,
  stripTokensFromBody,
} from '@/lib/auth/bff-cookies';

/** BFF: restore staff session after customer impersonation. */
export async function POST(request: NextRequest) {
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  const impersonatorRefresh = request.cookies.get(IMPERSONATOR_COOKIE)?.value;
  const cookieHeader = authCookieHeader(request.cookies);

  let upstream: Response;
  try {
    upstream = await fetch(`${getDjangoApiBase()}/auth/impersonate/exit/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({
        ...(refresh ? { refresh } : {}),
        ...(impersonatorRefresh ? { impersonator_refresh: impersonatorRefresh } : {}),
      }),
    });
  } catch {
    return NextResponse.json({ detail: 'Exit impersonation unavailable' }, { status: 503 });
  }

  const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  const response = NextResponse.json(stripTokensFromBody(data));
  applyAuthCookies(response, data as { access?: string; refresh?: string });
  clearImpersonatorCookie(response);
  return response;
}
