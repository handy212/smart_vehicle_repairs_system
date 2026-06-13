import { sentryEnabled } from "./sentry.shared.config";

export async function register() {
  if (!sentryEnabled) {
    return;
  }

  const sentryServerConfigModule = "./sentry.server.config";

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import(sentryServerConfigModule);
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import(sentryServerConfigModule);
  }
}

export async function onRequestError(
  ...args: unknown[]
) {
  if (!sentryEnabled) {
    return;
  }

  const moduleName = "@sentry/nextjs";
  const Sentry = await import(moduleName);
  return (Sentry.captureRequestError as (...params: unknown[]) => unknown)(...args);
}
