import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  applyAuthCookies,
  clearAuthCookies,
  REFRESH_COOKIE,
  SESSION_PRESENCE_COOKIE,
} from '@/lib/auth/bff-cookies';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as refresh } from '@/app/api/auth/refresh/route';

function jwt(exp: number): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp })}.signature`;
}

function headersWithCookies(...cookies: string[]): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return headers;
}

function setCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [headers.get('set-cookie') ?? ''];
}

function requestWith(options: {
  body?: unknown;
  refreshToken?: string;
}): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(options.body ?? {}),
    cookies: {
      get: vi.fn((name: string) =>
        name === REFRESH_COOKIE && options.refreshToken
          ? { value: options.refreshToken }
          : undefined,
      ),
    },
  } as unknown as NextRequest;
}

describe('BFF auth cookie helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('mirrors only known upstream auth cookies and derives JWT expiry', () => {
    const refreshToken = jwt(Math.floor(Date.now() / 1000) + 600);
    const response = NextResponse.json({ ok: true });
    const headers = headersWithCookies(
      `${ACCESS_COOKIE}=access.jwt; Max-Age=120; Path=/; HttpOnly; Secure; SameSite=Strict`,
      `${REFRESH_COOKIE}=${refreshToken}; Path=/api/auth/; HttpOnly; Secure; SameSite=Lax`,
      'csrftoken=do-not-mirror; Path=/; SameSite=Lax',
    );

    applyAuthCookies(response, {}, headers);

    const cookies = setCookies(response).join('\n');
    expect(cookies).toContain(`${ACCESS_COOKIE}=access.jwt`);
    expect(cookies).toContain('Max-Age=120');
    expect(cookies).toContain('SameSite=strict');
    expect(cookies).toContain(`${REFRESH_COOKIE}=${refreshToken}`);
    expect(cookies).toContain('Max-Age=600');
    expect(cookies).toContain(`${SESSION_PRESENCE_COOKIE}=1`);
    expect(cookies).not.toContain('csrftoken=do-not-mirror');
  });

  it('clears the session marker with auth cookies', () => {
    const response = NextResponse.json({ ok: false });
    clearAuthCookies(response);

    const cookies = setCookies(response).join('\n');
    expect(cookies).toContain(`${ACCESS_COOKIE}=`);
    expect(cookies).toContain(`${REFRESH_COOKIE}=`);
    expect(cookies).toContain(`${SESSION_PRESENCE_COOKIE}=`);
    expect(cookies.match(/Max-Age=0/g)?.length).toBe(4);
  });
});

describe('BFF auth routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('login translates upstream cookies without exposing tokens in JSON', async () => {
    const upstreamHeaders = headersWithCookies(
      `${ACCESS_COOKIE}=secret-access; Max-Age=300; HttpOnly; Secure; SameSite=Lax; Path=/`,
      `${REFRESH_COOKIE}=secret-refresh; Max-Age=900; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/`,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ user: { id: 7 } }), {
          status: 200,
          headers: upstreamHeaders,
        }),
      ),
    );

    const response = await login(requestWith({ body: { email: 'user@example.com' } }));

    const responseBody = await response.json();
    expect(responseBody).toEqual({ user: { id: 7 } });
    const cookies = setCookies(response).join('\n');
    expect(cookies).toContain(`${ACCESS_COOKIE}=secret-access`);
    expect(cookies).toContain(`${REFRESH_COOKIE}=secret-refresh`);
    expect(cookies).toContain(`${SESSION_PRESENCE_COOKIE}=1`);
    expect(JSON.stringify(responseBody)).not.toContain('secret');
  });

  it.each([429, 503])('does not clear cookies for transient refresh status %s', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'try later' }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const response = await refresh(requestWith({ refreshToken: 'existing-refresh' }));

    expect(response.status).toBe(status);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('persists refresh rotation supplied only through upstream cookies', async () => {
    const upstreamHeaders = headersWithCookies(
      `${ACCESS_COOKIE}=rotated-access; Max-Age=300; HttpOnly; Secure; SameSite=Lax; Path=/`,
      `${REFRESH_COOKIE}=rotated-refresh; Max-Age=900; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/`,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'refreshed' }), {
          status: 200,
          headers: upstreamHeaders,
        }),
      ),
    );

    const response = await refresh(requestWith({ refreshToken: 'old-refresh' }));

    expect(await response.json()).toEqual({ detail: 'refreshed' });
    const cookies = setCookies(response).join('\n');
    expect(cookies).toContain(`${ACCESS_COOKIE}=rotated-access`);
    expect(cookies).toContain(`${REFRESH_COOKIE}=rotated-refresh`);
    expect(cookies).toContain(`${SESSION_PRESENCE_COOKIE}=1`);
  });

  it('clears auth and presence cookies on definitive refresh rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'invalid token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const response = await refresh(requestWith({ refreshToken: 'rejected-refresh' }));

    expect(response.status).toBe(401);
    const cookies = setCookies(response).join('\n');
    expect(cookies).toContain(`${REFRESH_COOKIE}=`);
    expect(cookies).toContain(`${SESSION_PRESENCE_COOKIE}=`);
  });
});
