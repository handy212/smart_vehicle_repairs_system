import { test, expect, applyAuth } from './fixtures';

const apiURL = (process.env.E2E_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001/api').replace(
    /\/$/,
    '',
);

async function fetchTechnicianTokens(): Promise<{ access: string; refresh: string }> {
    const email = process.env.E2E_TECH_EMAIL || process.env.E2E_EMAIL || 'e2e_admin@example.com';
    const password = process.env.E2E_TECH_PASSWORD || process.env.E2E_PASSWORD || 'e2e_test_pass_123';

    const response = await fetch(`${apiURL}/auth/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
        throw new Error(`Technician E2E login failed (${response.status})`);
    }

    const data = (await response.json()) as { access?: string; refresh?: string };
    if (!data.access) {
        throw new Error('Technician E2E login missing access token');
    }
    return { access: data.access, refresh: data.refresh || '' };
}

test.describe('Mobile technician PWA', () => {
    test('dashboard loads with Tech App shell', async ({ page, context, baseURL }) => {
        const tokens = await fetchTechnicianTokens();
        await applyAuth(page, context, tokens.access, tokens.refresh, baseURL!);

        await page.goto('/mobile/dashboard');

        await expect(page.getByRole('heading', { name: /Hi,/ })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText('Tech App')).toBeVisible();
        await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Work Orders' })).toBeVisible();
    });

    test('schedule page renders', async ({ page, context, baseURL }) => {
        const tokens = await fetchTechnicianTokens();
        await applyAuth(page, context, tokens.access, tokens.refresh, baseURL!);

        await page.goto('/mobile/schedule');

        await expect(page.getByRole('heading', { name: 'My Schedule' })).toBeVisible({ timeout: 15_000 });
    });

    test('more menu has sign out', async ({ page, context, baseURL }) => {
        const tokens = await fetchTechnicianTokens();
        await applyAuth(page, context, tokens.access, tokens.refresh, baseURL!);

        await page.goto('/mobile/more');

        await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible({ timeout: 15_000 });
    });
});
