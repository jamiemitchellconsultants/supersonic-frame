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
  event.respondWith(caches.match(event.request).then((hit) => hit ?? fetch(event.request)));
});
