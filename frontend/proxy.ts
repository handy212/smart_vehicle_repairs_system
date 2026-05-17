import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAccessTokenUsable } from '@/lib/auth/jwt';

/**
 * Next.js Middleware — Server-side authentication gate.
 *
 * Rejects missing, malformed, or expired access tokens before serving protected routes.
 * Signature verification remains on the Django API; see docs/auth-hardening.md.
 */

const PUBLIC_PATHS = [
    '/login',
    '/register',
    '/maintenance',
    '/portal',
    '/api',
    '/media',
    '/offline',
    '/mobile',
    '/favicon.ico',
    '/manifest.json',
    '/sw.js',
    '/workbox-',
    '/_next',
];

const PUBLIC_ROUTE_GROUPS = ['(public)'];

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
        return NextResponse.next();
    }

    if (PUBLIC_ROUTE_GROUPS.some((g) => pathname.includes(g))) {
        return NextResponse.next();
    }

    if (pathname === '/') {
        return NextResponse.next();
    }

    const token =
        request.cookies.get('access_token')?.value ||
        request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

    if (!isAccessTokenUsable(token)) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('next', pathname);
        const response = NextResponse.redirect(loginUrl);
        if (token) {
            response.cookies.delete('access_token');
        }
        return response;
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    ],
};
