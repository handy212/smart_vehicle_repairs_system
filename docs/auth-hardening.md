# Authentication hardening roadmap

This document describes the current JWT auth model, incremental improvements in the Next.js app, and the target **httpOnly cookie / BFF** pattern.

## Current model

| Layer | Behavior |
|-------|----------|
| Django API | Issues JWT access + refresh via `POST /api/auth/token/` (SimpleJWT) |
| Next.js client | Stores tokens in `localStorage` and a **non-httpOnly** `access_token` cookie for middleware |
| Middleware | [`frontend/proxy.ts`](../frontend/proxy.ts) — redirects unauthenticated users away from protected routes |
| API calls | Axios attaches `Authorization: Bearer` and refreshes on 401 ([`frontend/lib/api/client.ts`](../frontend/lib/api/client.ts)) |

**Risk:** Tokens in `localStorage` are readable by any XSS script. The cookie exists only so middleware can perform a fast redirect without loading the SPA.

## Implemented

1. **JWT shape and expiry check at the edge** — [`frontend/lib/auth/jwt.ts`](../frontend/lib/auth/jwt.ts) decodes the access token and rejects missing, malformed, or expired tokens before serving protected pages. This does **not** verify the signature (the secret must not live in the frontend).

2. **Phase B — HttpOnly cookies (BFF)** — Next.js Route Handlers proxy login, logout, refresh, and session to Django and set `httpOnly` cookies on the frontend origin:
   - `POST /api/auth/login`
   - `POST /api/auth/logout`
   - `POST /api/auth/refresh`
   - `GET /api/auth/session`
   - `POST /api/auth/verify`

   Client code no longer stores tokens in `localStorage` or non-httpOnly cookies. API calls use `withCredentials` and Django `JWTCookieAuthentication`.

3. **Django cookie helpers** — [`apps/accounts/jwt_cookies.py`](../apps/accounts/jwt_cookies.py) and [`apps/accounts/authentication.py`](../apps/accounts/authentication.py).

## What the session resilience fix does **not** cover

Recent BFF/cookie and refresh hardening stops *unexpected* logouts from lost refresh
cookies, refresh storms, and temporary API failures. It does **not** change these
normal outcomes:

| Situation | Expected behavior |
|-----------|-------------------|
| Refresh JWT lifetime ends (~24h default) | User must sign in again |
| User deleted / DB reseeded while cookies remain | Refresh returns 401; session cleared; re-login required |
| Manual logout, password reset, or token blacklist | Session ends |
| Backend fully down | User may stay “signed in” locally but API calls fail until recovery |
| Idle-timeout countdown UI | Not implemented in current source (any countdown is stale client/PWA assets) |
| Permission / module 403s | Not an auth expiry; user stays logged in |

After a database reset or user deletion, clear site cookies for the app origin and
log in again. Hard-refresh (or update the service worker) if an old timeout warning
still appears.

## Recommended next steps

### Phase A — Server-side verification (optional hardening)

Middleware may call `POST /api/auth/verify` (BFF) instead of only checking JWT expiry locally.

### Phase C — CSRF and rotation

1. Double-submit CSRF token for cookie-based mutations.
2. Rotate refresh tokens; detect reuse.

## Django endpoints to use

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/token/` | Login |
| `POST /api/auth/token/refresh/` | Refresh |
| `POST /api/auth/token/verify/` | Validate access token (middleware / BFF) |
| `GET /api/accounts/me/` (or current-user) | Load profile after verify |

## Configuration

- Development API: `http://localhost:8001/api` when using [`scripts/dev-server.sh`](../scripts/dev-server.sh)
- Default in frontend env examples: `http://localhost:8000/api` (Docker / manual `runserver` on 8000)
- Set `NEXT_PUBLIC_API_URL` explicitly in `frontend/.env.local` to avoid ambiguity.

## References

- [`frontend/lib/utils/token.ts`](../frontend/lib/utils/token.ts) — client token storage (documents XSS trade-off)
- [`apps/accounts/middleware.py`](../apps/accounts/middleware.py) — promotes cookie to `Authorization` for Django template views
