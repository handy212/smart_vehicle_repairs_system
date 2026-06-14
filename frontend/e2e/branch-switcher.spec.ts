/**
 * Branch switcher smoke test — admin with multiple branches sees selector.
 */
import { test, expect, applyAuth } from './fixtures';
import { fetchE2ETokensForRole } from './auth-token';

test.describe('Branch switcher — admin', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        const tokens = await fetchE2ETokensForRole('admin');
        await applyAuth(page, page.context(), tokens.access, tokens.refresh, baseURL!);
    });

    test('user menu shows branch selector when multiple branches exist', async ({ page }) => {
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

        await page.getByRole('button', { name: /branch manager|e2e|admin/i }).first().click();

        await expect(page.getByText(/switch branch/i)).toBeVisible({ timeout: 10_000 });

        const branchSelect = page.locator('select').first();
        await expect(branchSelect).toBeVisible();
        const optionCount = await branchSelect.locator('option').count();
        expect(optionCount).toBeGreaterThanOrEqual(2);
    });

    test('branch selection persists in localStorage', async ({ page }) => {
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

        const storedBefore = await page.evaluate(() => localStorage.getItem('branch-storage'));
        expect(storedBefore).toBeTruthy();

        const parsed = JSON.parse(storedBefore!) as { state?: { activeBranchId?: number } };
        expect(parsed.state?.activeBranchId).toBeTruthy();
    });
});
