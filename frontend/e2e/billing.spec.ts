import { test, expect, applyAuth, gotoAuthenticated } from './fixtures';

test.describe('Billing', () => {
    test.beforeEach(async ({ page, apiToken, apiRefreshToken, baseURL }) => {
        await applyAuth(page, page.context(), apiToken, apiRefreshToken, baseURL!);
    });

    test('billing area loads', async ({ page }) => {
        await gotoAuthenticated(page, '/billing');
        await expect(page.locator('body')).toContainText(/invoice|billing|estimate/i, { timeout: 30_000 });
    });
});
