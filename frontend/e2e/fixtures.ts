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
    await context.addCookies([
        {
            name: 'access_token',
            value: accessToken,
            domain: url.hostname,
            path: '/',
            httpOnly: false,
            secure: url.protocol === 'https:',
            sameSite: 'Lax',
        },
    ]);

    await page.addInitScript(
        ([access, refresh]) => {
            localStorage.setItem('access_token', access);
            localStorage.setItem('refresh_token', refresh);
        },
        [accessToken, refreshToken],
    );
}
