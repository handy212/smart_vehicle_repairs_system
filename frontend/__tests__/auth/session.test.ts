import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    user: { id: 1, email: "cached@example.com", role: "admin" } as unknown,
    isAuthenticated: true,
    setUser: vi.fn(),
    logout: vi.fn(),
  };
  return {
    state,
    getCurrentUser: vi.fn(),
  };
});

vi.mock("@/lib/api/auth", () => ({
  authApi: { getCurrentUser: mocks.getCurrentUser },
}));

vi.mock("@/lib/auth/refresh-access-token", () => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock("@/lib/utils/token", () => ({
  getAccessToken: () => null,
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: {
    getState: () => mocks.state,
  },
}));

describe("API session restoration", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getCurrentUser.mockReset();
    mocks.state.isAuthenticated = true;
    mocks.state.setUser.mockReset();
    mocks.state.logout.mockReset();
  });

  it.each([
    ["503", { response: { status: 503 } }],
    ["network failure", new TypeError("Failed to fetch")],
  ])("preserves the cached session on %s", async (_label, error) => {
    mocks.getCurrentUser.mockRejectedValue(error);
    const { getApiSessionOutcome, ensureApiSession } = await import("@/lib/auth/session");

    await expect(getApiSessionOutcome()).resolves.toEqual({
      status: "transient",
      error,
    });
    expect(mocks.state.logout).not.toHaveBeenCalled();
    await expect(ensureApiSession()).resolves.toBe(true);
  });

  it("clears auth state only for a definitive 401", async () => {
    mocks.getCurrentUser.mockRejectedValue({ response: { status: 401 } });
    const { getApiSessionOutcome } = await import("@/lib/auth/session");

    await expect(getApiSessionOutcome()).resolves.toEqual({ status: "expired" });
    expect(mocks.state.logout).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent session checks", async () => {
    let complete!: (user: unknown) => void;
    mocks.getCurrentUser.mockImplementation(
      () => new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const { getApiSessionOutcome } = await import("@/lib/auth/session");

    const first = getApiSessionOutcome();
    const second = getApiSessionOutcome();
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);

    complete({ id: 2, email: "fresh@example.com", role: "admin" });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "authenticated" },
      { status: "authenticated" },
    ]);
  });
});
