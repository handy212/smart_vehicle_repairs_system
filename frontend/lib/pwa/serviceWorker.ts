import apiClient from "@/lib/api/client";

/**
 * Service Worker Registration and Management
 */

export type ServiceWorkerRegistrationState = 'installing' | 'installed' | 'activating' | 'activated' | 'redundant';

export interface ServiceWorkerMessage {
  type: string;
  payload?: any;
}

class ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;
  private updateAvailable = false;
  private listeners: Map<string, Set<(data?: any) => void>> = new Map();

  /**
   * Register the service worker
   */
  async register(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.warn('[PWA] Service workers are not supported');
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      this.registration = registration;

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available
              this.updateAvailable = true;
              this.emit('updateAvailable', { registration });
            }
          });
        }
      });

      // Listen for controller change (new service worker activated)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        this.emit('controllerChange', {});
        // Reload page to use new service worker
        if (this.updateAvailable) {
          window.location.reload();
        }
      });

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleMessage(event.data);
      });

      console.log('[PWA] Service worker registered:', registration.scope);
      return registration;
    } catch (error) {
      console.error('[PWA] Service worker registration failed:', error);
      return null;
    }
  }

  /**
   * Unregister the service worker
   */
  async unregister(): Promise<boolean> {
    if (!this.registration) {
      return false;
    }

    try {
      const result = await this.registration.unregister();
      this.registration = null;
      return result;
    } catch (error) {
      console.error('[PWA] Service worker unregistration failed:', error);
      return false;
    }
  }

  /**
   * Update the service worker
   */
  async update(): Promise<void> {
    if (!this.registration) {
      return;
    }

    try {
      await this.registration.update();
    } catch (error) {
      console.error('[PWA] Service worker update failed:', error);
    }
  }

  /**
   * Send message to service worker
   */
  async sendMessage(message: ServiceWorkerMessage): Promise<void> {
    if (!this.registration || !this.registration.active) {
      console.warn('[PWA] Service worker not active, cannot send message');
      return;
    }

    this.registration.active.postMessage(message);
  }

  /**
   * Get current registration
   */
  getRegistration(): ServiceWorkerRegistration | null {
    return this.registration;
  }

  /**
   * Check if update is available
   */
  isUpdateAvailable(): boolean {
    return this.updateAvailable;
  }

  /**
   * Skip waiting and activate new service worker
   */
  async skipWaiting(): Promise<void> {
    if (!this.registration || !this.registration.waiting) {
      return;
    }

    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  /**
   * Subscribe to events
   */
  on(event: string, callback: (data?: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  /**
   * Emit event to listeners
   */
  private emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  /**
   * Handle messages from service worker
   */
  private handleMessage(data: ServiceWorkerMessage): void {
    this.emit('message', data);

    // Handle specific message types
    switch (data.type) {
      case 'CACHE_UPDATED':
        this.emit('cacheUpdated', data.payload);
        break;
      case 'OFFLINE_ACTION_SYNCED':
        this.emit('offlineActionSynced', data.payload);
        break;
      default:
        break;
    }
  }

  /**
   * Subscribe to Web Push notifications
   */
  async subscribeToPush(): Promise<boolean> {
    if (!this.registration) {
      console.warn('[PWA] No SW registration, cannot subscribe to push');
      return false;
    }

    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        console.error('[PWA] VAPID public key not found');
        return false;
      }

      // Check current permission
      if (Notification.permission === 'denied') {
        console.warn('[PWA] Notification permission denied');
        return false;
      }

      // Subscribe (this will prompt user if not granted)
      const subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Send to backend
      const keys = subscription.toJSON().keys;

      // We need to import apiClient dynamically or use the one we added at top
      // Importing at top is better
      await apiClient.post('/notifications/push-subscriptions/subscribe/', {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: keys?.p256dh,
          auth: keys?.auth,
        },
        device_name: navigator.platform || 'Unknown Device',
      });

      console.log('[PWA] Push subscription verified with backend');
      return true;
    } catch (error) {
      console.error('[PWA] Failed to subscribe to push:', error);
      return false;
    }
  }
}

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Singleton instance
export const serviceWorkerManager = new ServiceWorkerManager();
