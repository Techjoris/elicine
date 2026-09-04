const CACHE_NAME = 'elicine-pwa-v2';
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

  // Ignorer les requetes non HTTP(S) et les requetes internes/dev
  if (!url.protocol.startsWith('http')) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/@') || url.pathname.includes('node_modules')) {
    return;
  }

  // Pour les requetes de navigation (HTML), essayer le reseau d'abord, puis le cache racine
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
    return;
  }

  // Pour les autres assets (images, statiques connus), servir depuis le cache puis reseau
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});

