import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshToken = vi.fn();

vi.mock("@/lib/api/auth", () => ({
  authApi: { refreshToken },
}));

describe("refreshAccessToken", () => {
  beforeEach(() => {
    vi.resetModules();
    refreshToken.mockReset();
    localStorage.clear();
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      value: undefined,
    });
  });

  it("classifies a 401 as definitive expiration", async () => {
    refreshToken.mockRejectedValue({ response: { status: 401 } });
    const { refreshAccessToken } = await import("@/lib/auth/refresh-access-token");

    await expect(refreshAccessToken()).resolves.toEqual({
      status: "expired",
      httpStatus: 401,
    });
  });

  it.each([429, 503])("classifies HTTP %s as transient", async (status) => {
    const error = { response: { status } };
    refreshToken.mockRejectedValue(error);
    const { refreshAccessToken } = await import("@/lib/auth/refresh-access-token");

    await expect(refreshAccessToken()).resolves.toEqual({
      status: "transient",
      httpStatus: status,
      error,
    });
  });

  it("cools down after a rate-limited refresh instead of hammering again", async () => {
    vi.useFakeTimers();
    const error = { response: { status: 429 } };
    refreshToken.mockRejectedValue(error);
    const { refreshAccessToken } = await import("@/lib/auth/refresh-access-token");

    await expect(refreshAccessToken()).resolves.toMatchObject({
      status: "transient",
      httpStatus: 429,
    });
    await expect(refreshAccessToken()).resolves.toMatchObject({
      status: "transient",
      httpStatus: 429,
    });
    expect(refreshToken).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(15_000);
    await expect(refreshAccessToken()).resolves.toMatchObject({
      status: "transient",
      httpStatus: 429,
    });
    expect(refreshToken).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("classifies a network error as transient", async () => {
    const error = new TypeError("Failed to fetch");
    refreshToken.mockRejectedValue(error);
    const { refreshAccessToken } = await import("@/lib/auth/refresh-access-token");

    await expect(refreshAccessToken()).resolves.toEqual({
      status: "transient",
      error,
    });
  });

  it("deduplicates concurrent callers within a tab", async () => {
    let complete!: () => void;
    refreshToken.mockImplementation(
      () => new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    const { refreshAccessToken } = await import("@/lib/auth/refresh-access-token");

    const first = refreshAccessToken();
    const second = refreshAccessToken();
    expect(first).toBe(second);
    expect(refreshToken).toHaveBeenCalledTimes(1);

    complete();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "refreshed" },
      { status: "refreshed" },
    ]);
  });

  it("uses the Web Locks API for cross-tab serialization", async () => {
    const request = vi.fn(
      async (
        _name: string,
        _options: LockOptions,
        callback: () => Promise<unknown>,
      ) => callback(),
    );
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request },
    });
    refreshToken.mockResolvedValue({});
    const { refreshAccessToken } = await import("@/lib/auth/refresh-access-token");

    await expect(refreshAccessToken()).resolves.toEqual({ status: "refreshed" });
    expect(request).toHaveBeenCalledWith(
      "svrs-auth-refresh",
      { mode: "exclusive" },
      expect.any(Function),
    );
  });
});
