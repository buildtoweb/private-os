/* Private Dashboard service worker.
 *
 * Only the offline page and static presentation assets are cached. Navigations,
 * API responses, cookies and authenticated dashboard data are never persisted.
 */
const CACHE_NAME = 'private-dashboard-static-v3';
const PRECACHE = [
  '/offline.html',
  '/icons/icon-192.png?v=2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Local Next development reuses chunk URLs while their content changes.
  // Never serve those chunks from the production offline cache.
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return;
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Never cache an authenticated document. When the network is unavailable,
  // show a neutral shell that cannot present stale business data as current.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }

  const isStaticAsset = url.pathname.startsWith('/_next/static/')
    || url.pathname.startsWith('/fonts/')
    || url.pathname.startsWith('/icons/');
  if (!isStaticAsset) return;

  // Hashed Next assets and versioned icons stay unchanged until the next
  // deployment. Cache-first avoids refetching them on every app launch.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      event.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  })());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = typeof data.title === 'string' ? data.title : 'Private Dashboard';
  const route = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
  const badgeCount = Number.isFinite(data.badgeCount) ? Math.max(0, Math.floor(data.badgeCount)) : null;
  const tasks = [];

  if (badgeCount !== null && 'setAppBadge' in self.navigator) {
    const badgeTask = badgeCount > 0
      ? self.navigator.setAppBadge(badgeCount)
      : ('clearAppBadge' in self.navigator
          ? self.navigator.clearAppBadge()
          : self.navigator.setAppBadge(0));
    // Badge support varies by install mode. A badge failure must never prevent
    // the user-visible notification required by the Push API.
    tasks.push(Promise.resolve(badgeTask).catch(() => undefined));
  }

  tasks.push(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icons/icon-192.png?v=2',
    badge: '/icons/badge-96.png?v=2',
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    data: { url: route },
  }));

  event.waitUntil(Promise.all(tasks));
});

// The push service rotated this device's endpoint. Subscribe again with the
// same key and tell the server, so reminders keep arriving without a visit.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const options = event.oldSubscription?.options;
    const sub = event.newSubscription
      ?? (options?.applicationServerKey
        ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey })
        : null);
    if (!sub) return;
    await fetch('/api/push-subscriptions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });
    if (event.oldSubscription && event.oldSubscription.endpoint !== sub.endpoint) {
      await fetch('/api/push-subscriptions', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: event.oldSubscription.endpoint }),
      });
    }
  })().catch(() => undefined));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = typeof event.notification.data?.url === 'string'
    && event.notification.data.url.startsWith('/')
    ? event.notification.data.url
    : '/';
  const targetUrl = new URL(route, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});
