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

## Implemented (incremental)

1. **JWT shape and expiry check at the edge** — [`frontend/lib/auth/jwt.ts`](../frontend/lib/auth/jwt.ts) decodes the access token and rejects missing, malformed, or expired tokens before serving protected pages. This does **not** verify the signature (the secret must not live in the frontend).

2. **Documented BFF target** — this file.

## Recommended next steps

### Phase A — Server-side verification (no secret in browser)

1. Add a lightweight Next.js Route Handler, e.g. `GET /api/auth/session`, that:
   - Reads the `access_token` cookie (or `Authorization` header)
   - Calls Django `POST /api/auth/token/verify/` with the token
   - Returns `{ ok: true, user }` or 401

2. Update middleware to call that route (or inline `fetch` to Django verify) instead of only checking expiry.

### Phase B — httpOnly cookies (BFF)

1. Login Route Handler proxies credentials to Django and sets:
   - `httpOnly`, `Secure`, `SameSite=Lax` cookies for refresh (and optionally access)
   - No tokens in `localStorage`

2. Middleware reads httpOnly access cookie only; Axios uses a same-origin `/api/proxy` that attaches cookies server-side.

3. Logout clears cookies via Route Handler.

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
