/**
 * Web Push Notification Service
 */

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }

  if (Notification.permission === 'default') {
    return await Notification.requestPermission();
  }

  return Notification.permission;
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Push] Push notifications are not supported');
    return null;
  }

  try {
    const vapidKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
    if (!vapidKey) {
      console.warn('[Push] Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY');
      return null;
    }

    // Check for obviously invalid keys (short strings, placeholders)
    if (vapidKey.length < 20 || vapidKey.includes('example') || vapidKey.includes('placeholder')) {
      console.warn('[Push] Invalid NEXT_PUBLIC_VAPID_PUBLIC_KEY: Key appears to be a placeholder or malformed.');
      return null;
    }

    let applicationServerKey: Uint8Array;
    try {
      applicationServerKey = urlBase64ToUint8Array(vapidKey);
      // Valid P-256 public key is uncompressed (0x04) + 64 bytes = 65 bytes
      if (applicationServerKey.length !== 65) {
        console.warn(
          `[Push] Invalid VAPID public key length: ${applicationServerKey.length} bytes (expected 65). Key might be corrupt.`
        );
        return null;
      }
    } catch (error) {
      console.warn("[Push] Failed to decode VAPID public key", error);
      return null;
    }

    // Request permission
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      console.warn('[Push] Notification permission denied');
      return null;
    }

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Subscribe to push
    try {
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as any, // Cast to any to avoid ArrayBuffer/SharedArrayBuffer mismatch
      });
      return subscription;
    } catch (subError: any) {
      if (subError.name === 'InvalidAccessError') {
        // Suppress stack trace for known InvalidAccessError (bad VAPID key)
        console.warn('[Push] Invalid VAPID key rejected by browser. Please check your NEXT_PUBLIC_VAPID_PUBLIC_KEY.');
      } else {
        console.error('[Push] Browser subscription failed:', subError);
      }
      return null;
    }

  } catch (error: any) {
    if (error?.name === 'InvalidAccessError') {
      console.warn('[Push] Invalid VAPID key rejected by browser (outer catch). Please check your NEXT_PUBLIC_VAPID_PUBLIC_KEY.');
      return null;
    }
    console.error('[Push] Failed to subscribe:', error);
    return null;
  }
}

/**
 * Convert subscription to JSON format for API
 */
export function subscriptionToJSON(
  subscription: PushSubscription
): PushSubscriptionData {
  const key = subscription.getKey('p256dh');
  const auth = subscription.getKey('auth');

  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: key ? btoa(String.fromCharCode(...new Uint8Array(key))) : '',
      auth: auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : '',
    },
  };
}

/**
 * Convert VAPID public key from base64 URL to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  if (!base64String) {
    throw new Error("Missing VAPID public key");
  }
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      return true;
    }

    return false;
  } catch (error) {
    console.error('[Push] Failed to unsubscribe:', error);
    return false;
  }
}
