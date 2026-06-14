/**
 * Role-based access smoke tests for staff dashboards.
 */
import { test, expect, applyAuth } from './fixtures';
import { fetchE2ETokensForRole, type E2ERole } from './auth-token';

type RoleScenario = {
    role: E2ERole;
    allowedRoutes: string[];
    deniedUi?: { route: string; hiddenText: string }[];
    redirect?: RegExp;
};

const ROLE_SCENARIOS: RoleScenario[] = [
    {
        role: 'manager',
        allowedRoutes: ['/dashboard', '/workorders', '/customers', '/billing/invoices', '/reports'],
    },
    {
        role: 'receptionist',
        allowedRoutes: ['/dashboard', '/customers', '/appointments'],
    },
    {
        role: 'accountant',
        allowedRoutes: ['/dashboard', '/billing/invoices', '/accounting'],
    },
    {
        role: 'technician',
        allowedRoutes: ['/mobile/dashboard', '/mobile/workorders'],
        redirect: /\/mobile\//,
    },
    {
        role: 'service_coordinator',
        allowedRoutes: ['/dashboard', '/workorders', '/customers', '/appointments'],
    },
    {
        role: 'parts_manager',
        allowedRoutes: ['/dashboard', '/inventory'],
    },
    {
        role: 'hr_manager',
        allowedRoutes: ['/dashboard', '/hr'],
    },
];

for (const scenario of ROLE_SCENARIOS) {
    test.describe(`Role access — ${scenario.role}`, () => {
        test.beforeEach(async ({ page, baseURL }) => {
            const tokens = await fetchE2ETokensForRole(scenario.role);
            await applyAuth(page, page.context(), tokens.access, tokens.refresh, baseURL!);
        });

        for (const route of scenario.allowedRoutes) {
            test(`can open ${route}`, async ({ page }) => {
                const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 });
                expect(response?.status()).toBeLessThan(500);
                await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
                if (scenario.redirect) {
                    await expect(page).toHaveURL(scenario.redirect, { timeout: 15_000 });
                }
            });
        }
    });
}

test.describe('Role access — admin restricted actions hidden for receptionist', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        const tokens = await fetchE2ETokensForRole('receptionist');
        await applyAuth(page, page.context(), tokens.access, tokens.refresh, baseURL!);
    });

    test('admin users page hides create user action', async ({ page }) => {
        await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
        await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
        await expect(page.getByRole('button', { name: /add user|create user|new user/i })).toHaveCount(0);
    });
});

test.describe('Role access — accountant billing focus', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        const tokens = await fetchE2ETokensForRole('accountant');
        await applyAuth(page, page.context(), tokens.access, tokens.refresh, baseURL!);
    });

    test('can reach invoices list', async ({ page }) => {
        await page.goto('/billing/invoices', { waitUntil: 'domcontentloaded' });
        await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
        await expect(page.getByRole('heading', { name: /invoice/i })).toBeVisible({ timeout: 15_000 });
    });
});
