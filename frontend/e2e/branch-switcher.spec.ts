import { test, expect, applyAuth, gotoAuthenticated } from './fixtures';
import { fetchE2ETokensForRole } from './auth-token';

test.describe('Branch switcher — admin', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        const tokens = await fetchE2ETokensForRole('admin');
        await applyAuth(page, page.context(), tokens.access, tokens.refresh, baseURL!);
    });

    test('user menu shows branch selector when multiple branches exist', async ({ page }) => {
        await gotoAuthenticated(page, '/dashboard');
        await page.getByRole('button').filter({ hasText: /admin|e2e/i }).first().click();
        await expect(page.getByText(/switch branch/i)).toBeVisible({ timeout: 15_000 });
        const branchSelect = page.locator('select').first();
        await expect(branchSelect).toBeVisible();
        expect(await branchSelect.locator('option').count()).toBeGreaterThanOrEqual(2);
    });

    test('branch selection persists in localStorage', async ({ page }) => {
        await gotoAuthenticated(page, '/dashboard');
        const storedBefore = await page.evaluate(() => localStorage.getItem('branch-storage'));
        expect(storedBefore).toBeTruthy();
        const parsed = JSON.parse(storedBefore!) as { state?: { activeBranchId?: number } };
        expect(parsed.state?.activeBranchId).toBeTruthy();
    });
});
