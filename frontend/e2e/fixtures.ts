import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { fetchE2ETokens } from './auth-token';

export type AuthFixtures = {
    apiToken: string;
    apiRefreshToken: string;
};

export const test = base.extend<AuthFixtures>({
    apiToken: async ({}, use) => {
        const tokens = await fetchE2ETokens();
        await use(tokens.access);
    },
    apiRefreshToken: async ({}, use) => {
        const tokens = await fetchE2ETokens();
        await use(tokens.refresh);
    },
});

export { expect };

type MeUser = {
    id: number;
    email: string;
    first_name?: string;
    last_name?: string;
    role?: string;
    branch?: number | null;
};

export async function applyAuth(
    page: Page,
    context: BrowserContext,
    accessToken: string,
    refreshToken: string,
    baseURL: string,
) {
    const url = new URL(baseURL);
    const api = new URL(process.env.E2E_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001/api');
    const cookies = [
        {
            name: 'access_token',
            value: accessToken,
            domain: url.hostname,
            path: '/',
            httpOnly: false,
            secure: url.protocol === 'https:',
            sameSite: 'Lax' as const,
        },
    ];
    if (api.hostname !== url.hostname) {
        cookies.push({
            name: 'access_token',
            value: accessToken,
            domain: api.hostname,
            path: '/',
            httpOnly: false,
            secure: api.protocol === 'https:',
            sameSite: 'Lax' as const,
        });
    }
    await context.addCookies(cookies);

    let me: MeUser | null = null;
    try {
        const meRes = await fetch(`${api.origin}${api.pathname.replace(/\/$/, '')}/auth/users/me/`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (meRes.ok) me = (await meRes.json()) as MeUser;
    } catch {
        me = null;
    }

    await page.addInitScript(
        ([access, user]) => {
            sessionStorage.setItem('e2e_access', access);
            if (user) {
                localStorage.setItem(
                    'auth-storage',
                    JSON.stringify({ state: { user, isAuthenticated: true }, version: 0 }),
                );
                if (user.branch && !localStorage.getItem('branch-storage')) {
                    localStorage.setItem(
                        'branch-storage',
                        JSON.stringify({ state: { activeBranchId: user.branch, activeBranch: null }, version: 0 }),
                    );
                }
            }
        },
        [accessToken, me],
    );
}

export async function gotoAuthenticated(page: Page, path: string) {
    await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await expect(page).not.toHaveURL(/\/login/, { timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
}
