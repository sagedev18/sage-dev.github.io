/* StudyFlow service worker: keeps the app usable with no connection.
   Every request goes to the network first. That way an updated page never
   mixes with a cached script, which is how the app ends up half working. */

const VERSION = 'studyflow-v3';
const CACHE = `${VERSION}`;

// Only the offline page is pre-cached. Everything else is fetched when asked
// for, then kept as a fallback, so a fresh build is never shadowed by an old
// copy of a script.
const SHELL_URLS = ['/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the API. Stale study data would be misleading.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        // A page with no connection and nothing cached still gets something.
        if (request.mode === 'navigate') return caches.match('/offline.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});