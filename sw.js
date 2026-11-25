// supersonic-frame offline cache (ADR 0013 in Grooveloom): one cache per protocol
// version, complete before the page reports ready, replaced atomically.
const CACHE = "frame-v1";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const list = await (await fetch("precache.json")).json();
    const cache = await caches.open(CACHE);
    await cache.addAll(list);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys())
      if (key.startsWith("frame-v") && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const hit = await caches.match(event.request);
    if (hit) return hit;
    // A navigation to the pinned root (…/v1/) is the precached "./" document, not a
    // file of its own: serve it (or index.html) so an offline start never depends on
    // the browser's HTTP cache, which expires minutes after the first load.
    if (event.request.mode === "navigate")
      return (await caches.match("./")) ?? (await caches.match("index.html")) ?? fetch(event.request);
    return fetch(event.request);
  })());
});
