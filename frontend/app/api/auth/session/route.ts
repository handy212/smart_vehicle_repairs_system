import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, getDjangoApiBase } from '@/lib/auth/bff-cookies';

/**
 * BFF session check — verify access cookie with Django and return the current user profile.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ ok: false, detail: 'Not authenticated' }, { status: 401 });
  }

  const apiBase = getDjangoApiBase();

  try {
    const verify = await fetch(`${apiBase}/auth/token/verify/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!verify.ok) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const profile = await fetch(`${apiBase}/auth/users/me/`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `${ACCESS_COOKIE}=${token}`,
      },
    });

    if (!profile.ok) {
      return NextResponse.json({ ok: false, detail: 'Profile unavailable' }, { status: 401 });
    }

    const user = await profile.json();
    return NextResponse.json({ ok: true, user });
  } catch {
    return NextResponse.json({ ok: false, detail: 'Session check unavailable' }, { status: 503 });
  }
}
