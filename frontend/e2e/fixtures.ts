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

/** Set cookie + localStorage so middleware and client layout both authenticate. */
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

    await page.addInitScript(
        ([access]) => {
            sessionStorage.setItem('e2e_access', access);
        },
        [accessToken],
    );
}
