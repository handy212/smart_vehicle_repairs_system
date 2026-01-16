"use client";

import { useEffect, useState, useCallback } from 'react';
import {
  subscribeToPush,
  unsubscribeFromPush,
  subscriptionToJSON,
  requestNotificationPermission,
} from '@/lib/push/notification';
import apiClient from '@/lib/api/client';

export interface PushNotificationState {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  isSubscribing: boolean;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    permission: 'default',
    isSubscribed: false,
    isSubscribing: false,
  });

  const checkSupport = useCallback(() => {
    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;

    setState((prev) => ({
      ...prev,
      isSupported: supported,
      permission: supported ? Notification.permission : 'denied',
    }));
  }, []);

  const checkSubscription = useCallback(async () => {
    if (!state.isSupported) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setState((prev) => ({
        ...prev,
        isSubscribed: !!subscription,
      }));
    } catch (error) {
      console.error('[Push] Failed to check subscription:', error);
    }
  }, [state.isSupported]);

  const subscribe = useCallback(async (deviceName?: string) => {
    if (!state.isSupported) {
      return false;
    }

    setState((prev) => ({ ...prev, isSubscribing: true }));

    try {
      const subscription = await subscribeToPush();
      if (!subscription) {
        setState((prev) => ({ ...prev, isSubscribing: false }));
        return false;
      }

      // Send subscription to server
      const subscriptionData = subscriptionToJSON(subscription);
      await apiClient.post('/notifications/push/subscribe/', {
        ...subscriptionData,
        device_name: deviceName || 'Mobile Device',
      });

      setState((prev) => ({
        ...prev,
        isSubscribed: true,
        isSubscribing: false,
        permission: Notification.permission,
      }));

      return true;
    } catch (error) {
      console.error('[Push] Failed to subscribe:', error);
      setState((prev) => ({ ...prev, isSubscribing: false }));
      return false;
    }
  }, [state.isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!state.isSupported) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Notify server
        await apiClient.post('/notifications/push/unsubscribe/', {
          endpoint: subscription.endpoint,
        });

        // Unsubscribe locally
        await unsubscribeFromPush();

        setState((prev) => ({
          ...prev,
          isSubscribed: false,
        }));

        return true;
      }

      return false;
    } catch (error) {
      console.error('[Push] Failed to unsubscribe:', error);
      return false;
    }
  }, [state.isSupported]);

  const requestPermission = useCallback(async () => {
    const permission = await requestNotificationPermission();
    setState((prev) => ({
      ...prev,
      permission,
    }));
    return permission;
  }, []);

  useEffect(() => {
    checkSupport();
  }, [checkSupport]);

  useEffect(() => {
    if (state.isSupported) {
      checkSubscription();
    }
  }, [state.isSupported, checkSubscription]);

  return {
    ...state,
    subscribe,
    unsubscribe,
    requestPermission,
    checkSubscription,
  };
}
