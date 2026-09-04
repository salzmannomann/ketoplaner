/* HamHam Keto – Service Worker für Offline-Betrieb und zuverlässige Updates.
   VERSION wird bei jedem Build (build-single.py) automatisch aktualisiert. */
const VERSION = "hamham-ed63bd6f";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-180.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // HTML/Navigation: zuerst Netzwerk (frische Version), offline aus Cache
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => { caches.open(VERSION).then((c) => c.put(req, r.clone())); return r; })
        .catch(() => caches.match(req).then((m) => m || caches.match("./index.html")))
    );
    return;
  }

  // Sonstige GETs (eigene Assets + z. B. Google-Fonts): stale-while-revalidate
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((r) => {
          if (r && (r.status === 200 || r.type === "opaque")) {
            caches.open(VERSION).then((c) => c.put(req, r.clone()));
          }
          return r;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});
