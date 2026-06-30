#!/usr/bin/env node
/**
 * UI smoke test for AP payables — validates the same API flows the UI uses,
 * plus authenticated page loads (HTTP 200, not redirected to login).
 */
const API = (process.env.E2E_API_URL || 'http://127.0.0.1:8001/api').replace(/\/$/, '');
const UI = (process.env.E2E_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const EMAIL = process.env.E2E_EMAIL || 'e2e_admin@example.com';
const PASSWORD = process.env.E2E_PASSWORD || 'e2e_test_pass_123';

const results = [];
const today = new Date().toISOString().slice(0, 10);

function pass(name, detail = '') {
    results.push({ name, ok: true, detail });
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
    results.push({ name, ok: false, detail });
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(token, path, options = {}) {
    const res = await fetch(`${API}${path}`, {
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {}),
        },
    });
    let data = {};
    try {
        data = await res.json();
    } catch {
        data = {};
    }
    return { status: res.status, data };
}

async function uiPage(token, path) {
    const res = await fetch(`${UI}${path}`, {
        redirect: 'manual',
        headers: { Cookie: `access_token=${token}` },
    });
    const location = res.headers.get('location') || '';
    const text = await res.text();
    return { status: res.status, location, text };
}

function listResults(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.results)) return data.results;
    return [];
}

async function main() {
    console.log('AP Payables UI smoke test\n');

    const login = await api(null, '/auth/token/', {
        method: 'POST',
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (!login.data.access) {
        fail('Login', `HTTP ${login.status}`);
        summarize();
        process.exit(1);
    }
    const token = login.data.access;
    pass('Login', EMAIL);

    const acctLogin = await api(null, '/auth/token/', {
        method: 'POST',
        body: JSON.stringify({ email: 'e2e_accountant@example.com', password: PASSWORD }),
    });
    const accountantToken = acctLogin.data.access || token;

    const pages = [
        '/billing/bills',
        '/billing/bills/new',
        '/billing/pay-bills',
        '/billing/expenses',
        '/billing/expenses/new',
        '/billing/vendor-credits',
        '/billing/vendor-credits/new',
        '/billing/vendor-payments',
    ];
    for (const path of pages) {
        const page = await uiPage(token, path);
        const redirectedLogin = page.location.includes('/login');
        if ((page.status === 200 || page.status === 307) && !redirectedLogin) {
            pass(`Page load ${path}`, `HTTP ${page.status}`);
        } else {
            fail(`Page load ${path}`, `HTTP ${page.status} location=${page.location}`);
        }
    }

    const suffix = Date.now();
    const vendorRes = await api(token, '/inventory/suppliers/', {
        method: 'POST',
        body: JSON.stringify({
            name: `UI Smoke Vendor ${suffix}`,
            supplier_code: `UIS${String(suffix).slice(-5)}`,
            is_active: true,
        }),
    });
    if (vendorRes.status !== 201) {
        fail('Create vendor', JSON.stringify(vendorRes.data));
        summarize();
        process.exit(1);
    }
    const vendorId = vendorRes.data.id;
    pass('Create vendor', `id=${vendorId}`);

    const branches = await api(token, '/branches/?is_active=true');
    const branchId = listResults(branches.data)[0]?.id;
    if (!branchId) {
        fail('Resolve branch');
        summarize();
        process.exit(1);
    }

    await api(token, '/accounting/control/wire/', {
        method: 'POST',
        body: JSON.stringify({ force: true }),
    });

    const banks = await api(token, '/accounting/accounts/?account_type=asset&account_subtype=bank&is_active=true');
    const bankId = listResults(banks.data)[0]?.id;
    const expenses = await api(token, '/accounting/accounts/?account_type=expense&is_active=true');
    const expenseAccountId = listResults(expenses.data)[0]?.id;
    if (!bankId || !expenseAccountId) {
        fail('Resolve GL accounts');
        summarize();
        process.exit(1);
    }
    pass('Accounting accounts', `bank=${bankId} expense=${expenseAccountId}`);

    const billRes = await api(token, '/billing/bills/', {
        method: 'POST',
        body: JSON.stringify({
            vendor: vendorId,
            branch: branchId,
            bill_date: today,
            due_date: today,
            line_items: [{ description: 'UI smoke bill', quantity: 1, unit_price: '99.00', is_taxable: false }],
        }),
    });
    if (billRes.status !== 201) {
        fail('Create bill', JSON.stringify(billRes.data));
        summarize();
        process.exit(1);
    }
    const billId = billRes.data.id;
    pass('Create bill (Bills UI form)', `id=${billId}`);

    const me = await api(accountantToken, '/auth/users/me');
    const approverId = me.data.id;
    const submit = await api(token, `/billing/bills/${billId}/submit-for-approval/`, {
        method: 'POST',
        body: JSON.stringify({ approver_id: approverId }),
    });
    const approve = await api(accountantToken, `/billing/bills/${billId}/approve/`, { method: 'POST' });
    if (submit.status === 200 && approve.status === 200) {
        pass('Bill approval workflow');
    } else {
        fail('Bill approval workflow', `submit=${submit.status} approve=${approve.status}`);
    }

    const billDetailPage = await uiPage(token, `/billing/bills/${billId}`);
    if (billDetailPage.status === 200 && !billDetailPage.location.includes('/login')) {
        pass('Bill detail page', `/billing/bills/${billId}`);
    } else {
        fail('Bill detail page');
    }

    const payBills = await api(token, '/billing/pay-bills/', {
        method: 'POST',
        body: JSON.stringify({
            vendor: vendorId,
            payment_date: today,
            payment_method: 'bank_transfer',
            bank_account: bankId,
            lines: [{ bill_id: billId, amount: '99.00' }],
        }),
    });
    if (payBills.status === 201) {
        pass('Pay Bills batch (Pay Bills UI)');
    } else {
        fail('Pay Bills batch', JSON.stringify(payBills.data));
    }

    const payBillsPage = await uiPage(token, `/billing/pay-bills?vendor=${vendorId}`);
    if (payBillsPage.status === 200) pass('Pay Bills page with vendor filter');
    else fail('Pay Bills page with vendor filter');

    const expenseRes = await api(token, '/billing/vendor-expenses/', {
        method: 'POST',
        body: JSON.stringify({
            vendor: vendorId,
            branch: branchId,
            expense_date: today,
            payment_method: 'bank_transfer',
            bank_account: bankId,
            line_items: [
                {
                    description: 'UI smoke expense',
                    expense_account: expenseAccountId,
                    quantity: 1,
                    unit_price: '33.00',
                },
            ],
        }),
    });
    if (expenseRes.status === 201) {
        pass('Create vendor expense', expenseRes.data.expense_number);
        const expensePage = await uiPage(token, `/billing/expenses/${expenseRes.data.id}`);
        if (expensePage.status === 200) pass('Vendor expense detail page');
        else fail('Vendor expense detail page');
    } else {
        fail('Create vendor expense', JSON.stringify(expenseRes.data));
    }

    const bill2 = await api(token, '/billing/bills/', {
        method: 'POST',
        body: JSON.stringify({
            vendor: vendorId,
            branch: branchId,
            bill_date: today,
            due_date: today,
            line_items: [{ description: 'Credit target', quantity: 1, unit_price: '150.00', is_taxable: false }],
        }),
    });
    const bill2Id = bill2.data.id;
    await api(token, `/billing/bills/${bill2Id}/submit-for-approval/`, {
        method: 'POST',
        body: JSON.stringify({ approver_id: approverId }),
    });
    await api(accountantToken, `/billing/bills/${bill2Id}/approve/`, { method: 'POST' });

    const creditRes = await api(token, '/billing/vendor-credits/', {
        method: 'POST',
        body: JSON.stringify({
            vendor: vendorId,
            credit_date: today,
            reason: 'UI smoke credit',
            line_items: [{ description: 'Return', quantity: 1, unit_price: '25.00', is_taxable: false }],
        }),
    });
    if (creditRes.status !== 201) {
        fail('Create vendor credit', JSON.stringify(creditRes.data));
    } else {
        const creditId = creditRes.data.id;
        pass('Create vendor credit', creditRes.data.credit_number);
        const issue = await api(token, `/billing/vendor-credits/${creditId}/issue/`, { method: 'POST' });
        const apply = await api(token, `/billing/vendor-credits/${creditId}/apply/`, {
            method: 'POST',
            body: JSON.stringify({ bill: bill2Id, amount: '25.00' }),
        });
        if (issue.status === 200 && apply.status === 200) {
            pass('Issue and apply vendor credit');
        } else {
            fail('Issue and apply vendor credit', `issue=${issue.status} apply=${apply.status}`);
        }
        const creditPage = await uiPage(token, `/billing/vendor-credits/${creditId}`);
        if (creditPage.status === 200) pass('Vendor credit detail page');
        else fail('Vendor credit detail page');
    }

    const listChecks = [
        ['/billing/bills/', 'bills list API'],
        ['/billing/vendor-expenses/', 'expenses list API'],
        ['/billing/vendor-credits/', 'vendor credits list API'],
        ['/billing/bill-payments/', 'bill payments list API'],
    ];
    for (const [path, label] of listChecks) {
        const res = await api(token, path);
        if (res.status === 200) pass(label);
        else fail(label, `HTTP ${res.status}`);
    }

    summarize();
    process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

function summarize() {
    const ok = results.filter((r) => r.ok).length;
    const bad = results.filter((r) => !r.ok).length;
    console.log(`\n${ok} passed, ${bad} failed`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
