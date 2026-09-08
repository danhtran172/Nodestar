const CACHE = 'spread-shell-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch('/offline-assets.json');
        const assets = response.ok ? await response.json() : [];
        await cache.addAll([
          '/',
          '/manifest.webmanifest',
          '/favicon.svg',
          ...assets,
        ]);
      } catch {
        /* Online editing remains available if offline preparation is interrupted. */
      }
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('spread-shell-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('__') ||
    request.headers.has('RSC')
  )
    return;
  if (
    request.mode !== 'navigate' &&
    !/\.(js|css|svg|woff2|webmanifest)$/.test(url.pathname)
  )
    return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && !response.redirected) {
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(CACHE)
              .then((cache) => cache.put(request, copy))
              .catch(() => {}),
          );
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(
          'SPREAD is offline. Open it once online to prepare this device.',
          { status: 503, headers: { 'Content-Type': 'text/plain' } },
        );
      }),
  );
});
