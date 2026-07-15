import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAccessTokenUsable } from '@/lib/auth/jwt';

function getApiBase(): string {
    return (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001/api').replace(/\/$/, '');
}

function getBackendBase(): string {
    return getApiBase().replace(/\/api\/?$/, '');
}

/**
 * Next.js App Router handlers under `app/api/*` — must not be rewritten to Django.
 * Everything else under `/api/*` is proxied to the Django API.
 */
const BFF_ROUTES = new Set([
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/refresh',
    '/api/auth/session',
    '/api/auth/verify',
    '/api/auth/ws-ticket',
    '/api/auth/impersonate',
    '/api/auth/impersonate/exit',
    '/api/revalidate-branding',
]);

function isBffRoute(pathname: string): boolean {
    return BFF_ROUTES.has(pathname);
}

/** Proxy /api and /media to Django (avoids Next trailing-slash redirects that break POST + cookies). */
function rewriteBackend(request: NextRequest): NextResponse | null {
    const { pathname, search } = request.nextUrl;

    if (isBffRoute(pathname)) {
        return null;
    }

    if (pathname.startsWith('/api/') || pathname === '/api') {
        const subPath = pathname === '/api' ? '' : pathname.slice('/api/'.length);
        const destination = subPath
            ? `${getApiBase()}/${subPath}${search}`
            : `${getApiBase()}${search}`;
        return NextResponse.rewrite(new URL(destination));
    }

    if (pathname.startsWith('/media/')) {
        const subPath = pathname.slice('/media/'.length);
        const destination = `${getBackendBase()}/media/${subPath}${search}`;
        return NextResponse.rewrite(new URL(destination));
    }

    // Short public document PDF links (WhatsApp) — always anonymous
    if (pathname.startsWith('/d/')) {
        const code = pathname.slice('/d/'.length).replace(/\/+$/, '');
        if (code) {
            return NextResponse.rewrite(new URL(`${getBackendBase()}/d/${code}/${search}`));
        }
    }

    return null;
}

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
    '/d/',
    '/offline',
    '/favicon.ico',
    '/manifest.json',
    '/sw.js',
    '/workbox-',
    '/worker-',
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
    const backendRewrite = rewriteBackend(request);
    if (backendRewrite) {
        return backendRewrite;
    }

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
        // Expired access cookie is still refreshable via /api/auth/refresh (HttpOnly
        // refresh cookie). Only redirect when there is no session cookie at all.
        if (token) {
            return NextResponse.next();
        }

        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('next', pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        // Must run before the catch-all: image extensions are excluded there but /media/* are images
        '/media/:path*',
        '/d/:path*',
        '/api',
        '/api/:path*',
        '/((?!_next/static|_next/image|favicon.ico|media/|api/|d/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    ],
};
