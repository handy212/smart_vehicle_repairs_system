import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, getDjangoApiBase } from '@/lib/auth/bff-cookies';

/**
 * Proxies JWT verification to Django SimpleJWT.
 * Reads the HttpOnly access_token cookie set by BFF login/refresh.
 */
export async function POST(request: NextRequest) {
    let token: string | undefined;

    try {
        const body = (await request.json()) as { token?: string };
        token = body.token;
    } catch {
        token = undefined;
    }

    token = token || request.cookies.get(ACCESS_COOKIE)?.value;

    if (!token) {
        return NextResponse.json({ ok: false, detail: 'Token required' }, { status: 401 });
    }

    const verifyUrl = `${getDjangoApiBase()}/auth/token/verify/`;

    try {
        const upstream = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        });

        if (!upstream.ok) {
            return NextResponse.json({ ok: false }, { status: 401 });
        }

        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ ok: false, detail: 'Verification unavailable' }, { status: 503 });
    }
}
