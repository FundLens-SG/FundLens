// FundLens service worker — v4
// Network-first for navigations (never trap users on a stale build), cache-first
// for same-origin static assets (real offline), versioned cache cleanup on
// activate. Cross-origin requests (CDN, the ckg-ai-proxy, Supabase, Drive) are
// passed straight through and never cached.
//
// IMPORTANT: redirected responses are never cached. Replaying a cached redirect
// for a navigation throws "redirect mode is not follow" and bricks the app —
// that was a prior production incident on a sibling tool. The !r.redirected
// guard below prevents it.

var CACHE = 'fundlens-v4';

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter(function (k) { return k !== CACHE; })
              .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

function cachePut(req, res) {
  if (res && res.ok && res.type === 'basic' && !res.redirected) {
    var copy = res.clone();
    caches.open(CACHE).then(function (ch) { try { ch.put(req, copy); } catch (e) {} });
  }
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Network-first for navigations / documents.
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req)
        .then(function (r) { cachePut(req, r); return r; })
        .catch(function () {
          return caches.match(req).then(function (m) {
            return m || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
          });
        })
    );
    return;
  }

  // Cache-first for same-origin static assets; populate on first fetch.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(function (m) {
        if (m) return m;
        return fetch(req)
          .then(function (r) { cachePut(req, r); return r; })
          .catch(function () { return m || Response.error(); });
      })
    );
    return;
  }

  // Cross-origin: pass through, no caching.
});
