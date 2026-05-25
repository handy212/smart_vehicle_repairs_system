const apiURL = (process.env.E2E_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001/api').replace(
    /\/$/,
    '',
);

export type TokenPair = { access: string; refresh: string };

let cachedTokens: TokenPair | null = null;

/** Single cached JWT fetch per process — avoids login rate-limit during E2E suites. */
export async function fetchE2ETokens(): Promise<TokenPair> {
    if (cachedTokens) {
        return cachedTokens;
    }

    const email = process.env.E2E_EMAIL || 'e2e_admin@example.com';
    const password = process.env.E2E_PASSWORD || 'e2e_test_pass_123';

    const response = await fetch(`${apiURL}/auth/token/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
        throw new Error(
            `E2E login failed (${response.status}). Ensure the API is running, E2E user exists, and rate limits are not exceeded.`,
        );
    }

    const data = (await response.json()) as Partial<TokenPair>;
    if (!data.access) {
        throw new Error('E2E login response missing access token');
    }
    cachedTokens = { access: data.access, refresh: data.refresh || '' };
    return cachedTokens;
}
