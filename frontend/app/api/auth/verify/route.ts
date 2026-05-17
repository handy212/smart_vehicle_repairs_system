import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxies JWT verification to Django SimpleJWT.
 * Used by future BFF/session flows; middleware uses fast local expiry checks.
 */
export async function POST(request: NextRequest) {
    let token: string | undefined;

    try {
        const body = (await request.json()) as { token?: string };
        token = body.token;
    } catch {
        token = undefined;
    }

    token = token || request.cookies.get('access_token')?.value;

    if (!token) {
        return NextResponse.json({ ok: false, detail: 'Token required' }, { status: 401 });
    }

    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
    const verifyUrl = `${apiBase.replace(/\/$/, '')}/auth/token/verify/`;

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
