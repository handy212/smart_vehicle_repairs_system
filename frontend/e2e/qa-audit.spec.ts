/**
 * Expanded QA audit — route smoke, RBAC redirects, responsive layouts.
 */
import { test, expect, applyAuth, gotoAuthenticated } from './fixtures';
import { fetchE2ETokens } from './auth-token';

const DASHBOARD_ROUTES = [
    '/dashboard',
    '/workorders',
    '/customers',
    '/billing/invoices',
    '/inventory',
    '/reports',
    '/admin/users',
    '/accounting',
    '/hr/staff',
    '/vehicles',
    '/appointments',
];

const UNAUTHORIZED_SHOULD_REDIRECT = [
    '/admin/users',
    '/admin/audit-log',
    '/billing/invoices',
    '/accounting/reports/balance-sheet',
];

test.describe('QA Audit — Authentication', () => {
    test('login form uses email field', async ({ page }) => {
        await page.goto('/login');
        await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });
    });

    test('invalid credentials show error', async ({ page }) => {
        await page.goto('/login');
        await page.locator('input[type="email"]').fill('invalid@example.com');
        await page.locator('input[type="password"]').fill('wrongpassword');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
    });

    test('email-based API token works for dashboard', async ({ page, baseURL }) => {
        const tokens = await fetchE2ETokens();
        await applyAuth(page, page.context(), tokens.access, tokens.refresh, baseURL!);
        await gotoAuthenticated(page, '/dashboard');
    });
});

test.describe('QA Audit — Route smoke (authenticated)', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        const tokens = await fetchE2ETokens();
        await applyAuth(page, page.context(), tokens.access, tokens.refresh, baseURL!);
    });

    for (const route of DASHBOARD_ROUTES) {
        test(`loads without 5xx: ${route}`, async ({ page }) => {
            const errors: string[] = [];
            page.on('pageerror', (e) => errors.push(e.message));
            const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 90_000 });
            expect(response?.status()).toBeLessThan(500);
            await expect(page).not.toHaveURL(/\/login/, { timeout: 60_000 });
            expect(errors.filter((m) => !m.includes('ResizeObserver'))).toEqual([]);
        });
    }
});

test.describe('QA Audit — Unauthorized access', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    for (const route of UNAUTHORIZED_SHOULD_REDIRECT) {
        test(`redirects unauthenticated user from ${route}`, async ({ page }) => {
            await page.goto(route);
            await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
        });
    }
});

test.describe('QA Audit — Responsive', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        const tokens = await fetchE2ETokens();
        await applyAuth(page, page.context(), tokens.access, tokens.refresh, baseURL!);
    });

    const viewports = [
        { name: 'desktop', width: 1440, height: 900 },
        { name: 'tablet', width: 768, height: 1024 },
        { name: 'mobile', width: 390, height: 844 },
    ];

    for (const vp of viewports) {
        test(`dashboard layout ${vp.name}`, async ({ page }) => {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await gotoAuthenticated(page, '/dashboard');
            await page.screenshot({
                path: `test-results/qa-dashboard-${vp.name}.png`,
                fullPage: false,
            });
        });
    }
});
