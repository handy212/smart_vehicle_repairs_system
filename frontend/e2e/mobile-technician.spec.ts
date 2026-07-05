import { test, expect, applyAuth, gotoAuthenticated } from './fixtures';
import { fetchE2ETokensForRole } from './auth-token';

test.describe('Mobile technician PWA', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        const tokens = await fetchE2ETokensForRole('technician');
        await applyAuth(page, page.context(), tokens.access, tokens.refresh, baseURL!);
    });

    test('dashboard loads with Tech App shell', async ({ page }) => {
        await gotoAuthenticated(page, '/mobile/dashboard');
        await expect(page.getByRole('heading', { name: /Hi,/ })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText('Tech App')).toBeVisible();
    });

    test('schedule page renders', async ({ page }) => {
        await gotoAuthenticated(page, '/mobile/schedule');
        await expect(page.getByRole('heading', { name: 'My Schedule' })).toBeVisible({ timeout: 30_000 });
    });

    test('more menu has sign out', async ({ page }) => {
        await gotoAuthenticated(page, '/mobile/more');
        await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible({ timeout: 30_000 });
    });
});
