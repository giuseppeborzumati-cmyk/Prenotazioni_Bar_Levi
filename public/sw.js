// Cache only the public offline notice. Never cache orders, identity, API calls,
// payment responses or navigations containing order identifiers in query strings.
const CACHE = "intervallo-offline-v1";
const OFFLINE = new URL("offline.html", self.registration.scope).href;
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("intervallo-offline-") && key !== CACHE)
          await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    event.request.mode !== "navigate"
  )
    return;
  event.respondWith(
    fetch(event.request).catch(
      async () => (await caches.match(OFFLINE)) || Response.error(),
    ),
  );
});
