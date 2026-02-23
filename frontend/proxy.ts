import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Middleware — Server-side authentication gate.
 *
 * Checks for an access_token cookie before serving any protected route.
 * Public paths (login, register, portal, public feedback, API proxy, static
 * assets) are allowed through unconditionally.
 *
 * NOTE: This provides a *fast-fail* redirect for unauthenticated users.
 * The actual JWT validation still happens on the Django backend; the
 * middleware only checks for the *presence* of the token cookie/header.
 */

const PUBLIC_PATHS = [
    '/login',
    '/register',
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

// Public route groups (Next.js route group syntax)
const PUBLIC_ROUTE_GROUPS = ['(public)'];

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow public paths
    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
        return NextResponse.next();
    }

    // Allow public route groups
    if (PUBLIC_ROUTE_GROUPS.some((g) => pathname.includes(g))) {
        return NextResponse.next();
    }

    // Allow root page (redirects to login or dashboard on the client)
    if (pathname === '/') {
        return NextResponse.next();
    }

    // Check for token — look in cookies first, then fall back to localStorage
    // (localStorage is not available in middleware, so we rely on the cookie)
    const token =
        request.cookies.get('access_token')?.value ||
        request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('next', pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all paths except:
         * - _next/static (static files)
         * - _next/image (image optimization)
         * - favicon.ico
         * - public folder assets
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    ],
};
