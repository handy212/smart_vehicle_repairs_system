import { test, expect, applyAuth } from './fixtures';

test.describe('Login', () => {
    test('login page renders', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: /sign in|login/i })).toBeVisible({
            timeout: 15_000,
        });
    });

    test('authenticated user reaches dashboard', async ({
        page,
        apiToken,
        apiRefreshToken,
        baseURL,
    }) => {
        await applyAuth(page, page.context(), apiToken, apiRefreshToken, baseURL!);
        await page.goto('/dashboard');
        await expect(page).not.toHaveURL(/\/login/);
    });
});
