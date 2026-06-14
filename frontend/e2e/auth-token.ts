const apiURL = (process.env.E2E_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001/api').replace(
    /\/$/,
    '',
);

export type TokenPair = { access: string; refresh: string };

const tokenCache = new Map<string, TokenPair>();

export const E2E_ROLE_USERS = {
    admin: {
        email: process.env.E2E_EMAIL || 'e2e_admin@example.com',
        password: process.env.E2E_PASSWORD || 'e2e_test_pass_123',
    },
    manager: {
        email: process.env.E2E_MANAGER_EMAIL || 'e2e_manager@example.com',
        password: process.env.E2E_PASSWORD || 'e2e_test_pass_123',
    },
    receptionist: {
        email: process.env.E2E_RECEPTIONIST_EMAIL || 'e2e_receptionist@example.com',
        password: process.env.E2E_PASSWORD || 'e2e_test_pass_123',
    },
    accountant: {
        email: process.env.E2E_ACCOUNTANT_EMAIL || 'e2e_accountant@example.com',
        password: process.env.E2E_PASSWORD || 'e2e_test_pass_123',
    },
    technician: {
        email: process.env.E2E_TECH_EMAIL || 'e2e_technician@example.com',
        password: process.env.E2E_PASSWORD || 'e2e_test_pass_123',
    },
    service_coordinator: {
        email: process.env.E2E_COORDINATOR_EMAIL || 'e2e_coordinator@example.com',
        password: process.env.E2E_PASSWORD || 'e2e_test_pass_123',
    },
    parts_manager: {
        email: process.env.E2E_PARTS_EMAIL || 'e2e_parts@example.com',
        password: process.env.E2E_PASSWORD || 'e2e_test_pass_123',
    },
    hr_manager: {
        email: process.env.E2E_HR_EMAIL || 'e2e_hr@example.com',
        password: process.env.E2E_PASSWORD || 'e2e_test_pass_123',
    },
} as const;

export type E2ERole = keyof typeof E2E_ROLE_USERS;

/** Single cached JWT fetch per email — avoids login rate-limit during E2E suites. */
export async function fetchE2ETokensForRole(role: E2ERole = 'admin'): Promise<TokenPair> {
    const credentials = E2E_ROLE_USERS[role];
    const cacheKey = credentials.email;
    const cached = tokenCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const response = await fetch(`${apiURL}/auth/token/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: credentials.email, password: credentials.password }),
    });

    if (!response.ok) {
        throw new Error(
            `E2E login failed for ${credentials.email} (${response.status}). Ensure create_e2e_user.py ran and the API is up.`,
        );
    }

    const data = (await response.json()) as Partial<TokenPair>;
    if (!data.access) {
        throw new Error(`E2E login response missing access token for ${credentials.email}`);
    }

    const tokens = { access: data.access, refresh: data.refresh || '' };
    tokenCache.set(cacheKey, tokens);
    return tokens;
}

/** Single cached JWT fetch per process — avoids login rate-limit during E2E suites. */
export async function fetchE2ETokens(): Promise<TokenPair> {
    return fetchE2ETokensForRole('admin');
}
