import { sentryEnabled } from "./sentry.shared.config";

export async function register() {
  if (!sentryEnabled) {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.server.config");
  }
}

export async function onRequestError(
  ...args: unknown[]
) {
  if (!sentryEnabled) {
    return;
  }

  const Sentry = await import("@sentry/nextjs");
  return (Sentry.captureRequestError as (...params: unknown[]) => unknown)(...args);
}
