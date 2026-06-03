// Service Worker — BeanScan
// Sessions 1-5: no caching — always fetch from network so JS updates
// land on devices immediately without needing a cache version bump.
// Session 6 will introduce proper offline caching with a versioned strategy.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  // Clear any leftover caches from earlier experiments
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Pass every request straight to the network — no caching until Session 6
  event.respondWith(fetch(event.request));
});
