const CACHE = "dhgarage-v14";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/db.js",
  "./js/pdf.js",
  "./js/app.js",
  "./vendor/jspdf.umd.min.js",
  "./vendor/html2canvas.min.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", (evt) => {
  evt.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evt) => {
  if (evt.request.method !== "GET") return;
  evt.respondWith(
    caches.match(evt.request).then((cached) => {
      if (cached) return cached;
      return fetch(evt.request).then((resp) => {
        if (resp.ok && evt.request.url.startsWith(self.location.origin)) {
          const copia = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(evt.request, copia));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
