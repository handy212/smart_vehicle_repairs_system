/**
 * Shared Sentry options — only active when NEXT_PUBLIC_SENTRY_DSN is set.
 */
export const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

export const sharedSentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: sentryEnabled,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  sendDefaultPii: false,
};
