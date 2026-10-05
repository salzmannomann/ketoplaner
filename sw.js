/* HamHam Keto – Service Worker für Offline-Betrieb und zuverlässige Updates.
   VERSION wird bei jedem Build (build-single.py) automatisch aktualisiert. */
const VERSION = "hamham-8e320cad";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-180.png",
  "./icon-512.png",
  "./icon.svg",
  // ASSETS-START (von build-single.py geschrieben: alle Dateien aus index.html mit ihrer ?v=-Version)
  "./styles.css?v=91b87ecd",
  "./foods.js?v=ab545b76",
  "./recipes.js?v=dab57413",
  "./vendor/jspdf.umd.min.js?v=5224faf1",
  "./vendor/jspdf.plugin.autotable.min.js?v=a416d9f9",
  "./app.js?v=cc010629",
  // ASSETS-END
];

// Beim Installieren alles vorladen, damit die App schon nach dem ersten Besuch offline läuft.
// Jede Datei einzeln: fehlt eine, werden die anderen trotzdem gespeichert.
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then((c) =>
    Promise.all(CORE.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})))));
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
        .then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); return r; })
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
            // Kopie sofort ziehen – später ist der Inhalt schon an die Seite gegangen und clone() schlägt fehl
            const cp = r.clone();
            caches.open(VERSION).then((c) => c.put(req, cp));
          }
          return r;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});

// Erinnerungen: Push-Nachricht anzeigen (iOS verlangt zu jeder Push-Nachricht eine sichtbare Mitteilung)
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "HamHam Keto", {
    body: d.body || "", tag: d.tag || undefined, renotify: true,
    icon: "icon-192.png", badge: "icon-192.png", data: { url: "./" },
  }));
});
// Tipp auf die Mitteilung öffnet die App (oder holt das offene Fenster nach vorne)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow ? self.clients.openWindow("./") : undefined;
  }));
});
