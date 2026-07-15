/**
 * Clear only Workbox precache shells on activate.
 * Do not wipe runtime caches (static-image-assets, pages, cross-origin, etc.) —
 * that races with in-flight favicon/media fetches and surfaces as
 * "ServiceWorker intercepted the request and encountered an unexpected error".
 * Hashed `_next/static` assets are NetworkOnly in next.config (not precached).
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (name) =>
              name.includes("precache") || name.includes("workbox-precache")
          )
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "New notification",
      body: event.data ? event.data.text() : "",
    };
  }

  const title = payload.title || "New notification";
  const options = {
    body: payload.body || payload.message || "",
    icon: payload.icon || "/icons/icon-192x192.png",
    badge: payload.badge || "/icons/icon-192x192.png",
    data: payload.data || payload,
    tag: payload.tag || payload.data?.notification_id || undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = data.url || "/notifications";
  if ((!data.url || data.url === "/notifications") && data.work_order_id) {
    targetUrl = `/mobile/workorders/${data.work_order_id}`;
  }
  const url = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const matchingClient = clients.find((client) => client.url === url);
      if (matchingClient) {
        return matchingClient.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
