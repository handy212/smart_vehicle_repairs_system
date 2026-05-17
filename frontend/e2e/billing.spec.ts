import { test, expect, applyAuth } from './fixtures';

test.describe('Billing', () => {
    test.beforeEach(async ({ page, apiToken, apiRefreshToken, baseURL }) => {
        await applyAuth(page, page.context(), apiToken, apiRefreshToken, baseURL!);
    });

    test('billing area loads', async ({ page }) => {
        await page.goto('/billing');
        await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
        await expect(page.locator('body')).toContainText(/invoice|billing|estimate/i, {
            timeout: 20_000,
        });
    });
});
