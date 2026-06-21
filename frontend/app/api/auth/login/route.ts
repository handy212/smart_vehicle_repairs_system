import { NextRequest, NextResponse } from 'next/server';
import {
  applyAuthCookies,
  getDjangoApiBase,
  stripTokensFromBody,
} from '@/lib/auth/bff-cookies';

/** BFF login — proxy credentials to Django and set HttpOnly cookies on the frontend origin. */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON body' }, { status: 400 });
  }

  const upstream = await fetch(`${getDjangoApiBase()}/auth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  if (data.requires_2fa) {
    return NextResponse.json(data);
  }

  const response = NextResponse.json(stripTokensFromBody(data));
  applyAuthCookies(response, data as { access?: string; refresh?: string });
  return response;
}
