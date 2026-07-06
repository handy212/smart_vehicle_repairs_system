/**
 * Full UI E2E for Accounts Payable: Bills, Pay Bills, Vendor Expenses, Vendor Credits.
 */
import { test, expect, applyAuth } from './fixtures';
import { fetchE2ETokens, fetchE2ETokensForRole } from './auth-token';

const apiURL = (
    process.env.E2E_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:8001/api'
).replace(/\/$/, '');

const today = new Date().toISOString().slice(0, 10);

type ApiContext = {
    token: string;
    accountantToken: string;
    accountantId: number;
    vendorId: number;
    vendorName: string;
    branchId: number;
    bankAccountId: number;
    expenseAccountId: number;
    openBillId: number;
    openBillNumber: string;
};

async function apiJson(
    token: string,
    path: string,
    options: RequestInit = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
    const response = await fetch(`${apiURL}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    let data: Record<string, unknown> = {};
    try {
        data = (await response.json()) as Record<string, unknown>;
    } catch {
        data = {};
    }
    return { status: response.status, data };
}

async function ensureApTestData(token: string): Promise<ApiContext> {
    const suffix = Date.now();
    const vendorName = `E2E AP Vendor ${suffix}`;

    const vendorRes = await apiJson(token, '/inventory/suppliers/', {
        method: 'POST',
        body: JSON.stringify({
            name: vendorName,
            supplier_code: `E2EAP${String(suffix).slice(-6)}`,
            is_active: true,
        }),
    });
    expect(vendorRes.status, JSON.stringify(vendorRes.data)).toBe(201);
    const vendorId = vendorRes.data.id as number;

    const branchesRes = await apiJson(token, '/branches/?is_active=true');
    const branches = (branchesRes.data.results as Record<string, unknown>[]) || [];
    expect(branches.length).toBeGreaterThan(0);
    const branchId = branches[0].id as number;

    let bankAccountId = 0;
    let expenseAccountId = 0;

    const settingsRes = await apiJson(token, '/accounting/control/settings/');
    if (settingsRes.status === 200) {
        const settings = settingsRes.data as Record<string, unknown>;
        bankAccountId =
            typeof settings.default_bank_account === 'object' && settings.default_bank_account
                ? (settings.default_bank_account as { id: number }).id
                : (settings.default_bank_account as number) || 0;
        expenseAccountId =
            typeof settings.default_expense_account === 'object' && settings.default_expense_account
                ? (settings.default_expense_account as { id: number }).id
                : (settings.default_expense_account as number) || 0;
    }

    if (!bankAccountId || !expenseAccountId) {
        await apiJson(token, '/accounting/control/wire/', {
            method: 'POST',
            body: JSON.stringify({ force: true }),
        });
    }

    if (!bankAccountId) {
        const banksRes = await apiJson(
            token,
            '/accounting/accounts/?account_type=asset&account_subtype=bank&is_active=true',
        );
        const banks = (banksRes.data.results as Record<string, unknown>[]) || [];
        if (banks.length) bankAccountId = banks[0].id as number;
    }
    if (!expenseAccountId) {
        const expRes = await apiJson(token, '/accounting/accounts/?account_type=expense&is_active=true');
        const accounts = (expRes.data.results as Record<string, unknown>[]) || [];
        if (accounts.length) expenseAccountId = accounts[0].id as number;
    }
    expect(bankAccountId).toBeGreaterThan(0);
    expect(expenseAccountId).toBeGreaterThan(0);

    const billRes = await apiJson(token, '/billing/bills/', {
        method: 'POST',
        body: JSON.stringify({
            vendor: vendorId,
            branch: branchId,
            bill_date: today,
            due_date: today,
            line_items: [
                {
                    description: 'E2E UI test supplies',
                    quantity: 1,
                    unit_price: '125.00',
                    is_taxable: false,
                },
            ],
        }),
    });
    expect(billRes.status, JSON.stringify(billRes.data)).toBe(201);
    const billId = billRes.data.id as number;

    const accountantTokens = await fetchE2ETokensForRole('accountant');
    const accountantMe = await apiJson(accountantTokens.access, '/auth/users/me');
    const approverId = accountantMe.data.id as number;

    const submitRes = await apiJson(token, `/billing/bills/${billId}/submit-for-approval/`, {
        method: 'POST',
        body: JSON.stringify({ approver_id: approverId }),
    });
    expect(submitRes.status, JSON.stringify(submitRes.data)).toBe(200);

    const approveRes = await apiJson(accountantTokens.access, `/billing/bills/${billId}/approve/`, {
        method: 'POST',
    });
    expect(approveRes.status, JSON.stringify(approveRes.data)).toBe(200);

    const billDetail = await apiJson(token, `/billing/bills/${billId}/`);
    expect(billDetail.data.status).toBe('open');

    return {
        token,
        accountantToken: accountantTokens.access,
        accountantId: approverId,
        vendorId,
        vendorName,
        branchId,
        bankAccountId,
        expenseAccountId,
        openBillId: billId,
        openBillNumber: String(billDetail.data.bill_number || billId),
    };
}

test.describe('AP Payables — full UI', () => {
    let ctx: ApiContext;

    test.beforeAll(async () => {
        const tokens = await fetchE2ETokens();
        ctx = await ensureApTestData(tokens.access);
    });

    test.beforeEach(async ({ page, baseURL }) => {
        await applyAuth(page, page.context(), ctx.token, '', baseURL!);
    });

    test('Bills list and detail pages load', async ({ page }) => {
        await page.goto('/billing/bills');
        await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
        await expect(page.getByRole('heading', { name: /bills/i })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole('link', { name: /new bill/i })).toBeVisible();

        await page.goto(`/billing/bills/${ctx.openBillId}`);
        await expect(page).not.toHaveURL(/\/login/);
        await expect(page.getByText(ctx.openBillNumber, { exact: false })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(ctx.vendorName, { exact: false })).toBeVisible();
    });

    test('Create bill via UI', async ({ page }) => {
        await page.goto('/billing/bills/new');
        await expect(page.getByRole('heading', { name: /create new bill/i })).toBeVisible({ timeout: 15_000 });

        await page.getByRole('combobox').first().click();
        await page.getByRole('option', { name: new RegExp(ctx.vendorName.slice(0, 20)) }).first().click();

        const descInput = page.locator('input[name="line_items.0.description"]');
        await descInput.fill('UI-created bill line');
        await page.locator('input[name="line_items.0.unit_price"]').fill('55');

        await page.getByRole('button', { name: /save|create/i }).first().click();
        await expect(page).toHaveURL(/\/billing\/bills\/\d+/, { timeout: 20_000 });
        await expect(page.getByText('UI-created bill line')).toBeVisible({ timeout: 15_000 });
    });

    test('Pay Bills — batch payment UI', async ({ page }) => {
        await page.goto(`/billing/pay-bills?vendor=${ctx.vendorId}`);
        await expect(page.getByRole('heading', { name: 'Pay Bills' })).toBeVisible({ timeout: 15_000 });

        const billRow = page.getByRole('row').filter({ hasText: ctx.openBillNumber });
        await expect(billRow).toBeVisible({ timeout: 15_000 });
        await billRow.getByRole('checkbox').check();

        const bankSelect = page.locator('#bank-account, [id*="bank"]').first();
        if (await bankSelect.isVisible().catch(() => false)) {
            await bankSelect.click();
            await page.getByRole('option').first().click();
        } else {
            const selects = page.getByRole('combobox');
            const count = await selects.count();
            for (let i = 0; i < count; i++) {
                const el = selects.nth(i);
                const label = await el.getAttribute('aria-label');
                if (label?.toLowerCase().includes('bank') || i === count - 1) {
                    await el.click();
                    await page.getByRole('option').first().click();
                    break;
                }
            }
        }

        await page.getByRole('button', { name: /pay selected|record payment|pay bills/i }).click();
        await expect(page.getByText(/payment|paid|success/i).first()).toBeVisible({ timeout: 20_000 });

        const billCheck = await apiJson(ctx.token, `/billing/bills/${ctx.openBillId}/`);
        expect(['paid', 'partially_paid']).toContain(billCheck.data.status);
    });

    test('Vendor Expenses — create and list', async ({ page }) => {
        await page.goto('/billing/expenses/new');
        await expect(page.getByRole('heading', { name: /new vendor expense|vendor expense/i })).toBeVisible({
            timeout: 15_000,
        });

        await page.getByRole('combobox').first().click();
        await page.getByRole('option', { name: new RegExp(ctx.vendorName.slice(0, 20)) }).first().click();

        await page.locator('input[name="line_items.0.description"]').fill('E2E fuel purchase');
        await page.locator('input[name="line_items.0.unit_price"]').fill('42.50');

        const expenseAccountSelect = page.locator('[name="line_items.0.expense_account"]').locator('..').getByRole('combobox');
        if (await expenseAccountSelect.isVisible().catch(() => false)) {
            await expenseAccountSelect.click();
            await page.getByRole('option').first().click();
        }

        await page.getByRole('button', { name: /save/i }).first().click();
        await expect(page).toHaveURL(/\/billing\/expenses\/\d+/, { timeout: 25_000 });
        await expect(page.getByText('E2E fuel purchase')).toBeVisible({ timeout: 15_000 });

        await page.goto('/billing/expenses');
        await expect(page.getByRole('heading', { name: /vendor expenses/i })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText('E2E fuel purchase')).toBeVisible({ timeout: 15_000 });
    });

    test('Vendor Credits — create, issue, and apply', async ({ page }) => {
        const billRes = await apiJson(ctx.token, '/billing/bills/', {
            method: 'POST',
            body: JSON.stringify({
                vendor: ctx.vendorId,
                branch: ctx.branchId,
                bill_date: today,
                due_date: today,
                line_items: [
                    {
                        description: 'Credit target bill',
                        quantity: 1,
                        unit_price: '200.00',
                        is_taxable: false,
                    },
                ],
            }),
        });
        expect(billRes.status).toBe(201);
        const targetBillId = billRes.data.id as number;

        const accountantTokens = ctx.accountantToken;
        await apiJson(ctx.token, `/billing/bills/${targetBillId}/submit-for-approval/`, {
            method: 'POST',
            body: JSON.stringify({ approver_id: ctx.accountantId }),
        });
        await apiJson(accountantTokens, `/billing/bills/${targetBillId}/approve/`, { method: 'POST' });

        await page.goto('/billing/vendor-credits/new');
        await expect(page.getByRole('heading', { name: /new vendor credit/i })).toBeVisible({ timeout: 15_000 });

        await page.getByLabel(/^vendor$/i).click();
        await page.getByRole('option', { name: new RegExp(ctx.vendorName.slice(0, 20)) }).first().click();

        await page.locator('input[name="line_items.0.description"]').fill('E2E return credit');
        await page.locator('input[name="line_items.0.unit_price"]').fill('50');

        await page.getByRole('button', { name: /save|create/i }).first().click();
        await expect(page).toHaveURL(/\/billing\/vendor-credits\/\d+/, { timeout: 25_000 });

        const issueBtn = page.getByRole('button', { name: /issue credit/i });
        await expect(issueBtn).toBeVisible({ timeout: 10_000 });
        await issueBtn.click();
        await expect(page.getByText(/issued/i).first()).toBeVisible({ timeout: 15_000 });

        const applyBtn = page.getByRole('button', { name: /apply to bill/i });
        await expect(applyBtn).toBeVisible({ timeout: 10_000 });
        await applyBtn.click();

        await page.getByRole('combobox').last().click();
        await page.getByRole('option').filter({ hasText: /credit target|BILL|200/ }).first().click();
        await page.getByRole('button', { name: /^apply$/i }).click();

        await expect(page.getByText(/applied|success/i).first()).toBeVisible({ timeout: 20_000 });

        const billAfter = await apiJson(ctx.token, `/billing/bills/${targetBillId}/`);
        expect(Number(billAfter.data.amount_paid)).toBeGreaterThan(0);
    });

    test('Payables navigation links resolve', async ({ page }) => {
        const routes = [
            '/billing/bills',
            '/billing/pay-bills',
            '/billing/expenses',
            '/billing/vendor-credits',
            '/billing/vendor-payments',
        ];
        for (const route of routes) {
            const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            expect(response?.status()).toBeLessThan(500);
            await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
        }
    });
});
