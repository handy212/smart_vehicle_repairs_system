/**
 * Utilities for API data handling
 */

import { sameOriginMediaPath } from "@/lib/utils/media";

/**
 * Resolves a Django media path or absolute backend media URL for display in the browser.
 * Always uses same-origin `/media/...` so Next.js proxies to Django — including SSR
 * metadata/manifest icons (absolute api.* URLs are intercepted by the PWA service
 * worker and fail without CORS).
 */
/** Bare setting keys stored before an admin uploads a real file. */
const PLACEHOLDER_SETTING_KEYS = new Set([
  "favicon_path",
  "logo_path",
  "logo_dark_path",
  "login_background",
  "customer_login_background",
  "staff_login_background",
]);

/** Settings sometimes store the field key as a filename before a real file is uploaded. */
function isPlaceholderMediaPath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) return true;

  let normalized = trimmed.replace(/^\/+/, "");
  if (normalized.startsWith("media/")) {
    normalized = normalized.slice("media/".length);
  }

  // Uploads are saved as branding/{setting_key}.{ext} — never treat those as placeholders.
  if (normalized.startsWith("branding/")) {
    return false;
  }

  return PLACEHOLDER_SETTING_KEYS.has(normalized.toLowerCase());
}

export function getMediaUrl(path: string | null | undefined): string {
  if (!path || isPlaceholderMediaPath(path)) return "";

  if (path.startsWith("blob:") || path.startsWith("data:")) {
    return path;
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    const local = sameOriginMediaPath(path);
    if (local) return local;
    return path;
  }

  const normalized = path.replace(/^\/+/, "");
  return normalized.startsWith("media/")
    ? `/${normalized}`
    : `/media/${normalized}`;
}
