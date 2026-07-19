import { authApi } from "@/lib/api/auth";

export type RefreshAccessTokenOutcome =
  | { status: "refreshed" }
  | { status: "expired"; httpStatus: 401 }
  | { status: "transient"; httpStatus?: number; error: unknown };

type SharedRefreshOutcome = {
  id: string;
  timestamp: number;
  status: RefreshAccessTokenOutcome["status"];
  httpStatus?: number;
};

const REFRESH_LOCK_NAME = "svrs-auth-refresh";
const REFRESH_LOCK_KEY = "svrs:auth-refresh-lock";
const REFRESH_OUTCOME_KEY = "svrs:auth-refresh-outcome";
const REFRESH_CHANNEL_NAME = "svrs-auth-refresh";
const LOCK_TTL_MS = 10_000;
const OUTCOME_TTL_MS = 15_000;
const TRANSIENT_COOLDOWN_MS = 5_000;
const RATE_LIMIT_COOLDOWN_MS = 15_000;

let inflightRefresh: Promise<RefreshAccessTokenOutcome> | null = null;
let loginRedirectStarted = false;
let transientCooldown:
  | { until: number; outcome: RefreshAccessTokenOutcome }
  | null = null;

function createCoordinationId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getHttpStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (error as { response?: { status?: unknown } }).response;
    return typeof response?.status === "number" ? response.status : undefined;
  }
  return undefined;
}

function classifyRefreshError(error: unknown): RefreshAccessTokenOutcome {
  const httpStatus = getHttpStatus(error);
  if (httpStatus === 401) {
    return { status: "expired", httpStatus };
  }
  return { status: "transient", httpStatus, error };
}

function readSharedOutcome(): SharedRefreshOutcome | null {
  try {
    const raw = localStorage.getItem(REFRESH_OUTCOME_KEY);
    if (!raw) return null;
    const outcome = JSON.parse(raw) as SharedRefreshOutcome;
    if (
      !outcome.id ||
      typeof outcome.timestamp !== "number" ||
      Date.now() - outcome.timestamp > OUTCOME_TTL_MS
    ) {
      return null;
    }
    return outcome;
  } catch {
    return null;
  }
}

function fromSharedOutcome(outcome: SharedRefreshOutcome): RefreshAccessTokenOutcome {
  if (outcome.status === "refreshed") return { status: "refreshed" };
  if (outcome.status === "expired") return { status: "expired", httpStatus: 401 };
  return {
    status: "transient",
    httpStatus: outcome.httpStatus,
    error: new Error("Token refresh failed in another browser tab"),
  };
}

function publishOutcome(outcome: RefreshAccessTokenOutcome): void {
  const shared: SharedRefreshOutcome = {
    id: createCoordinationId(),
    timestamp: Date.now(),
    status: outcome.status,
    ...("httpStatus" in outcome && outcome.httpStatus
      ? { httpStatus: outcome.httpStatus }
      : {}),
  };
  try {
    localStorage.setItem(REFRESH_OUTCOME_KEY, JSON.stringify(shared));
  } catch {
    // Storage can be unavailable in private/sandboxed browser contexts.
  }
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(REFRESH_CHANNEL_NAME);
      channel.postMessage(shared);
      channel.close();
    } catch {
      // localStorage remains the durable fallback signal.
    }
  }
}

async function performRefresh(): Promise<RefreshAccessTokenOutcome> {
  try {
    await authApi.refreshToken();
    const outcome: RefreshAccessTokenOutcome = { status: "refreshed" };
    transientCooldown = null;
    publishOutcome(outcome);
    return outcome;
  } catch (error) {
    const outcome = classifyRefreshError(error);
    if (outcome.status === "transient") {
      const cooldownMs =
        outcome.httpStatus === 429 ? RATE_LIMIT_COOLDOWN_MS : TRANSIENT_COOLDOWN_MS;
      transientCooldown = { until: Date.now() + cooldownMs, outcome };
    } else {
      transientCooldown = null;
    }
    publishOutcome(outcome);
    return outcome;
  }
}

async function withWebLock(
  baselineId: string | undefined,
): Promise<RefreshAccessTokenOutcome> {
  return navigator.locks.request(REFRESH_LOCK_NAME, { mode: "exclusive" }, async () => {
    const shared = readSharedOutcome();
    if (shared && shared.id !== baselineId) {
      return fromSharedOutcome(shared);
    }
    return performRefresh();
  });
}

function tryAcquireStorageLease(owner: string): boolean {
  try {
    const now = Date.now();
    const currentRaw = localStorage.getItem(REFRESH_LOCK_KEY);
    const current = currentRaw
      ? (JSON.parse(currentRaw) as { owner?: string; expiresAt?: number })
      : null;
    if (current?.owner && (current.expiresAt ?? 0) > now) return false;
    localStorage.setItem(
      REFRESH_LOCK_KEY,
      JSON.stringify({ owner, expiresAt: now + LOCK_TTL_MS }),
    );
    const acquired = JSON.parse(localStorage.getItem(REFRESH_LOCK_KEY) ?? "{}") as {
      owner?: string;
    };
    return acquired.owner === owner;
  } catch {
    return true;
  }
}

function releaseStorageLease(owner: string): void {
  try {
    const current = JSON.parse(localStorage.getItem(REFRESH_LOCK_KEY) ?? "{}") as {
      owner?: string;
    };
    if (current.owner === owner) localStorage.removeItem(REFRESH_LOCK_KEY);
  } catch {
    // Nothing to release when storage is unavailable.
  }
}

function waitForSharedOutcome(
  baselineId: string | undefined,
): Promise<SharedRefreshOutcome | null> {
  return new Promise((resolve) => {
    let settled = false;
    let channel: BroadcastChannel | null = null;
    const finish = (outcome: SharedRefreshOutcome | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("storage", onStorage);
      channel?.close();
      clearInterval(poll);
      clearTimeout(timeout);
      resolve(outcome);
    };
    const accept = (candidate: SharedRefreshOutcome | null) => {
      if (candidate && candidate.id !== baselineId) finish(candidate);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === REFRESH_OUTCOME_KEY) accept(readSharedOutcome());
    };
    window.addEventListener("storage", onStorage);
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(REFRESH_CHANNEL_NAME);
        channel.onmessage = (event: MessageEvent<SharedRefreshOutcome>) => accept(event.data);
      } catch {
        channel = null;
      }
    }
    const poll = window.setInterval(() => accept(readSharedOutcome()), 100);
    const timeout = window.setTimeout(() => finish(null), LOCK_TTL_MS + 250);
  });
}

async function withStorageCoordination(
  baselineId: string | undefined,
): Promise<RefreshAccessTokenOutcome> {
  const owner = createCoordinationId();
  if (tryAcquireStorageLease(owner)) {
    try {
      return await performRefresh();
    } finally {
      releaseStorageLease(owner);
    }
  }

  const shared = await waitForSharedOutcome(baselineId);
  if (shared) return fromSharedOutcome(shared);

  // The other tab may have crashed. Retry after its bounded lease expires.
  return withStorageCoordination(readSharedOutcome()?.id);
}

async function coordinateRefresh(): Promise<RefreshAccessTokenOutcome> {
  if (typeof window === "undefined") return performRefresh();
  const baselineId = readSharedOutcome()?.id;
  if (typeof navigator.locks !== "undefined") {
    return withWebLock(baselineId);
  }
  return withStorageCoordination(baselineId);
}

/** Prevent competing auth gates/interceptors from scheduling the same navigation. */
export function redirectToLoginOnce(): void {
  if (typeof window === "undefined" || window.location.pathname === "/login") return;
  if (loginRedirectStarted) return;
  loginRedirectStarted = true;
  window.location.href = "/login";
}

/** Used after a successful refresh so a later, genuinely expired session can redirect. */
export function resetLoginRedirectGuard(): void {
  loginRedirectStarted = false;
}

/**
 * Refresh through the BFF with in-tab and cross-tab serialization.
 */
export function refreshAccessToken(): Promise<RefreshAccessTokenOutcome> {
  if (
    transientCooldown &&
    Date.now() < transientCooldown.until &&
    transientCooldown.outcome.status === "transient"
  ) {
    return Promise.resolve(transientCooldown.outcome);
  }

  if (inflightRefresh) {
    return inflightRefresh;
  }

  inflightRefresh = coordinateRefresh()
    .finally(() => {
      inflightRefresh = null;
    });

  return inflightRefresh;
}
