/* PWA glue: service worker, install button, update prompt, offline badge, backup export/import. */
(function () {
  "use strict";
  const LS = "faang-run-2027";
  const KEYS = [LS, LS + "-days", LS + "-tab", LS + "-start", LS + "-theme"];
  const PROGRESS_KEYS = [LS, LS + "-days", LS + "-tab"];

  /* offline badge */
  const syncOnline = () => document.body.classList.toggle("is-offline", !navigator.onLine);
  addEventListener("online", syncOnline); addEventListener("offline", syncOnline); syncOnline();

  /* toast */
  function toast(msg, label, onClick) {
    const t = document.createElement("div"); t.className = "pwa-toast"; t.setAttribute("role", "status");
    const s = document.createElement("span"); s.textContent = msg; t.appendChild(s);
    if (label) { const b = document.createElement("button"); b.textContent = label; b.onclick = () => { t.remove(); onClick && onClick(); }; t.appendChild(b); }
    const x = document.createElement("button"); x.textContent = "×"; x.setAttribute("aria-label", "Dismiss"); x.style.background = "transparent"; x.onclick = () => t.remove(); t.appendChild(x);
    document.body.appendChild(t); return t;
  }

  /* service worker + update flow */
  const hadController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register("sw.js", { scope: "./" });
        const offer = w => toast("New version available.", "Update", () => w.postMessage("SKIP_WAITING"));
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(w); });
        });
        // reload only when an update replaces an existing controller (not on first install)
        let reloaded = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => { if (!hadController || reloaded) return; reloaded = true; location.reload(); });
        document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
      } catch (e) { /* app still works without SW */ }
    });
  }

  /* theme toggle: light / dark, remembered; first state follows the OS */
  const root = document.documentElement, tbtn = document.getElementById("themeBtn");
  const effective = () => root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const paint = () => { document.querySelectorAll("meta[name=theme-color]").forEach(m => { m.removeAttribute("media"); m.content = effective() === "dark" ? "#1a1a18" : "#ffffff"; });
     if (tbtn) { const d = effective() === "dark"; tbtn.textContent = d ? "☀" : "☾"; tbtn.title = d ? "Switch to light mode" : "Switch to dark mode"; tbtn.setAttribute("aria-label", tbtn.title); } };
  if (tbtn) tbtn.onclick = () => { const n = effective() === "dark" ? "light" : "dark"; root.setAttribute("data-theme", n); try { localStorage.setItem(LS + "-theme", n); } catch (e) {} paint(); };
  paint();

  /* footer tools */
  const host = document.getElementById("pwaTools");
  if (!host) return;
  const btn = (label, fn, id) => { const b = document.createElement("button"); b.className = "pwa-btn"; b.textContent = label; if (id) b.id = id; b.onclick = fn; host.appendChild(b); return b; };
  host.before(document.createElement("br"));

  let deferred = null;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; if (!standalone) installBtn.hidden = false; });
  addEventListener("appinstalled", () => { installBtn.hidden = true; toast("Installed. Open it from your home screen."); });
  const installBtn = btn("Install app", async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; installBtn.hidden = true; });
  installBtn.hidden = true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone;
  if (ios) btn("Install on iPhone", () => toast("Tap Share, then Add to Home Screen."));

  const exportBackup = () => {
    const data = { app: "faang-run-2027", exported: new Date().toISOString(), data: {} };
    KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) data.data[k] = v; });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = "faang-run-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  btn("Export backup", exportBackup);

  const file = document.createElement("input"); file.type = "file"; file.accept = "application/json,.json"; file.hidden = true;
  file.onchange = async () => {
    const f = file.files[0]; file.value = ""; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (j.app !== "faang-run-2027" || typeof j.data !== "object") throw new Error("not a backup");
      JSON.parse(j.data[LS] || "[]"); JSON.parse(j.data[LS + "-days"] || "{}");   // validate before overwriting
      if (!confirm("Replace progress on this device with the backup?")) return;
      KEYS.forEach(k => { if (typeof j.data[k] === "string") localStorage.setItem(k, j.data[k]); });
      location.reload();
    } catch (e) { toast("That file is not a valid FAANG Run backup."); }
  };
  host.appendChild(file);
  btn("Import backup", () => file.click());


  /* reset progress (keeps theme and start date) */
  btn("Reset progress", () => {
    if (!confirm("Reset ALL progress on this device?\n\nThis clears completed tasks, problems and the daily log. A backup file will be downloaded first so you can undo it with Import backup.")) return;
    exportBackup();
    setTimeout(() => { PROGRESS_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} }); location.reload(); }, 600);
  }).classList.add("danger");

  /* change plan start date (restarts the week counter and calendar) */
  const dateIn = document.createElement("input"); dateIn.type = "date"; dateIn.className = "pwa-date"; dateIn.setAttribute("aria-label", "Plan start date");
  const startKey = LS + "-start";
  dateIn.value = localStorage.getItem(startKey) || "2026-10-19";
  const setStart = btn("Set start date", () => {
    const v = dateIn.value; if (!v) return toast("Pick a date first.");
    const [y, m, d] = v.split("-").map(Number), dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));           // snap to Monday: weeks run Mon–Sun
    const iso = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
    if (!confirm("Restart the 26-week plan on Monday " + dt.toDateString() + "?\nYour completed tasks are kept; only the dates and current week change.")) return;
    try { localStorage.setItem(startKey, iso); } catch (e) {}
    location.reload();
  });
  host.insertBefore(dateIn, setStart);

  /* ask the browser not to evict our localStorage */
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
