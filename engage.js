/* Engage — Duolingo-style daily habit layer for static PWAs.
 * Streak, daily XP goal, streak freezes, levels, in-app nudges and local notifications.
 * No server: state lives in localStorage; the service-worker half (engage-sw.js) reads a
 * mirrored copy from the Cache API so it can nudge you even when the app is closed
 * (Android Chrome installed PWAs via Periodic Background Sync, best effort).
 *
 *   Engage.init({ key, app, url, icon, nextUp, mountChip })
 *   Engage.log(kind, xp, uniqueId, label)   // award XP once per uniqueId
 *   Engage.watch(seconds)                   // 1 XP per 30 s of watching, capped per day
 */
(function () {
  'use strict';
  if (window.Engage) return;

  const DEFAULTS = { goal: 30, remind: true, time: '20:00', last: '21:45', notify: false };
  const GOALS = [[20, 'Casual'], [30, 'Regular'], [50, 'Serious'], [80, 'Intense']];
  const TITLES = ['Intern', 'Junior', 'SDE-1', 'SDE-2', 'Senior', 'Staff', 'Principal', 'Distinguished', 'Fellow'];
  const QUIET_AFTER = 23 * 60;           // never nudge after 23:00
  const WATCH_CAP = 60;                  // max XP per day from watching
  const FLAME = '<path d="M12 22c4 0 7-2.7 7-7 0-4.8-4-7.5-5-11-2 2-3 4-3 6-1-1-2-2-2-4-2 2-4 5-4 9 0 4.3 3 7 7 7z"/>';

  let C = {}, S = null, chip = null, overlay = null, banner = null, timer = 0, lastFocus = null;
  const clock = { now: () => new Date() };

  /* ───────── tiny helpers */
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromIso = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = fromIso(k); d.setDate(d.getDate() + n); return iso(d); };
  const todayKey = () => iso(clock.now());
  const mins = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch { return u; } };
  const day = (k) => S.days[k] || (S.days[k] = { xp: 0, n: 0 });   // write path only
  const xpOf = (k) => (S.days[k] && S.days[k].xp) || 0;
  const perm = () => ('Notification' in window ? Notification.permission : 'unsupported');
  const flame = (cls) => `<svg class="eg-fl ${cls || ''}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">${FLAME}</svg>`;

  /* ───────── persistence */
  function load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(C.key) || '{}') || {}; } catch { /* corrupt → start over */ }
    S = Object.assign({ days: {}, total: 0, best: 0, freezes: 0, frozen: [], awarded: [], awardedStreak: 0, watchRem: 0, notified: {} }, saved);
    S.set = Object.assign({}, DEFAULTS, saved.set || {});
  }
  function save() {
    try { localStorage.setItem(C.key, JSON.stringify(S)); } catch { /* storage full or blocked */ }
    syncSW(); paint();
  }

  /* ───────── streak engine */
  const isActive = (k) => !!(S.days[k] && S.days[k].xp > 0);
  const isFrozen = (k) => S.frozen.includes(k);
  function streak() {
    let n = 0, k = todayKey();
    if (isActive(k)) n++;
    for (k = addDays(k, -1); ; k = addDays(k, -1)) {
      if (isActive(k)) n++;
      else if (isFrozen(k)) continue;
      else break;
    }
    return n;
  }
  function lastActive() {                     // latest day that keeps the streak alive
    const all = Object.keys(S.days).filter(isActive).concat(S.frozen).sort();
    return all.length ? all[all.length - 1] : '';
  }
  // Missed days since the last activity are bridged with streak freezes, or the streak ends.
  function settle() {
    const la = lastActive(), yest = addDays(todayKey(), -1);
    if (!la || la >= yest) return;
    const missed = []; for (let k = addDays(la, 1); k <= yest; k = addDays(k, 1)) missed.push(k);
    if (missed.length && S.freezes >= missed.length) {
      S.freezes -= missed.length; S.frozen.push(...missed);
      S.frozen = S.frozen.slice(-60);
      S.usedFreeze = missed.length;
    }
  }
  function earnFreeze(s) {
    if (s < S.awardedStreak) S.awardedStreak = 0;
    if (s > 0 && s % 7 === 0 && S.awardedStreak !== s) { S.awardedStreak = s; if (S.freezes < 2) { S.freezes++; return true; } }
    return false;
  }
  const level = () => 1 + Math.floor(S.total / 100);
  const levelTitle = () => TITLES[Math.min(TITLES.length - 1, level() - 1)];

  /* ───────── XP */
  function log(kind, xp, id, label, opts) {
    if (!S) return false;
    xp = Math.round(xp); if (!(xp > 0)) return false;
    if (id) {
      if (S.awarded.includes(id)) return false;
      S.awarded.push(id); if (S.awarded.length > 4000) S.awarded.splice(0, S.awarded.length - 4000);
    }
    const k = todayKey(), d = day(k), before = d.xp, streakBefore = streak();
    d.xp += xp; d.n = (d.n || 0) + 1; S.total += xp;
    const s = streak(); if (s > S.best) S.best = s;
    const gotFreeze = earnFreeze(s);
    S.notified = S.notified && S.notified.day === k ? S.notified : { day: k };
    save();
    const goalHit = before < S.set.goal && d.xp >= S.set.goal;
    if (goalHit) celebrate(s, gotFreeze);
    else if (s > streakBefore && s > 1) toast(`Streak extended: ${s} days`);
    else if (!(opts && opts.quiet)) toast(`+${xp} XP${label ? ' · ' + label : ''}`);
    if (goalHit || before === 0) hideBanner();
    return true;
  }
  function watch(seconds) {
    if (!S || !(seconds > 0)) return;
    S.watchRem += Math.min(seconds, 60);
    const xp = Math.floor(S.watchRem / 30); if (!xp) return;
    S.watchRem -= xp * 30;
    const d = day(todayKey()); d.w = d.w || 0;
    if (d.w >= WATCH_CAP) return;
    const give = Math.min(xp, WATCH_CAP - d.w); d.w += give;
    log('watch', give, null, '', { quiet: true });
  }

  /* ───────── next-up + messages */
  function nextUp() { try { return C.nextUp ? C.nextUp() : null; } catch { return null; } }
  function messages() {
    const n = streak(), nx = nextUp(), tail = nx ? ` Next up: ${nx.text}.` : '';
    const dn = Math.floor(clock.now() / 864e5), app = C.app || 'the app';
    const pick = (a) => a[dn % a.length];
    return {
      mainStreak: { title: pick([`Your ${n}-day streak is waiting`, `Don't break your ${n}-day streak`, `${n} days strong. Keep it going`, `Quick session to protect ${n} days`]), body: `${pick(['Five minutes is enough.', 'One article or one video does it.', 'Small reps, every day.', 'Do it now, enjoy the evening.'])}${tail}` },
      mainFresh: { title: pick([`Start a streak today`, `Ten minutes for your future self`, `Daily reps beat weekend cramming`, `${app} misses you`]), body: `Your goal today is ${S.set.goal} XP.${tail}` },
      last: { title: `Last call: ${n}-day streak ends at midnight`, body: `One article or one short video saves it.${tail}` },
    };
  }

  /* ───────── notifications */
  const stateUrl = () => new URL('./engage-state.json', document.baseURI).href;
  async function syncSW() {
    if (!S || !('caches' in window)) return;
    try {
      const k = todayKey(), c = await caches.open('engage-state');
      await c.put(stateUrl(), new Response(JSON.stringify({
        enabled: !!(S.set.remind && S.set.notify), time: S.set.time, lastTime: S.set.last, goal: S.set.goal,
        day: k, todayXp: xpOf(k), streak: streak(), lastActive: lastActive(), notified: S.notified,
        msgs: messages(), icon: abs(C.icon), url: C.url,
      }), { headers: { 'content-type': 'application/json' } }));
    } catch { /* cache unavailable */ }
  }
  async function pullSW() {                    // the SW may have nudged while the app was closed
    if (!('caches' in window)) return;
    try {
      const r = await (await caches.open('engage-state')).match(stateUrl()); if (!r) return;
      const st = await r.json(), k = todayKey();
      if (st.notified && st.notified.day === k) S.notified = Object.assign({ day: k }, S.notified && S.notified.day === k ? S.notified : {}, st.notified);
    } catch { /* ignore */ }
  }
  async function swReg() { try { return ('serviceWorker' in navigator) ? await navigator.serviceWorker.getRegistration() : null; } catch { return null; } }
  async function registerPeriodic() {
    try {
      const reg = await swReg(); if (!reg || !reg.periodicSync) return;
      if (S.set.remind && S.set.notify) await reg.periodicSync.register('engage-reminder', { minInterval: 3 * 3600e3 });
      else await reg.periodicSync.unregister('engage-reminder');
    } catch { /* unsupported or not allowed */ }
  }
  function due() {
    const s = S.set; if (!s.remind || !s.notify || perm() !== 'granted') return null;
    const now = clock.now(), cur = now.getHours() * 60 + now.getMinutes(), k = iso(now), xp = xpOf(k);
    if (xp >= s.goal || cur >= QUIET_AFTER) return null;
    if (!S.notified || S.notified.day !== k) S.notified = { day: k };
    if (!S.notified.main && cur >= mins(s.time)) return 'main';
    if (!S.notified.last && cur >= mins(s.last) && xp === 0 && streak() > 0) return 'last';
    return null;
  }
  async function showNote(slot) {
    const m = messages(), msg = slot === 'last' ? m.last : (streak() > 0 ? m.mainStreak : m.mainFresh);
    const opts = { body: msg.body, icon: abs(C.icon), badge: abs(C.icon), tag: 'engage-daily', data: { url: C.url } };
    const reg = await swReg();
    if (reg && reg.showNotification) await reg.showNotification(msg.title, opts);
    else new Notification(msg.title, opts);
  }
  async function check() {
    if (!S) return;
    await pullSW();
    const slot = due(); if (!slot) return;
    const cur = clock.now().getHours() * 60 + clock.now().getMinutes();
    S.notified[slot] = true; if (slot === 'main' && cur >= mins(S.set.last)) S.notified.last = true;
    save();
    try { await showNote(slot); } catch { /* blocked */ }
  }
  function schedule() {
    clearTimeout(timer);
    if (!S || !S.set.remind) return;
    const now = clock.now(), cur = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const next = [mins(S.set.time), mins(S.set.last)].filter((m) => m > cur).sort((a, b) => a - b)[0];
    const waitMin = next != null ? next - cur : (24 * 60 - cur) + mins(S.set.time);
    timer = setTimeout(() => { settle(); check(); paint(); schedule(); }, Math.min(waitMin * 60e3, 3600e3) + 1500);
  }
  async function enableNotifications() {
    if (perm() === 'unsupported') return toast('This browser does not support notifications');
    const p = perm() === 'granted' ? 'granted' : await Notification.requestPermission();
    S.set.notify = p === 'granted';
    save(); registerPeriodic(); schedule(); render();
    toast(p === 'granted' ? 'Reminders on' : 'Notifications are blocked in browser settings');
  }
  function downloadIcs() {
    const t = S.set.time.replace(':', '') + '00', start = todayKey().replace(/-/g, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Engage//Daily habit//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:engage-${(C.app || 'app').replace(/\W/g, '').toLowerCase()}@local`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART:${start}T${t}`, 'DURATION:PT15M', 'RRULE:FREQ=DAILY', `SUMMARY:${C.app || 'Study'} · keep your streak`,
      `DESCRIPTION:Your daily ${C.app || 'study'} session. ${C.url}`, `URL:${C.url}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Keep your streak alive', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
    a.download = `${(C.app || 'app').replace(/\W/g, '').toLowerCase()}-daily-reminder.ics`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Open the file to add a daily calendar reminder');
  }

  /* ───────── UI: styles */
  const CSS = `
.eg{--eg-bg:var(--s1,var(--surface,#fff));--eg-bg2:var(--s2,var(--surface-2,#f1f1f1));--eg-fg:var(--text,var(--fg,#111));--eg-dim:var(--dim,var(--muted,#777));--eg-line:var(--line,#ddd);--eg-ac:var(--accent,#d98a00);--eg-ink:var(--accent-ink,var(--bg,#fff));--eg-ok:#2e9d5b;font-family:inherit;color:var(--eg-fg)}
.eg *{box-sizing:border-box}
.eg-fl{width:20px;height:20px;flex:none}
.eg-chip{display:inline-flex;align-items:center;gap:5px;height:36px;padding:0 11px;border-radius:999px;border:1px solid var(--eg-line);background:var(--eg-bg);color:var(--eg-dim);font:600 13px/1 var(--f-mono,ui-monospace,monospace);cursor:pointer;position:relative}
.eg-chip:hover{background:var(--eg-bg2)}
.eg-chip.on{color:var(--eg-ac);border-color:var(--eg-ac)}
.eg-chip.risk::after{content:"";position:absolute;top:3px;right:3px;width:8px;height:8px;border-radius:50%;background:#e5484d}
.eg-chip .eg-fl{width:17px;height:17px}
.eg-chip:not(.on) .eg-fl{fill:none}
.eg-ov{position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center}
.eg-panel{width:min(520px,100%);max-height:92vh;overflow:auto;background:var(--eg-bg);border:1px solid var(--eg-line);border-radius:18px 18px 0 0;padding:18px 18px calc(22px + env(safe-area-inset-bottom,0px));position:relative;animation:eg-up .22s ease-out}
@media(min-width:640px){.eg-ov{align-items:center}.eg-panel{border-radius:18px}}
@keyframes eg-up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
.eg-x{position:absolute;top:10px;right:10px;width:34px;height:34px;border-radius:10px;border:0;background:transparent;color:var(--eg-dim);font-size:22px;cursor:pointer}
.eg-x:hover{background:var(--eg-bg2)}
.eg-hd{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.eg-hd .eg-fl{width:44px;height:44px;color:var(--eg-dim)}.eg-hd .eg-fl.on{color:var(--eg-ac)}
.eg-hd b{font-size:30px;line-height:1}.eg-hd span{display:block;color:var(--eg-dim);font-size:13px;margin-top:3px}
.eg-goal{display:flex;align-items:center;gap:14px;padding:12px;border:1px solid var(--eg-line);border-radius:14px;background:var(--eg-bg2)}
.eg-goal svg{width:64px;height:64px;flex:none}
.eg-goal .t{font-weight:600}.eg-goal .s{color:var(--eg-dim);font-size:13px;margin-top:2px}
.eg-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}
.eg-tiles div{padding:10px;border:1px solid var(--eg-line);border-radius:12px;text-align:center}
.eg-tiles b{display:block;font-size:15px}.eg-tiles span{font-size:11px;color:var(--eg-dim)}
.eg-h{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--eg-dim);margin:16px 0 8px}
.eg-heat{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
.eg-heat i{aspect-ratio:1;border-radius:6px;background:var(--eg-bg2);display:grid;place-items:center;font-style:normal;font-size:10px;color:var(--eg-dim)}
.eg-heat i.l1{background:color-mix(in srgb,var(--eg-ac) 30%,var(--eg-bg2))}
.eg-heat i.l2{background:color-mix(in srgb,var(--eg-ac) 60%,var(--eg-bg2))}
.eg-heat i.l3{background:var(--eg-ac);color:var(--eg-ink)}
.eg-heat i.fz{background:color-mix(in srgb,#4aa8ff 35%,var(--eg-bg2))}
.eg-heat i.td{outline:2px solid var(--eg-fg);outline-offset:1px}
.eg-heat i.fu{opacity:.35}
.eg-heat .dn{background:none;font-size:10px;aspect-ratio:auto}
.eg-next{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:12px;border:1px solid var(--eg-line);border-radius:12px;background:var(--eg-bg);color:inherit;font:inherit;cursor:pointer}
.eg-next:hover{border-color:var(--eg-ac)}.eg-next small{display:block;color:var(--eg-dim);font-size:11px}.eg-next b{font-weight:600;font-size:14px}
.eg-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid var(--eg-line);font-size:14px}
.eg-row:first-of-type{border-top:0}.eg-row small{display:block;color:var(--eg-dim);font-size:12px}
.eg-seg{display:flex;gap:6px;flex-wrap:wrap}
.eg-seg button,.eg-btn{font-weight:600;font-size:13px;font-family:inherit;padding:7px 12px;border-radius:999px;border:1px solid var(--eg-line);background:var(--eg-bg);color:var(--eg-fg);cursor:pointer}
.eg-seg button[aria-pressed=true]{background:var(--eg-ac);color:var(--eg-ink);border-color:var(--eg-ac)}
.eg-btn.pri{background:var(--eg-ac);color:var(--eg-ink);border-color:var(--eg-ac)}
.eg-btn:hover{border-color:var(--eg-ac)}
.eg-sw{appearance:none;width:42px;height:24px;border-radius:12px;background:var(--eg-line);position:relative;cursor:pointer;border:0;flex:none}
.eg-sw::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .15s}
.eg-sw:checked{background:var(--eg-ac)}.eg-sw:checked::after{transform:translateX(18px)}
.eg input[type=time]{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid var(--eg-line);background:var(--eg-bg);color:var(--eg-fg)}
.eg-note{font-size:12px;color:var(--eg-dim);line-height:1.5;margin-top:8px}
.eg-toast{position:fixed;left:50%;bottom:calc(88px + env(safe-area-inset-bottom,0px));transform:translate(-50%,12px);z-index:320;background:var(--eg-fg);color:var(--eg-bg);padding:9px 14px;border-radius:12px;font-weight:600;font-size:13px;line-height:1.3;font-family:inherit;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;max-width:90vw;text-align:center}
.eg-toast.show{opacity:1;transform:translate(-50%,0)}
.eg-toast.big{padding:14px 20px;font-size:15px;background:var(--eg-ac);color:var(--eg-ink)}
.eg-banner{position:fixed;left:50%;top:calc(var(--top,0px) + 10px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:90;width:min(560px,calc(100vw - 20px));display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;border:1px solid var(--eg-ac);background:var(--eg-bg);box-shadow:0 6px 24px rgba(0,0,0,.25);animation:eg-up .25s ease-out}
.eg-banner .eg-fl{color:var(--eg-ac);width:26px;height:26px}
.eg-banner p{margin:0;flex:1;font-size:13px;line-height:1.35}.eg-banner p b{display:block}
.eg-banner button{font-weight:600;font-size:12px;font-family:inherit;padding:7px 11px;border-radius:999px;border:1px solid var(--eg-line);background:var(--eg-bg);color:var(--eg-fg);cursor:pointer}
.eg-banner button.pri{background:var(--eg-ac);color:var(--eg-ink);border-color:var(--eg-ac)}
.eg-conf{position:fixed;left:50%;top:38%;width:8px;height:12px;z-index:330;pointer-events:none;animation:eg-conf 1.3s ease-out forwards}
@keyframes eg-conf{to{transform:translate(var(--x),var(--y)) rotate(var(--r));opacity:0}}
@media(prefers-reduced-motion:reduce){.eg-panel,.eg-banner{animation:none}.eg-conf{display:none}}`;

  /* ───────── UI: pieces */
  let toastEl, toastTimer;
  function toast(msg, big) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'eg eg-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.toggle('big', !!big); toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), big ? 3200 : 2200);
  }
  function celebrate(s, freeze) {
    toast(`Daily goal complete! ${s > 0 ? s + '-day streak' : ''}${freeze ? ' · +1 streak freeze' : ''}`.trim(), true);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['var(--eg-ac,#d98a00)', '#2e9d5b', '#4aa8ff', '#e5484d', '#8e4ec6'];
    for (let i = 0; i < 26; i++) {
      const p = document.createElement('i'); p.className = 'eg eg-conf';
      p.style.cssText = `background:${colors[i % colors.length]};--x:${Math.round((Math.random() - .5) * 360)}px;--y:${Math.round(120 + Math.random() * 220)}px;--r:${Math.round(Math.random() * 720 - 360)}deg;animation-delay:${Math.round(Math.random() * 120)}ms`;
      document.body.appendChild(p); setTimeout(() => p.remove(), 1600);
    }
  }
  function paint() {
    if (!chip || !S) return;
    const s = streak(), done = xpOf(todayKey()) >= S.set.goal, risk = s > 0 && xpOf(todayKey()) === 0;
    chip.classList.toggle('on', xpOf(todayKey()) > 0);
    chip.classList.toggle('risk', risk && clock.now().getHours() >= 12);
    chip.innerHTML = `${flame()}<span>${s}</span>`;
    chip.setAttribute('aria-label', `${s} day streak. ${done ? 'Daily goal complete.' : xpOf(todayKey()) + ' of ' + S.set.goal + ' XP today.'} Open streak and reminders`);
    if (overlay) render();
  }
  function hideBanner() { if (banner) { banner.remove(); banner = null; } }
  function maybeBanner() {
    try { if (sessionStorage.getItem(C.key + ':bn') === '1') return; } catch { /* private mode */ }
    if (!S.set.remind || banner) return;
    const now = clock.now(), cur = now.getHours() * 60 + now.getMinutes(), xp = xpOf(todayKey()), s = streak();
    if (xp >= S.set.goal || (cur < mins(S.set.time) && !(s > 0 && xp === 0))) return;
    if (cur >= QUIET_AFTER) return;
    const m = messages(), msg = s > 0 ? (xp === 0 && cur >= mins(S.set.last) ? m.last : m.mainStreak) : m.mainFresh, nx = nextUp();
    banner = document.createElement('div'); banner.className = 'eg eg-banner'; banner.setAttribute('role', 'region'); banner.setAttribute('aria-label', 'Daily reminder');
    banner.innerHTML = `${flame('on')}<p><b>${esc(msg.title)}</b>${esc(msg.body)}</p>${nx ? '<button class="pri" data-a="go">Start</button>' : ''}<button data-a="later" aria-label="Dismiss reminder">Later</button>`;
    banner.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      try { sessionStorage.setItem(C.key + ':bn', '1'); } catch { /* ignore */ }
      hideBanner(); if (a.dataset.a === 'go') goNext(nx);
    });
    document.body.appendChild(banner);
  }
  function goNext(nx) {
    if (!nx) return;
    closeSheet();
    if (nx.go) nx.go(); else if (nx.href) { if (/^https?:/.test(nx.href)) window.open(nx.href, '_blank', 'noopener'); else location.hash = nx.href.replace(/^#?/, '#'); }
  }

  /* ───────── UI: sheet */
  function heat() {
    const t = todayKey(), td = fromIso(t), mon = new Date(td); mon.setDate(td.getDate() - ((td.getDay() + 6) % 7) - 28);
    let h = 'MTWTFSS'.split('').map((c) => `<i class="dn">${c}</i>`).join('');
    for (let i = 0; i < 35; i++) {
      const k = iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)), xp = (S.days[k] || {}).xp || 0;
      const l = xp >= S.set.goal ? 'l3' : xp >= S.set.goal / 2 ? 'l2' : xp > 0 ? 'l1' : '';
      h += `<i class="${l}${isFrozen(k) && !xp ? ' fz' : ''}${k === t ? ' td' : ''}${k > t ? ' fu' : ''}" title="${k}${xp ? ' · ' + xp + ' XP' : ''}">${isFrozen(k) && !xp ? '❄' : ''}</i>`;
    }
    return h;
  }
  function noteStatus() {
    const p = perm(), ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(matchMedia('(display-mode: standalone)').matches || navigator.standalone);
    if (p === 'unsupported') return ios ? 'On iPhone: Share → Add to Home Screen first, then enable reminders here.' : 'This browser can’t show notifications. Use the calendar reminder below.';
    if (p === 'denied') return 'Notifications are blocked for this site. Allow them in your browser’s site settings, or use the calendar reminder.';
    return '';
  }
  function render() {
    const s = streak(), xp = xpOf(todayKey()), goal = S.set.goal, pct = Math.min(1, xp / goal), nx = nextUp(), C2 = 2 * Math.PI * 26;
    const st = S.set, p = perm(), nxt = S.total % 100;
    const p0 = overlay.querySelector('.eg-panel'), top = p0 ? p0.scrollTop : 0;
    overlay.innerHTML = `<div class="eg-panel" tabindex="-1">
      <button class="eg-x" data-a="close" aria-label="Close">×</button>
      <div class="eg-hd">${flame(xp > 0 ? 'on' : '')}<div><b>${s}</b> day streak<span>Best ${Math.max(S.best, s)} · ${xp > 0 ? 'practised today' : s > 0 ? 'practise today to keep it' : 'start one today'}</span></div></div>
      <div class="eg-goal"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--eg-line)" stroke-width="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="${xp >= goal ? 'var(--eg-ok)' : 'var(--eg-ac)'}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C2}" stroke-dashoffset="${C2 * (1 - pct)}" transform="rotate(-90 32 32)"/></svg>
        <div><div class="t">${xp} / ${goal} XP today</div><div class="s">${xp >= goal ? 'Goal complete. Anything extra is a bonus.' : `${goal - xp} XP to go · read ≈ 10 XP, watch ≈ 2 XP/min`}</div></div></div>
      <div class="eg-tiles"><div><b>${esc(levelTitle())}</b><span>Level ${level()} · ${nxt}/100 XP</span></div><div><b>${S.total}</b><span>Total XP</span></div><div><b>❄ ${S.freezes}/2</b><span>Streak freezes</span></div></div>
      ${nx ? `<button class="eg-next" data-a="go"><span style="flex:1"><small>Next up</small><b>${esc(nx.text)}</b></span><span aria-hidden="true">→</span></button>` : ''}
      <div class="eg-h">Last 5 weeks</div><div class="eg-heat">${heat()}</div>
      <p class="eg-note">Reach a 7-day streak to earn a freeze. It covers one missed day automatically.</p>
      <div class="eg-h">Daily goal</div>
      <div class="eg-seg" role="group" aria-label="Daily goal">${GOALS.map(([g, n]) => `<button type="button" data-goal="${g}" aria-pressed="${g === goal}">${n} · ${g} XP</button>`).join('')}</div>
      <div class="eg-h">Reminders</div>
      <div class="eg-row"><span>Remind me every day<small>In-app banner, plus notifications if enabled</small></span><input class="eg-sw" type="checkbox" data-a="remind" ${st.remind ? 'checked' : ''} aria-label="Daily reminders"></div>
      <div class="eg-row"><span>Reminder time</span><input type="time" data-a="time" value="${esc(st.time)}" aria-label="Reminder time"></div>
      <div class="eg-row"><span>Phone / desktop notifications<small>${p === 'granted' && st.notify ? 'On' : 'Off'}</small></span>${p === 'granted' && st.notify ? '<button class="eg-btn" data-a="test">Send test</button>' : (p === 'unsupported' || p === 'denied') ? '' : '<button class="eg-btn pri" data-a="enable">Enable</button>'}</div>
      ${noteStatus() ? `<p class="eg-note">${esc(noteStatus())}</p>` : ''}
      <div class="eg-row"><span>Daily calendar reminder<small>Works everywhere, even with the app closed</small></span><button class="eg-btn" data-a="ics">Add to calendar</button></div>
      <p class="eg-note">Notifications are local (no server). They fire while the app is open or installed, and on Android Chrome the installed app can also nudge you in the background. The calendar reminder is the one that never misses.</p>
    </div>`;
    const np = overlay.querySelector('.eg-panel'); np.scrollTop = top;
  }
  function openSheet() {
    if (overlay) return;
    lastFocus = document.activeElement;
    overlay = document.createElement('div'); overlay.className = 'eg eg-ov'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Streak and reminders');
    overlay.addEventListener('click', onSheetClick);
    overlay.addEventListener('change', onSheetChange);
    document.body.appendChild(overlay); render(); hideBanner();
    overlay.querySelector('.eg-panel').focus();
  }
  function closeSheet() {
    if (!overlay) return;
    overlay.remove(); overlay = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onSheetClick(e) {
    if (e.target === overlay) return closeSheet();
    const g = e.target.closest('[data-goal]');
    if (g) { S.set.goal = +g.dataset.goal; save(); return; }
    const a = e.target.closest('[data-a]'); if (!a) return;
    switch (a.dataset.a) {
      case 'close': closeSheet(); break;
      case 'go': goNext(nextUp()); break;
      case 'enable': enableNotifications(); break;
      case 'ics': downloadIcs(); break;
      case 'test': showNote('main').then(() => toast('Test notification sent')).catch(() => toast('Could not show a notification')); break;
    }
  }
  function onSheetChange(e) {
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'remind') { S.set.remind = a.checked; save(); registerPeriodic(); schedule(); }
    if (a.dataset.a === 'time' && /^\d{2}:\d{2}$/.test(a.value)) {
      S.set.time = a.value; if (mins(S.set.last) <= mins(a.value)) S.set.last = `${pad(Math.min(22, Math.floor(mins(a.value) / 60) + 2))}:${pad(mins(a.value) % 60)}`;
      S.notified = {}; save(); schedule();
    }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay) closeSheet(); });

  /* ───────── init */
  function init(cfg) {
    C = Object.assign({ key: 'engage', app: 'App', icon: 'icons/icon-192.png', url: abs('./') }, cfg);
    C.url = abs(C.url);
    load(); settle();
    if (!document.getElementById('eg-css')) { const st = document.createElement('style'); st.id = 'eg-css'; st.textContent = CSS; document.head.appendChild(st); }
    chip = document.createElement('button'); chip.type = 'button'; chip.className = 'eg eg-chip'; chip.addEventListener('click', openSheet);
    if (C.mountChip) C.mountChip(chip); else { chip.style.cssText = 'position:fixed;top:10px;right:10px;z-index:80'; document.body.appendChild(chip); }
    pullSW().then(() => { save(); check(); schedule(); registerPeriodic(); });
    paint();
    setTimeout(maybeBanner, 2500);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      settle(); S.notified = S.notified && S.notified.day === todayKey() ? S.notified : { day: todayKey() };
      save(); check(); schedule(); setTimeout(maybeBanner, 800);
    });
  }

  window.Engage = {
    init, log, watch, open: openSheet, close: closeSheet, streak: () => (S ? streak() : 0),
    todayXp: () => (S ? xpOf(todayKey()) : 0),
    state: () => JSON.parse(JSON.stringify(S)),
    _clock: clock, _check: check, _settle: () => { settle(); save(); }, _due: () => (S ? due() : null),
  };
})();
