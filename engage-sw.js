/* Engage — service-worker half. Loaded with importScripts() from each app's sw.js.
 * Reads the state mirrored by engage.js from the Cache API and shows the daily nudge
 * when the browser wakes us up (Periodic Background Sync, Android Chrome installed PWAs),
 * and handles taps on notifications. */
(function () {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const mins = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const STATE = () => new URL('./engage-state.json', self.registration.scope).href;

  async function readState() { const c = await caches.open('engage-state'); const r = await c.match(STATE()); return r ? r.json() : null; }
  async function writeState(s) { const c = await caches.open('engage-state'); await c.put(STATE(), new Response(JSON.stringify(s), { headers: { 'content-type': 'application/json' } })); }

  async function check() {
    const s = await readState(); if (!s || !s.enabled) return;
    const now = new Date(), k = iso(now), cur = now.getHours() * 60 + now.getMinutes();
    if (cur >= 23 * 60) return;                                   // quiet hours
    const xp = s.day === k ? s.todayXp : 0;                       // state older than today = nothing done yet
    if (xp >= s.goal) return;
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const alive = !!s.lastActive && (s.lastActive === k || s.lastActive === iso(y)) && s.streak > 0;
    const n = s.notified && s.notified.day === k ? s.notified : { day: k };
    let slot = null;
    if (!n.main && cur >= mins(s.time)) slot = 'main';
    else if (!n.last && cur >= mins(s.lastTime) && xp === 0 && alive) slot = 'last';
    if (!slot) return;
    n[slot] = true; if (slot === 'main' && cur >= mins(s.lastTime)) n.last = true;
    s.notified = n; await writeState(s);
    const m = slot === 'last' ? s.msgs.last : (alive ? s.msgs.mainStreak : s.msgs.mainFresh);
    await self.registration.showNotification(m.title, { body: m.body, icon: s.icon, badge: s.icon, tag: 'engage-daily', data: { url: s.url } });
  }

  self.addEventListener('periodicsync', (e) => { if (e.tag === 'engage-reminder') e.waitUntil(check()); });
  self.addEventListener('message', (e) => { if (e.data && e.data.type === 'ENGAGE_CHECK') e.waitUntil(check()); });
  self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow(url);
    }));
  });
})();
