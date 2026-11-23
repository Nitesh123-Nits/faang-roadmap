/* FAANG Run ↔ Engage glue: streak/XP for ticking tasks, solving problems, studying guides and the daily log.
 * Runs after the main inline script, so its globals (W, done, tKey, focusWeek, openWeek, lc, …) are in scope. */
(function () {
  "use strict";
  if (!window.Engage) return;

  const nextUp = () => {
    try {
      const w = focusWeek(), x = W[w - 1];
      for (let j = 0; j < x.tasks.length; j++) {
        if (!done.has(tKey(w, j))) return { text: x.tasks[j].replace(/^CHECKPOINT:\s*/, ""), go: () => openWeek(w) };
      }
      const p = x.probs.find(q => !done.has("s:" + q.s));
      if (p) return { text: "Solve “" + p.t + "”", href: lc(p.s) };
    } catch (e) { /* globals not ready */ }
    return { text: "Study a guide", go: () => showTab("study", true) };
  };

  const st = document.createElement("style");   // keep the eyebrow text clear of the streak chip + theme button
  st.textContent = "header.hero .eyebrow{padding-right:104px}";
  document.head.appendChild(st);

  Engage.init({
    key: "faang-run-2027-engage", app: "FAANG Run", url: "./?source=reminder", icon: "icons/icon-192.png",
    nextUp,
    mountChip(btn) {
      const hero = document.querySelector("header.hero"); if (!hero) return;
      btn.style.cssText = "position:absolute;top:calc(14px + env(safe-area-inset-top,0px));right:calc(max(16px,env(safe-area-inset-right,0px)) + 46px);z-index:5;height:38px;border-radius:10px";
      hero.appendChild(btn);
    }
  });

  /* tasks (10 XP), problems (15), pattern mastery (20) */
  document.addEventListener("change", ev => {
    const t = ev.target; if (!t || !t.checked) return;
    const k = t.dataset && t.dataset.k;
    if (k) {
      if (k.startsWith("s:")) Engage.log("solve", 15, "k:" + k, "Problem solved");
      else if (k.startsWith("pat:")) Engage.log("pattern", 20, "k:" + k, "Pattern mastered");
      else Engage.log("task", 10, "k:" + k, "Task done");
      return;
    }
    /* daily log items (today only, so back-filling old days can't farm XP) */
    const id = t.dataset && t.dataset.id;
    if (id && t.closest("#dTodo,#dDone") && typeof curDay !== "undefined" && curDay === iso(today())) Engage.log("daily", 10, "day:" + id, "Daily item done");
  });

  /* study guides marked as studied (20 XP) */
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest("#sxDone");
    if (b && b.getAttribute("aria-pressed") === "true") Engage.log("study", 20, "study:" + location.hash.replace(/^#study\//, ""), "Guide studied");
  });
})();
