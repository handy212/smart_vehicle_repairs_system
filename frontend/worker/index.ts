import { BackgroundSyncPlugin } from "workbox-background-sync";
import { NetworkFirst, NetworkOnly } from "workbox-strategies";
import { registerRoute } from "workbox-routing";
import { ExpirationPlugin } from "workbox-expiration";
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// 1. Background Sync for Offline Mutations (POST, PUT, PATCH, DELETE)
const bgSyncPlugin = new BackgroundSyncPlugin("offline-mutation-queue", {
    maxRetentionTime: 24 * 60, // Retry for up to 24 hours (in minutes)
    onSync: async ({ queue }) => {
        console.log("[SW] Replaying offline queue...", queue.name);
        try {
            await queue.replayRequests();
            console.log("[SW] Offline queue replayed successfully");
        } catch (error) {
            console.error("[SW] Offline queue replay failed:", error);
            // It will automatically retry later if standard Workbox logic applies
        }
    },
});

registerRoute(
    ({ request }) =>
        request.url.includes("/api/") &&
        ["POST", "PUT", "PATCH", "DELETE"].includes(request.method),
    new NetworkOnly({
        plugins: [bgSyncPlugin],
    })
);

// 2. Runtime Caching for API Queries (GET)
// Network First: Try to get fresh data, fall back to cache if offline
registerRoute(
    ({ request }) =>
        request.url.includes("/api/") &&
        request.method === "GET",
    new NetworkFirst({
        cacheName: "api-cache",
        plugins: [
            new ExpirationPlugin({
                maxEntries: 100,
                maxAgeSeconds: 24 * 60 * 60, // 24 hours
            }),
        ],
    })
);

// 3. Precache static assets (injected by build process)
// We need to use self.__WB_MANIFEST but cast it properly
cleanupOutdatedCaches();
precacheAndRoute((self as any).__WB_MANIFEST || []);

// 4. Push & Notification Logic
self.addEventListener("push", (event) => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || "Smart Vehicle Repairs";
    const options = {
        body: data.body || "You have a new notification",
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-72x72.png",
        data: data.data || {},
        tag: data.tag || "default",
        requireInteraction: data.requireInteraction || false,
        actions: data.actions || [],
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const data = event.notification.data;
    const urlToOpen = data.url || "/mobile/dashboard";

    event.waitUntil(
        self.clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if (client.url === urlToOpen && "focus" in client) {
                        return client.focus();
                    }
                }
                if (self.clients.openWindow) {
                    return self.clients.openWindow(urlToOpen);
                }
            })
    );
});
