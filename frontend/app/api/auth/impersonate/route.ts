import { NextRequest, NextResponse } from 'next/server';
import {
  applyAuthCookies,
  authCookieHeader,
  getDjangoApiBase,
  REFRESH_COOKIE,
  stripTokensFromBody,
} from '@/lib/auth/bff-cookies';

/** BFF: staff starts a customer portal session. */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON body' }, { status: 400 });
  }

  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  const cookieHeader = authCookieHeader(request.cookies);

  let upstream: Response;
  try {
    upstream = await fetch(`${getDjangoApiBase()}/auth/impersonate/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({
        ...(typeof body === 'object' && body ? body : {}),
        ...(refresh ? { refresh } : {}),
      }),
    });
  } catch {
    return NextResponse.json({ detail: 'Impersonation unavailable' }, { status: 503 });
  }

  const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  const response = NextResponse.json(stripTokensFromBody(data));
  applyAuthCookies(response, data as {
    access?: string;
    refresh?: string;
    impersonator_refresh?: string;
  });
  return response;
}
