// ============================================================
//  AYURVEDALAYA ATTENDANCE — Service Worker
//  Caches all app files for full offline use.
//  Version: 1.0
// ============================================================

const CACHE_NAME = 'ayurvedalaya-v1';
const ASSETS = [
  './',
  './index.html',
  './manager.html',
  './app.js',
  './manager.js',
  './db.js',
  './bs.js',
  './sync.js',
  './style.css',
  './manifest.json',
];

// Install — cache all assets
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — serve from cache, fall back to network
self.addEventListener('fetch', function(e) {
  // For Google Apps Script API calls — network only, no caching
  if (e.request.url.includes('script.google.com')) {
    e.respondWith(fetch(e.request).catch(function() {
      return new Response(JSON.stringify({ success: false, offline: true }),
        { headers: { 'Content-Type': 'application/json' } });
    }));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(response) {
        // Cache new resources dynamically
        return caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, response.clone());
          return response;
        });
      }).catch(function() {
        return cached;
      });
    })
  );
});

// Background sync — triggered when online after offline period
self.addEventListener('sync', function(e) {
  if (e.tag === 'sync-attendance') {
    e.waitUntil(syncPendingRecords());
  }
});

// Message from app to trigger sync
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SYNC_NOW') {
    syncPendingRecords();
  }
});

async function syncPendingRecords() {
  // Notify all open clients to run sync
  const clients = await self.clients.matchAll();
  clients.forEach(function(client) {
    client.postMessage({ type: 'DO_SYNC' });
  });
}
