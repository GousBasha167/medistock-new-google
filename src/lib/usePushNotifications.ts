import { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type BrowserPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function usePushNotifications(isAuthenticated: boolean) {
  const [permission, setPermission] = useState<BrowserPermissionState>('default');
  const [isSubscribedOnBrowser, setIsSubscribedOnBrowser] = useState(false);
  const [serverSubCount, setServerSubCount] = useState(0);
  const [vapidConfigured, setVapidConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  const refreshStatus = useCallback(async () => {
    if (!isSupported) {
      setPermission('unsupported');
    } else {
      setPermission(Notification.permission as BrowserPermissionState);
    }

    if (!isAuthenticated) return;

    try {
      const status = await api.getPushStatus();
      setServerSubCount(status.activeSubscriptionsCount);
      setVapidConfigured(status.vapidConfigured);

      if (isSupported) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          const existing = await reg.pushManager.getSubscription();
          setIsSubscribedOnBrowser(!!existing);
        } else {
          setIsSubscribedOnBrowser(false);
        }
      }
    } catch {
      // Ignore transient status fetch failure
    }
  }, [isAuthenticated, isSupported]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const subscribe = useCallback(async (): Promise<{ ok: boolean; reason?: string }> => {
    setError(null);
    if (!isSupported) {
      const msg = 'Push notifications are not supported in this browser or context.';
      setError(msg);
      return { ok: false, reason: msg };
    }

    setLoading(true);
    try {
      const permResult = await Notification.requestPermission();
      setPermission(permResult as BrowserPermissionState);

      if (permResult !== 'granted') {
        const msg =
          permResult === 'denied'
            ? 'Notification permission was blocked by your browser. Enable notifications in browser site settings to receive background alerts.'
            : 'Notification permission prompt was dismissed.';
        setError(msg);
        return { ok: false, reason: msg };
      }

      const { publicKey } = await api.getVapidPublicKey();
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Browser did not return valid push encryption keys.');
      }

      await api.subscribePush({
        endpoint: json.endpoint,
        keys: {
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
      });

      setIsSubscribedOnBrowser(true);
      await refreshStatus();
      return { ok: true };
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not enable push notifications on this device.';
      setError(msg);
      return { ok: false, reason: msg };
    } finally {
      setLoading(false);
    }
  }, [isSupported, refreshStatus]);

  const unsubscribe = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      if (isSupported) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await api.unsubscribePush(sub.endpoint);
          await sub.unsubscribe();
        } else {
          await api.unsubscribePush();
        }
      } else {
        await api.unsubscribePush();
      }
      setIsSubscribedOnBrowser(false);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unsubscribe.');
    } finally {
      setLoading(false);
    }
  }, [isSupported, refreshStatus]);

  return {
    isSupported,
    permission,
    isSubscribedOnBrowser,
    serverSubCount,
    vapidConfigured,
    loading,
    error,
    subscribe,
    unsubscribe,
    refreshStatus,
  };
}
