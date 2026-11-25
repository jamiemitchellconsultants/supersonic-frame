// supersonic-frame offline cache (ADR 0013 in Grooveloom): one cache per build of a
// protocol version, complete before the page reports ready, replaced atomically.
// The build stamps BUILD, so a changed frame installs a new worker.
const BUILD = "dev";
const CACHE = `frame-v1-${BUILD}`;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    // "reload" skips the HTTP cache, which may still hold the previous build's files.
    const fresh = (path) => new Request(path, { cache: "reload" });
    const list = await (await fetch(fresh("precache.json"))).json();
    const cache = await caches.open(CACHE);
    await cache.addAll(list.map(fresh));
    // No skipWaiting: a new build takes over once open frames close, never under one.
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
    // Only this build's cache: a newer build may already be waiting with its own.
    const cache = await caches.open(CACHE);
    const hit = await cache.match(event.request);
    if (hit) return hit;
    // A navigation to the pinned root (…/v1/) is the precached "./" document, not a
    // file of its own: serve it (or index.html) so an offline start never depends on
    // the browser's HTTP cache, which expires minutes after the first load.
    if (event.request.mode === "navigate")
      return (await cache.match("./")) ?? (await cache.match("index.html")) ?? fetch(event.request);
    return fetch(event.request);
  })());
});
