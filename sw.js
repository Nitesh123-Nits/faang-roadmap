/* FAANG Run 2027 service worker: precache app shell, runtime-cache fonts, offline fallback. */
const VERSION = "v19";
const SHELL = `faang-shell-${VERSION}`;
const RUNTIME = "faang-runtime";
const PRECACHE = [
  "./", "index.html", "pwa.js", "study.js", "code.js", "study.css", "study/index.json", "manifest.webmanifest",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
  "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
  "favicon.ico", "icons/favicon-32.png", "icons/favicon-16.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)));   // no skipWaiting: the page prompts the user
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("faang-shell-") && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts: stale-while-revalidate so type works offline after first load.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const hit = await cache.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") cache.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })());
    return;
  }

  if (url.origin !== location.origin) return;   // external study links: let the browser handle them

  // Navigations: network-first (fresh deploys), fall back to the cached shell offline.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) (await caches.open(SHELL)).put("index.html", r.clone());
        return r;
      } catch {
        return (await caches.match("index.html")) || (await caches.match("./"));
      }
    })());
    return;
  }

  // Same-origin static assets: cache-first, refresh in background.
  e.respondWith((async () => {
    const hit = await caches.match(req);
    const net = fetch(req, { cache: "no-cache" }).then(async r => { if (r.ok) (await caches.open(SHELL)).put(req, r.clone()); return r; }).catch(() => hit);
    // code files: prefer the network so a deploy shows up on the next load; fall back to cache offline
    return /\.(js|css)$/.test(url.pathname) ? (net.then(r => r || hit).catch(() => hit)) : (hit || net);
  })());
});
