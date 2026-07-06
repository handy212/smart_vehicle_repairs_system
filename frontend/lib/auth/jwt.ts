/**
 * Lightweight JWT helpers for edge middleware.
 *
 * Validates structure and expiry only (no signature verification).
 * Full authentication remains on the Django API (Bearer + refresh).
 * See docs/auth-hardening.md for the httpOnly / BFF roadmap.
 */

export type JwtPayload = {
    exp?: number;
    user_id?: number;
    token_type?: string;
    [key: string]: unknown;
};

export function decodeJwtPayload(token: string): JwtPayload | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
        return null;
    }

    try {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
        const json = atob(padded);
        return JSON.parse(json) as JwtPayload;
    } catch {
        return null;
    }
}

/** Returns false when token is missing, malformed, or past exp. */
export function isAccessTokenUsable(token: string | null | undefined): boolean {
    if (!token) {
        return false;
    }

    const payload = decodeJwtPayload(token);
    if (!payload) {
        return false;
    }

    if (payload.token_type && payload.token_type !== 'access') {
        return false;
    }

    if (typeof payload.exp === 'number') {
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (payload.exp <= nowSeconds) {
            return false;
        }
    }

    return true;
}
