/**
 * Utilities for API data handling
 */

import { getBackendOrigin } from "@/lib/api/base-url";
import { sameOriginMediaPath } from "@/lib/utils/media";

/**
 * Resolves a Django media path or absolute backend media URL for display in the browser.
 * In the browser, always uses same-origin `/media/...` so Next.js proxies to Django
 * (avoids broken images when the API returns http://127.0.0.1:8001/media/...).
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
    if (typeof window !== "undefined") {
      const local = sameOriginMediaPath(path);
      if (local) return local;
    }
    return path;
  }

  const normalized = path.replace(/^\/+/, "");
  const mediaPath = normalized.startsWith("media/")
    ? `/${normalized}`
    : `/media/${normalized}`;

  if (typeof window !== "undefined") {
    return mediaPath;
  }

  return `${getBackendOrigin()}${mediaPath}`;
}
