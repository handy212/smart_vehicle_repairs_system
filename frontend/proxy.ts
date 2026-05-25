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
    '/feedback',
    '/api',
    '/media',
    '/offline',
    '/favicon.ico',
    '/manifest.json',
    '/sw.js',
    '/workbox-',
    '/_next',
];

/** Authenticated customer portal routes (first path segment after /portal/) */
const PORTAL_AUTH_SEGMENTS = new Set([
    'work-orders',
    'vehicles',
    'estimates',
    'roadside',
    'notifications',
    'inspections',
    'subscriptions',
    'book',
    'invoices',
    'payment',
    'payments',
    'search',
    'appointments',
    'profile',
    'history',
]);

function isPublicPortalEstimateRoute(pathname: string): boolean {
    if (!pathname.startsWith('/portal')) {
        return false;
    }
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length !== 2 || segments[0] !== 'portal') {
        return false;
    }
    const token = segments[1];
    if (PORTAL_AUTH_SEGMENTS.has(token)) {
        return false;
    }
    return /^[0-9a-f-]{20,}$/i.test(token);
}

function isPublicPath(pathname: string): boolean {
    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
        return true;
    }
    if (isPublicPortalEstimateRoute(pathname)) {
        return true;
    }
    return false;
}

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (isPublicPath(pathname)) {
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
