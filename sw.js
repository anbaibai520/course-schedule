const CACHE = 'course-schedule-v2';
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

function offline() {
  return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const key = resolveCacheKey(e.request.url);
  if (!key) return; // 非核心资源：直接走网络（Supabase/天气等）

  /* 页面（目录入口 / index.html）：网络优先。
     旧策略是「有缓存先返回缓存」，导致打开看到的永远是旧版、必须二次刷新才更新。
     改为网络优先后：联网时打开即最新，断网才回落到缓存，仍可离线使用。 */
  if (key === INDEX) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const r = await fetch(e.request);
        if (r.ok) await cache.put(key, r.clone());
        return r;
      } catch (err) {
        return (await cache.match(key)) || offline();
      }
    })());
    return;
  }

  /* 图标、manifest 等静态资源：内容基本不变，缓存优先省流量 */
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    if (cached) return cached;
    try {
      const r = await fetch(e.request);
      if (r.ok) await cache.put(key, r.clone());
      return r;
    } catch (err) {
      return offline();
    }
  })());
});
