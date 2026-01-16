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
}

// Singleton instance
export const serviceWorkerManager = new ServiceWorkerManager();
