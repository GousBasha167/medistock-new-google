/* eslint-disable no-restricted-globals */

interface PrecacheEntry {
  url: string;
  revision: string | null;
}

interface SWNotificationAction {
  action: string;
  title: string;
}

interface SWExtendableEvent extends Event {
  waitUntil(f: Promise<unknown>): void;
}

interface SWFetchEvent extends SWExtendableEvent {
  request: Request;
  respondWith(r: Promise<Response> | Response): void;
}

interface SWPushEvent extends SWExtendableEvent {
  data: {
    json(): unknown;
    text(): string;
  } | null;
}

interface SWNotificationEvent extends SWExtendableEvent {
  notification: Notification & {
    data?: {
      url?: string;
      medicineId?: string;
    };
  };
}

interface SWClient {
  url: string;
  focus(): Promise<SWClient>;
  navigate?(url: string): Promise<SWClient | null>;
}

interface SWGlobal {
  __WB_MANIFEST?: Array<PrecacheEntry | string>;
  skipWaiting(): Promise<void>;
  clients: {
    claim(): Promise<void>;
    matchAll(options?: { type?: string; includeUncontrolled?: boolean }): Promise<SWClient[]>;
    openWindow(url: string): Promise<SWClient | null>;
  };
  registration: {
    showNotification(
      title: string,
      options?: NotificationOptions & {
        actions?: SWNotificationAction[];
        renotify?: boolean;
        data?: unknown;
      }
    ): Promise<void>;
  };
  addEventListener(type: 'install', listener: (e: SWExtendableEvent) => void): void;
  addEventListener(type: 'activate', listener: (e: SWExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (e: SWFetchEvent) => void): void;
  addEventListener(type: 'push', listener: (e: SWPushEvent) => void): void;
  addEventListener(type: 'notificationclick', listener: (e: SWNotificationEvent) => void): void;
}

const sw = self as unknown as SWGlobal;
const CACHE_NAME = 'medistock-app-v1';
const manifestEntries = (self as unknown as SWGlobal).__WB_MANIFEST ?? [];

sw.addEventListener('install', (event: SWExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const urls = manifestEntries
        .map((entry) => (typeof entry === 'string' ? entry : entry.url))
        .filter((u) => !u.endsWith('.map'));
      if (urls.length > 0) {
        try {
          await cache.addAll(urls);
        } catch {
          // Ignore individual asset cache failures in dev mode
        }
      }
      await sw.skipWaiting();
    })()
  );
});

sw.addEventListener('activate', (event: SWExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await sw.clients.claim();
    })()
  );
});

sw.addEventListener('fetch', (event: SWFetchEvent) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache API calls so inventory, auth, and reminders stay authoritative
  if (url.pathname.startsWith('/api/')) return;
  if (url.origin !== location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match('/index.html');
        return cached || Response.error();
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

sw.addEventListener('push', (event: SWPushEvent) => {
  let payload: {
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
    medicineId?: string;
  } = {};

  if (event.data) {
    try {
      payload = event.data.json() as typeof payload;
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'MediStock — Medicine Refill Reminder';
  const body = payload.body || 'A family medicine needs attention.';
  const targetUrl = payload.url || '/?view=reminders';

  event.waitUntil(
    sw.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: payload.tag || 'medistock-refill',
      renotify: true,
      data: {
        url: targetUrl,
        medicineId: payload.medicineId,
      },
    })
  );
});

sw.addEventListener('notificationclick', (event: SWNotificationEvent) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/?view=reminders';

  event.waitUntil(
    (async () => {
      const windowClients = await sw.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if ('focus' in client) {
          await client.focus();
          if (client.navigate) {
            await client.navigate(targetUrl);
          }
          return;
        }
      }

      await sw.clients.openWindow(targetUrl);
    })()
  );
});
