import { sentryEnabled } from "./sentry.shared.config";

if (sentryEnabled) {
  void import("./sentry.client.config");
}
