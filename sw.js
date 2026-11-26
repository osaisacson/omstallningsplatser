// Service worker: tar emot push-notiser och sätter siffran på appikonen, även när appen är stängd.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Appens egna filer frågas alltid efter hos servern (ett snabbt "har den ändrats?"), så att man aldrig får
// en blandning av nya och gamla filer efter en uppdatering – det kunde ge en vit skärm.
// Bilder och videor från Supabase har unika namn och ändras aldrig: de sparas i telefonen första gången
// och visas direkt från den sedan – även när nätet är långsamt. De äldsta rensas när det blir för många.
const MEDIA = 'media-v1';
const MEDIA_MAX = 400;
async function trimMedia() {
  const c = await caches.open(MEDIA);
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MEDIA_MAX))) await c.delete(k);
}
async function mediaFirst(req) {
  const c = await caches.open(MEDIA);
  const hit = await c.match(req.url);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') { c.put(req.url, res.clone()).then(trimMedia).catch(() => {}); }
  return res;
}
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method === 'GET' && u.pathname.startsWith('/storage/v1/object/public/') && !/\.(mp4|mov|webm|m4v)$/i.test(u.pathname) && !e.request.headers.has('range')) {
    e.respondWith(mediaFirst(e.request).catch(() => fetch(e.request)));
    return;
  }
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || e.request.mode === 'navigate') return;
  e.respondWith(fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).catch(() => fetch(e.request)));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const jobs = [self.registration.showNotification(d.title || 'Omställningsplatser', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: d.url || './' }, tag: d.url || undefined,
  })];
  if (typeof d.badge === 'number' && self.navigator.setAppBadge) jobs.push(d.badge ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge());
  e.waitUntil(Promise.all(jobs).catch(() => {}));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    for (const w of wins) { if ('focus' in w) { w.navigate(url).catch(() => {}); return w.focus(); } }
    return self.clients.openWindow(url);
  }));
});
