/// <reference lib="webworker" />

// export empty type because of tsc --isolatedModules flag
export type { };
declare const self: ServiceWorkerGlobalScope;

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { BackgroundSyncPlugin } from 'workbox-background-sync';
import { ExpirationPlugin } from 'workbox-expiration';

// Use strict mode for better error catching
'use strict';

// 1. clean up old caches
cleanupOutdatedCaches();

// 2. precache assets
// 2. precache assets
precacheAndRoute(self.__WB_MANIFEST || []);

// 3. take control immediately
self.skipWaiting();
clientsClaim();

// 4. Custom Routes

// API Routes - Network First, fallback to cache
// We handle /api/ and /mobile/api/
const bgSyncPlugin = new BackgroundSyncPlugin('offline-actions-queue', {
    maxRetentionTime: 24 * 60, // Retry for 24h
});

registerRoute(
    ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/mobile/api/'),
    new NetworkFirst({
        cacheName: 'vehicle-repairs-api-cache',
        plugins: [
            bgSyncPlugin,
            new ExpirationPlugin({
                maxEntries: 100,
                maxAgeSeconds: 24 * 60 * 60, // 24 hours
            }),
        ],
        networkTimeoutSeconds: 10,
    })
);

// Images - Cache First
registerRoute(
    ({ request }) => request.destination === 'image',
    new CacheFirst({
        cacheName: 'vehicle-repairs-images',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
            }),
        ],
    })
);

// 5. Events from original sw.js

// Push notifications
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Vehicle Repairs';
    const options = {
        body: data.body || 'You have a new notification',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        data: data.data || {},
        tag: data.tag || 'default',
        requireInteraction: data.requireInteraction || false,
        actions: data.actions || [],
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = event.notification.data;
    const urlToOpen = data.url || '/mobile/dashboard';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Check if there's already a window/tab open with the target URL
            for (const client of clientList) {
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            // If not, open a new window/tab
            if (self.clients.openWindow) {
                return self.clients.openWindow(urlToOpen);
            }
        })
    );
});
