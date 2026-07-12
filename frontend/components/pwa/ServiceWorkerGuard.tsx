"use client";

import { useEffect } from "react";

/**
 * After a deploy, an old Service Worker can serve stale hashed chunks
 * (NS_ERROR_CORRUPTED_CONTENT). Reload once when the controller changes,
 * and recover from chunk-load failures by unregistering the SW.
 */
export function ServiceWorkerGuard() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let refreshing = false;
    const reloadOnce = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    const onControllerChange = () => reloadOnce();
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const clearAndReload = async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {
        // Still attempt reload
      }
      reloadOnce();
    };

    const looksLikeChunkFailure = (message: string) =>
      /Loading chunk|ChunkLoadError|NS_ERROR_CORRUPTED_CONTENT|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
        message
      );

    const onError = (event: ErrorEvent) => {
      const msg = event.message || "";
      const filename = event.filename || "";
      if (looksLikeChunkFailure(msg) || /\/_next\/static\/chunks\//.test(filename)) {
        void clearAndReload();
      }
    };

    const onUnhandled = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg =
        typeof reason === "string"
          ? reason
          : reason?.message || String(reason ?? "");
      if (looksLikeChunkFailure(msg)) {
        void clearAndReload();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []);

  return null;
}
