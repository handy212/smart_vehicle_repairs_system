import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

const apiURL = process.env.E2E_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001/api';

export type AuthFixtures = {
    apiToken: string;
    apiRefreshToken: string;
};

export const test = base.extend<AuthFixtures>({
    apiToken: async ({}, use) => {
        const tokens = await fetchTokens();
        await use(tokens.access);
    },
    apiRefreshToken: async ({}, use) => {
        const tokens = await fetchTokens();
        await use(tokens.refresh);
    },
});

export { expect };

async function fetchTokens(): Promise<{ access: string; refresh: string }> {
    const username = process.env.E2E_USERNAME || 'e2e_admin';
    const password = process.env.E2E_PASSWORD || 'e2e_test_pass_123';

    const response = await fetch(`${apiURL.replace(/\/$/, '')}/auth/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
        throw new Error(
            `E2E login failed (${response.status}). Ensure the API is running and E2E user exists.`,
        );
    }

    return (await response.json()) as { access: string; refresh: string };
}

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
