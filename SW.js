// sw.js - simple but robust service worker for Core PWA
const CACHE_NAME = 'core-static-v1';
const RUNTIME_CACHE = 'core-runtime-v1';
const OFFLINE_FALLBACK = '/index.html';

const PRECACHE_URLS = [
  '/',                // HTML entry
  '/index.html',      // app shell
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install -> cache app shell
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
  );
});

// Activate -> cleanup old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME && key !== RUNTIME_CACHE) {
          return caches.delete(key);
        }
      })
    )).then(() => self.clients.claim())
  );
});

// Fetch -> route requests
self.addEventListener('fetch', event => {
  const request = event.request;

  // Navigation requests: network-first, fallback to cache, then fallback page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          // Put a copy in runtime cache
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match(OFFLINE_FALLBACK)))
    );
    return;
  }

  // For same-origin static assets: cache-first
  if (request.method === 'GET' && request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          // only cache valid responses
          if (!response || response.status !== 200 || response.type !== 'basic') return response;
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, responseClone));
          return response;
        }).catch(() => {
          // optional: return a placeholder image for image requests
          if (request.destination === 'image') {
            // return a 1x1 transparent GIF data URI response as minimal fallback
            return fetch('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');
          }
        });
      })
    );
    return;
  }

  // Default: try network, fallback to cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});