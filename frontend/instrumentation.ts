import * as Sentry from "@sentry/nextjs";
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
  ...args: Parameters<typeof Sentry.captureRequestError>
) {
  if (!sentryEnabled) {
    return;
  }
  return Sentry.captureRequestError(...args);
}
