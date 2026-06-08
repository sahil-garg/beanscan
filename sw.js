// Service Worker — BeanScan v2
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
  // cache:'reload' bypasses the browser's HTTP disk cache and always goes to
  // the network. This ensures JS updates reach the device immediately.
  // (Only applies to same-origin requests; external CDN calls pass through.)
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    event.respondWith(fetch(req, { cache: 'reload' }));
  }
  // Cross-origin requests (Tesseract CDN, etc.) fall through to the browser.
});
