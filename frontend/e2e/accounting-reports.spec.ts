/**
 * Smoke tests for accounting report pages and print toolbar presence.
 */
import { test, expect, applyAuth } from './fixtures';
import { fetchE2ETokens } from './auth-token';

const ACCOUNTING_REPORT_ROUTES = [
    '/accounting/reports/balance-sheet',
    '/accounting/reports/profit-loss',
    '/accounting/reports/trial-balance',
    '/accounting/reports/general-ledger',
    '/accounting/reports/cash-flow',
    '/accounting/reports/aging',
];

test.describe('Accounting reports', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        const tokens = await fetchE2ETokens();
        await applyAuth(page, page.context(), tokens.access, tokens.refresh, baseURL!);
    });

    for (const route of ACCOUNTING_REPORT_ROUTES) {
        test(`loads and shows export controls: ${route}`, async ({ page }) => {
            const errors: string[] = [];
            page.on('pageerror', (e) => errors.push(e.message));

            const response = await page.goto(route, {
                waitUntil: 'domcontentloaded',
                timeout: 30_000,
            });
            expect(response?.status()).toBeLessThan(500);
            await expect(page).not.toHaveURL(/\/login/);

            await expect(
                page.getByRole('button', { name: /print|pdf|export/i }).first(),
            ).toBeVisible({ timeout: 15_000 });

            expect(errors.filter((m) => !m.includes('ResizeObserver'))).toEqual([]);
        });
    }
});
