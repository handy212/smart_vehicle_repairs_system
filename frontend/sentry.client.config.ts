import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions, sentryEnabled } from "./sentry.shared.config";

if (sentryEnabled) {
  Sentry.init(sharedSentryOptions);
}
