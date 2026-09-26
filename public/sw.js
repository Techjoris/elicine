// v5 : rafraîchir aussi la page d'accueil hors ligne après la correction du défilement.
const CACHE_NAME = 'elicine-pwa-v5';
const ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Laisser le navigateur charger directement les affiches TMDB, les polices,
  // les API et les bundles versionnés. Le cache PWA ne contient que ASSETS.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/@') || url.pathname.includes('node_modules')) return;

  // Pour les requetes de navigation (HTML), essayer le reseau d'abord, puis le cache racine
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
    return;
  }

  if (!ASSETS.includes(url.pathname)) return;

  // Servir seulement les quelques fichiers effectivement précachés.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
