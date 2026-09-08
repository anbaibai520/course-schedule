const CACHE = 'course-schedule-v1';
const ASSETS = [
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

function toAbsolute(rel) {
  return new URL(rel, self.location.href).href;
}

const CORE = new Set(ASSETS.map(toAbsolute));
const INDEX = toAbsolute('./index.html');

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(
        ASSETS.map(asset =>
          fetch(asset)
            .then(r => r.ok ? cache.put(toAbsolute(asset), r.clone()) : null)
            .catch(() => null)
        )
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function resolveCacheKey(url) {
  const u = new URL(url);
  if (u.origin !== location.origin) return null;
  // 目录入口统一映射到 index.html
  if (u.pathname.endsWith('/') || u.href === location.href) return INDEX;
  if (CORE.has(u.href)) return u.href;
  return null;
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const key = resolveCacheKey(e.request.url);
  if (!key) return; // 非核心资源：直接走网络（Supabase/天气等）

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(key);
      const network = fetch(e.request)
        .then(async r => {
          if (r.ok) await cache.put(key, r.clone());
          return r;
        })
        .catch(() => null);
      if (cached) return cached;
      return await network || cache.match(INDEX).then(r => r || new Response('Offline', { status: 503, statusText: 'Service Unavailable' }));
    })
  );
});
