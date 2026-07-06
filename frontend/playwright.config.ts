import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3001';
const apiURL = process.env.E2E_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001/api';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 1,
    workers: 1,
    reporter: process.env.CI ? 'github' : 'list',
    timeout: 120_000,
    expect: { timeout: 30_000 },
    globalSetup: './e2e/global-setup.ts',
    use: {
        baseURL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        navigationTimeout: 90_000,
        actionTimeout: 30_000,
        extraHTTPHeaders: {},
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    metadata: { apiURL },
});
