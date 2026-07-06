"use client";

import { useEffect, useRef } from "react";
import { notificationsApi } from "@/lib/api/notifications";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function subscribeToWebPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return false;
  }

  const publicKey = await notificationsApi.pushSubscriptions.publicKey();
  if (!publicKey.configured || !publicKey.public_key) {
    return false;
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey.public_key),
    }));
  const payload = subscription.toJSON();

  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
    return false;
  }

  await notificationsApi.pushSubscriptions.subscribe({
    endpoint: payload.endpoint,
    keys: {
      p256dh: payload.keys.p256dh,
      auth: payload.keys.auth,
    },
    device_name: navigator.userAgent,
  });

  const preferences = await notificationsApi.getPreferences().catch(() => null);
  if (preferences && !preferences.push_enabled) {
    await notificationsApi.updatePreferences({ push_enabled: true });
  }

  return true;
}

/**
 * Auto-register Web Push for PWA / tech app shells after login.
 */
export function useWebPushRegistration(enabled = true) {
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!enabled || attemptedRef.current) return;
    if (typeof window === "undefined") return;

    attemptedRef.current = true;
    subscribeToWebPush().catch(() => {
      // Permission denied or push not configured — polling still works.
    });
  }, [enabled]);
}
