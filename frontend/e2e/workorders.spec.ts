import { test, expect, applyAuth, gotoAuthenticated } from './fixtures';

test.describe('Work orders', () => {
    test.beforeEach(async ({ page, apiToken, apiRefreshToken, baseURL }) => {
        await applyAuth(page, page.context(), apiToken, apiRefreshToken, baseURL!);
    });

    test('work orders list loads', async ({ page }) => {
        await gotoAuthenticated(page, '/workorders');
        await expect(page.locator('body')).toContainText(/work order/i, { timeout: 30_000 });
    });
});
