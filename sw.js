const CACHE_NAME = 'gcd-chart-editor-v085c';
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
  './css/EventUpdate.css',
  './css/NoteEvents.css',
  './js/variables.js',
  './js/audio.js',
  './js/charter.js',
  './js/EditorAcciones.js',
  './js/EasingGCD.js',
  './js/EventosGCD.js',
  './js/AnimateAtlas.js',
  './js/VisualizarPersonajes.js',
  './js/Variaciones.js',
  './js/NoteEvents.js',
  './js/ImportarEventos.js',
  './js/ModoLibre.js',
  './js/CharteoRapido.js',
  './js/SeleccionDistancia.js',
  './js/Tema.js',
  './js/PantallaCompleta.js',
  './css/TemaClaro.css',
  './css/CharteoRapido.css',
  './js/PilaNotas.js',
  './js/ImportChart.js',
  './js/archivador.js',
  './js/menu.js',
  './js/StageEditor.js',
  './Icons/GiraTuCel.png',
  './Icons/Credits.png',
  './Icons/Projects.png',
  './Icons/Config.png',
  './icon-192.png',
  './icon-48.png',
  './icon-96.png',
  './apple-touch-icon.png',
  './favicon.ico',
  './icon-512.png'
];

// V0.8.2: fotos de Créditos, la marca de Evento de Notas e íconos de Events. Se cachean aparte y
// de forma tolerante: si alguna falta en el servidor, el service worker se
// instala igual.
const OPTIONAL_ASSETS = [
  './Credits/GamerCB.png',
  './Credits/Edwin.png',
  './Credits/Jeyzel.png',
  './Credits/Deyrox.png',
  './noteassets/EventNote.png',
  './eventassets/Default.png',
  './eventassets/FocusCamera.png',
  './eventassets/PlayAnimation.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS)
        .then(() => Promise.allSettled(OPTIONAL_ASSETS.map((url) => cache.add(url)))))
      .then(() => self.skipWaiting())
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
