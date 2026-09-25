const CACHE_NAME = 'gcd-chart-editor-v082fix';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/menu.css',
  './css/charter.css',
  './css/ImportChartMenu.css',
  './css/mobile.css',
  './css/StageEditor.css',
  './css/membresia.css',
  './js/membresia.js',
  './js/SisMiembros.js',
  './js/variables.js',
  './js/audio.js',
  './js/charter.js',
  './js/ImportChart.js',
  './js/archivador.js',
  './js/menu.js',
  './js/StageEditor.js',
  './Icons/GiraTuCel.png',
  './Icons/Credits.png',
  './Icons/Projects.png',
  './Icons/Config.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        if (response.ok && event.request.url.startsWith(self.location.origin)) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
