const CACHE = "mkl-crm-v3";
const PRECACHE = [
  "/",
  "/icons/apple-touch-icon.png",
  "/icons/mkl-app-192.png",
  "/mkl-energies.png",
];

function shouldCache(request, url) {
  if (url.searchParams.has("_rsc")) return false;
  if (request.destination === "document" || request.destination === "script" || request.destination === "style" || request.destination === "font" || request.destination === "image") return true;
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response && response.ok && shouldCache(event.request, url)) {
        const cache = await caches.open(CACHE);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") {
        const home = await caches.match("/");
        if (home) return home;
      }
      return Response.error();
    }
  })());
});
