import type { FullConfig } from '@playwright/test';

const apiURL = (
    process.env.E2E_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001/api'
).replace(/\/$/, '');
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3001';

async function warmRoute(path: string) {
    try {
        await fetch(`${baseURL}${path}`, { redirect: 'follow' });
    } catch {
        // Dev server may still be starting.
    }
}

export default async function globalSetup(_config: FullConfig) {
    const email = process.env.E2E_EMAIL || 'e2e_admin@example.com';
    const password = process.env.E2E_PASSWORD || 'e2e_test_pass_123';
    try {
        const response = await fetch(`${apiURL}/auth/token/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        if (!response.ok) {
            console.warn(`[e2e setup] API login failed (${response.status})`);
        }
    } catch {
        console.warn('[e2e setup] API unreachable');
    }
    for (const route of ['/login', '/dashboard', '/workorders']) {
        await warmRoute(route);
    }
}
