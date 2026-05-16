/* eslint-disable no-restricted-globals */
const VERSION = "m-realtime-v1";
const STATIC_CACHE = `static-${VERSION}`;
const API_CACHE = `api-${VERSION}`;
const TILE_CACHE = `tiles-${VERSION}`;

// Pre-cache shell on install
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      try {
        await cache.addAll(["/", "/manifest.webmanifest", "/favicon.ico", "/poi/m-logo.png"]);
      } catch {}
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => ![STATIC_CACHE, API_CACHE, TILE_CACHE].includes(k))
            .map((k) => caches.delete(k))
      );
      self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // CartoDB raster tiles → cache-first
  if (url.host.endsWith("basemaps.cartocdn.com")) {
    event.respondWith(staleWhileRevalidate(TILE_CACHE, req));
    return;
  }

  if (url.origin === self.location.origin) {
    // Static GTFS-like data — long cache, stale-while-revalidate
    if (
      url.pathname === "/api/routes" ||
      url.pathname.startsWith("/api/line/") ||
      url.pathname.startsWith("/api/stops/") ||
      url.pathname === "/api/all-stops" ||
      url.pathname.startsWith("/api/poi") ||
      url.pathname === "/api/parkings"
    ) {
      event.respondWith(staleWhileRevalidate(API_CACHE, req));
      return;
    }
    // Real-time endpoints — network-first, fall back to cache so the UI keeps last-known data
    if (
      url.pathname.startsWith("/api/vehicles/") ||
      url.pathname.startsWith("/api/stoptimes/") ||
      url.pathname === "/api/disruptions"
    ) {
      event.respondWith(networkFirst(API_CACHE, req));
      return;
    }
    // App shell HTML / JS / CSS
    if (req.mode === "navigate") {
      event.respondWith(networkFirst(STATIC_CACHE, req));
      return;
    }
  }
});

async function staleWhileRevalidate(cacheName, req) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await network) || new Response("", { status: 504 });
}

async function networkFirst(cacheName, req) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response("", { status: 504 });
  }
}
