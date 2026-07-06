import { NextRequest, NextResponse } from 'next/server';
import {
  clearAuthCookies,
  getDjangoApiBase,
  REFRESH_COOKIE,
  refreshCookieHeader,
} from '@/lib/auth/bff-cookies';

/** BFF logout — blacklist refresh token on Django and clear HttpOnly cookies. */
export async function POST(request: NextRequest) {
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  try {
    await fetch(`${getDjangoApiBase()}/auth/logout/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(refresh ? { Cookie: refreshCookieHeader(refresh)! } : {}),
      },
      body: JSON.stringify(refresh ? { refresh } : {}),
    });
  } catch {
    // Still clear cookies when API is unreachable
  }

  const response = NextResponse.json({ detail: 'Successfully logged out.' });
  clearAuthCookies(response);
  return response;
}
