import { test, expect, applyAuth } from './fixtures';

test.describe('Work orders', () => {
    test.beforeEach(async ({ page, apiToken, apiRefreshToken, baseURL }) => {
        await applyAuth(page, page.context(), apiToken, apiRefreshToken, baseURL!);
    });

    test('work orders list loads', async ({ page }) => {
        await page.goto('/workorders');
        await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
        await expect(page.locator('body')).toContainText(/work order/i, { timeout: 20_000 });
    });
});
