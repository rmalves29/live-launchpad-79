// OrderZaps Push Service Worker
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { title: 'Notificação', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Nova notificação';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    image: data.image || undefined,
    data: { url: data.url || '/', log_id: data.log_id || null },
    tag: data.tag || undefined,
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || '/';
  const trackUrl = data.log_id
    ? `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/push-track-click?log_id=${data.log_id}`
    : null;
  event.waitUntil((async () => {
    if (trackUrl) { try { await fetch(trackUrl, { method: 'POST', keepalive: true }); } catch (_) {} }
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of allClients) { if (c.url.includes(url)) { return c.focus(); } }
    return self.clients.openWindow(url);
  })());
});
