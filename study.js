/* Study Library: the Java Backend Field Manual, built natively into the tracker.
   Data lives in study/*.json (index + one file per track). Routes: #study, #study/<track|doc|path>, #study/practice. */
(function () {
  "use strict";
  const LS = "faang-run-2027";
  const K = { studied: LS + "-studied", marks: LS + "-bookmarks", cards: LS + "-cards", prac: LS + "-practice", days: LS + "-sxdays", last: LS + "-sxlast" };
  const root = document.getElementById("sx");
  if (!root) return;

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const studied = new Set(store.get(K.studied, []));
  const marks = new Set(store.get(K.marks, []));
  let cards = store.get(K.cards, {});
  const days = new Set(store.get(K.days, []));
  const saveStudied = () => store.set(K.studied, [...studied]);
  const saveMarks = () => store.set(K.marks, [...marks]);
  const today = () => Math.floor(Date.now() / 864e5);

  /* ---------------- data ---------------- */
  let IX = null, ixPromise = null;
  const blobs = {}, blobP = {};
  const docMeta = {};             // id -> {track, item, i}
  function loadIndex() {
    return ixPromise || (ixPromise = fetch("study/index.json").then(r => { if (!r.ok) throw new Error("index"); return r.json(); }).then(j => {
      IX = j;
      Object.entries(j.tracks).forEach(([tid, t]) => t.docs.forEach((d, i) => docMeta[d.id] = { track: tid, item: d, i }));
      return j;
    }));
  }
  function loadTrack(tid) {
    return blobP[tid] || (blobP[tid] = fetch("study/" + tid + ".json").then(r => { if (!r.ok) throw new Error("track"); return r.json(); }).then(j => (blobs[tid] = j)).catch(e => { delete blobP[tid]; throw e; }));
  }
  const guidesOf = tid => IX.tracks[tid].docs.filter(d => d.kind === "guide");
  const trackDone = tid => guidesOf(tid).filter(d => studied.has(d.id)).length;
  const allGuides = () => Object.values(IX.tracks).reduce((n, t) => n + guidesOf2(t).length, 0);
  const guidesOf2 = t => t.docs.filter(d => d.kind === "guide");
  const totalDone = () => Object.keys(IX.tracks).reduce((n, tid) => n + trackDone(tid), 0);
  const hue = t => `--hue:var(--${t.hue || "accent"})`;

  /* ---------------- highlighter (small, offline, no CDN) ---------------- */
  const KW = {
    java: "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try var void volatile while record sealed permits yield null true false",
    sql: "select from where and or not in is null as join left right inner outer full cross on group by order having limit offset insert into values update set delete create table index unique primary key foreign references alter add drop column constraint default begin commit rollback union all distinct exists case when then else end count sum avg min max with over partition for lock share nowait skip locked returning using desc asc like between if view trigger explain analyze",
    bash: "if then else elif fi for while do done case esac in function echo export cd ls cat grep sed awk kubectl docker helm curl git sudo mvn gradle java return exit set unset source",
    docker: "FROM RUN CMD LABEL EXPOSE ENV ADD COPY ENTRYPOINT VOLUME USER WORKDIR ARG ONBUILD STOPSIGNAL HEALTHCHECK SHELL AS",
    yaml: "true false null yes no on off",
    json: "true false null",
    lua: "and break do else elseif end false for function if in local nil not or repeat return then true until while",
    protobuf: "syntax package import option message enum service rpc returns repeated optional required oneof map reserved extend string int32 int64 uint32 uint64 bool bytes double float true false"
  };
  const KWS = {}; Object.keys(KW).forEach(k => KWS[k] = new Set(KW[k].split(" ")));
  const LANG_ALIAS = { shell: "bash", sh: "bash", dockerfile: "docker", yml: "yaml", proto: "protobuf", properties: "ini", xml: "text" };
  function hl(code, lang) {
    lang = LANG_ALIAS[lang] || lang;
    if (!lang || lang === "text") return esc(code);
    const hash = lang === "bash" || lang === "yaml" || lang === "docker" || lang === "ini";
    const dash = lang === "sql" || lang === "lua";
    const slash = lang === "java" || lang === "protobuf" || lang === "json" || lang === "http";
    const parts = [];
    if (slash) parts.push("(?<c>\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)");
    else if (dash) parts.push("(?<c>--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)");
    else if (hash) parts.push("(?<c>(?:^|\\s)#[^\\n]*|^;[^\\n]*)");
    else parts.push("(?<c>(?!x)x)");
    parts.push('(?<s>"""[\\s\\S]*?"""|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\')');
    if (lang === "java") parts.push("(?<a>@[A-Za-z_][\\w.]*)");
    else parts.push("(?<a>(?!x)x)");
    parts.push("(?<n>\\b\\d[\\d_.]*(?:[eE][+-]?\\d+)?[LlFfDd]?\\b)");
    parts.push("(?<w>[A-Za-z_$][\\w$]*)");
    const re = new RegExp(parts.join("|"), "gm");
    const kws = KWS[lang] || null, ci = lang === "sql";
    let out = "", last = 0, m;
    const sp = (cls, t) => `<span class="token ${cls}">${esc(t)}</span>`;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      const g = m.groups, t = m[0];
      if (g.c) {
        const lead = /^\s/.test(t) ? t[0] : "";
        out += esc(lead) + sp("comment", t.slice(lead.length));
      } else if (g.s) {
        const after = code.slice(m.index + t.length, m.index + t.length + 3);
        out += (lang === "json" || lang === "yaml") && /^\s*:/.test(after) ? sp("property", t) : sp("string", t);
      } else if (g.a) out += sp("annotation", t);
      else if (g.n) out += sp("number", t);
      else {
        const w = t, key = ci ? w.toLowerCase() : w;
        const nextCh = code[m.index + w.length];
        if (kws && kws.has(key)) out += sp("keyword", w);
        else if ((lang === "yaml" || lang === "ini") && /^\s*[:=]/.test(code.slice(m.index + w.length, m.index + w.length + 3))) out += sp("property", w);
        else if (lang === "java" && /^[A-Z]/.test(w) && !/^[A-Z0-9_]{2,}$/.test(w)) out += sp("class-name", w);
        else if (lang === "java" && nextCh === "(") out += sp("function", w);
        else out += esc(w);
      }
      last = m.index + t.length;
    }
    return out + esc(code.slice(last));
  }
  function enhance(scope) {
    scope.querySelectorAll("pre > code").forEach(c => {
      if (c.dataset.hl) return; c.dataset.hl = "1";
      const m = /language-(\w+)/.exec(c.className);
      if (m) c.innerHTML = hl(c.textContent, m[1].toLowerCase());
    });
  }
  root.addEventListener("click", e => {
    const b = e.target.closest(".copy"); if (!b) return;
    const code = b.closest(".code").querySelector("code").textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => { b.textContent = "Copied"; b.classList.add("ok"); setTimeout(() => { b.textContent = "Copy"; b.classList.remove("ok"); }, 1400); }).catch(() => { b.textContent = "Press Ctrl+C"; });
  });

  /* ---------------- routing ---------------- */
  function parse() {
    const h = decodeURIComponent((location.hash || "").slice(1));
    if (h !== "study" && !h.startsWith("study/")) return null;
    const rest = h.slice(5).replace(/^\//, ""), [id, qs] = rest.split("?");
    return { id: id || "", q: qs ? new URLSearchParams(qs).get("q") : null };
  }
  function go(id, q) { const h = "#study" + (id ? "/" + id : "") + (q ? "?q=" + q : ""); if (location.hash === h) route(); else location.hash = h; }
  window.addEventListener("hashchange", () => { if (parse()) { if (window.showTab && tabNow() !== "study") window.showTab("study"); route(); } });
  const tabNow = () => { try { return tab; } catch (e) { return ""; } };
  root.addEventListener("click", e => {
    const a = e.target.closest("a[href^='#study']"); if (!a) return;
    e.preventDefault(); const h = a.getAttribute("href").slice(1).replace(/^study\/?/, ""); const [id, qs] = h.split("?"); go(id, qs ? new URLSearchParams(qs).get("q") : null);
  });

  /* ---------------- chrome ---------------- */
  function pill() { const n = allGuides(), d = totalDone(), p = n ? Math.round(d / n * 100) : 0; return `<a class="sx-pill" href="#study/practice?q=progress"><b>${p}%</b> studied</a>`; }
  function top(extra) {
    return `<div class="sx-top"><a class="sx-home" href="#study">Library</a>
      <div class="sx-search"><input id="sxQ" type="search" placeholder="Search guides and questions" autocomplete="off" aria-label="Search guides and questions"><div class="sx-results" id="sxRes" hidden></div></div>
      <a class="sx-btn" href="#study/practice">Practice</a>${pill()}</div>${extra || ""}`;
  }
  function wireSearch() {
    const q = document.getElementById("sxQ"), res = document.getElementById("sxRes"); if (!q) return;
    const run = () => {
      const terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) { res.hidden = true; return; }
      const hits = [];
      for (const [id, kind, title, tid, text] of IX.search) {
        const tl = title.toLowerCase(), hay = (title + " " + text).toLowerCase();
        if (!terms.every(t => hay.includes(t))) continue;
        hits.push({ id, kind, title, tid, text, score: terms.reduce((s, t) => s + (tl.includes(t) ? 3 : 1), 0) + (kind === "guide" ? .5 : 0) });
      }
      hits.sort((a, b) => b.score - a.score);
      res.hidden = false;
      res.innerHTML = hits.length ? hits.slice(0, 12).map(h => {
        const t = IX.tracks[h.tid], href = h.kind === "question" ? "#study/" + (t.docs.find(d => d.kind === "qa") || {}).id + "?q=" + h.id : "#study/" + h.id;
        return `<a href="${href}" class="sx-hit"><span class="sx-kind">${h.kind === "guide" ? "Guide" : "Question"}</span><b>${esc(h.title)}</b><small>${esc(t.short)}</small></a>`;
      }).join("") : `<div class="sx-none">No matches</div>`;
    };
    q.addEventListener("input", run);
    q.addEventListener("keydown", e => { if (e.key === "Escape") { q.value = ""; res.hidden = true; } });
    res.addEventListener("click", () => { res.hidden = true; q.value = ""; });
  }

  /* ---------------- views ---------------- */
  function sidebar(cur) {
    const curTrack = docMeta[cur] ? docMeta[cur].track : (IX.tracks[cur] ? cur : null);
    return `<aside class="sx-side" aria-label="Contents">` + IX.cats.map(c => `<p class="sx-cat">${esc(c.name)}</p>` + c.tracks.map(tid => {
      const t = IX.tracks[tid], open = tid === curTrack, n = guidesOf(tid).length, d = trackDone(tid);
      return `<section class="sx-trk${open ? " open" : ""}" style="${hue(t)}"><a class="sx-trk-h" href="#study/${tid}"><i></i><span>${esc(t.short)}</span><small>${d}/${n}</small></a>` +
        (open ? `<ol>${t.docs.map((x, i) => `<li><a href="#study/${x.id}"${x.id === cur ? ' class="cur"' : ""}><span class="n">${x.kind === "guide" ? String(i + 1).padStart(2, "0") : x.kind === "qa" ? "Q" : "★"}</span><span class="${studied.has(x.id) ? "is-done" : ""}">${esc(x.title)}</span></a></li>`).join("")}</ol>` : "") + `</section>`;
    }).join("")).join("") + `</aside>`;
  }
  function shell(cur, main) { return top() + `<div class="sx-shell">${sidebar(cur)}<div class="sx-main">${main}</div></div>`; }

  function viewHome() {
    const last = store.get(K.last, null), lm = last && docMeta[last];
    const cont = lm ? `<a class="sx-cont" href="#study/${last}"><small>Continue where you left off</small><b>${esc(lm.item.title)}</b><span>${esc(IX.tracks[lm.track].title)}</span></a>` : "";
    const paths = IX.paths.map(p => {
      const ids = p.weeks.flatMap(w => w.steps), d = ids.filter(i => studied.has(i)).length;
      return `<a class="sx-path" href="#study/${p.id}"><small>${esc(p.meta)}</small><b>${esc(p.title)}</b><span>${esc(p.sub)}</span><div class="bar"><i style="width:${ids.length ? d / ids.length * 100 : 0}%"></i></div></a>`;
    }).join("");
    const cats = IX.cats.map(c => `<div class="sx-lib"><h3>${esc(c.name)}</h3><div class="sx-grid">` + c.tracks.map(tid => {
      const t = IX.tracks[tid], n = guidesOf(tid).length, d = trackDone(tid);
      return `<a class="sx-card" href="#study/${tid}" style="${hue(t)}"><small>${esc(t.pkg || "")}</small><b>${esc(t.title)}</b><span>${esc(t.blurb || "")}</span><em>${n} guides · ${t.questions} questions</em><div class="bar"><i style="width:${n ? d / n * 100 : 0}%"></i></div></a>`;
    }).join("") + `</div></div>`).join("");
    return top() + `<div class="sx-page"><div class="phead"><div class="eyebrow">Study library</div><h2>Java Backend Field Manual</h2><p>${allGuides()} guides with working code and diagrams, ${IX.search.filter(x => x[1] === "question").length} interview questions, cheat sheets and flashcards across Java, Spring Boot, microservices, distributed systems, data and production.</p></div>
      ${cont}<h3 class="sx-h">Learning paths</h3><div class="sx-paths">${paths}</div>${cats}
      <div class="sx-offline"><button class="pwa-btn" id="sxOffline" type="button">Save all guides for offline</button><span id="sxOffMsg"></span></div></div>`;
  }

  function trackRows(tid) {
    const t = IX.tracks[tid];
    return t.docs.map((d, i) => {
      const meta = d.kind === "guide" ? `${d.mins} min${d.code ? " · " + d.code + " code" : ""}` : d.kind === "qa" ? `${d.count} questions` : "one page";
      const lab = d.kind === "guide" ? String(i + 1).padStart(2, "0") : d.kind === "qa" ? "Q" : "★";
      return `<a class="sx-row${studied.has(d.id) ? " is-done" : ""}" href="#study/${d.id}"><span class="n">${lab}</span><span class="t">${esc(d.title)}</span><span class="m">${meta}</span><span class="ck" aria-hidden="true"></span></a>`;
    }).join("");
  }
  function viewTrack(tid) {
    const t = IX.tracks[tid], n = guidesOf(tid).length, d = trackDone(tid);
    return shell(tid, `<div class="sx-doc-head" style="${hue(t)}"><div class="eyebrow">${esc(IX.cats.find(c => c.id === t.cat).name)} · ${esc(t.pkg || "")}</div><h1>${esc(t.title)}</h1><p class="doc-sub">${esc(t.blurb || "")}</p><div class="sx-prog"><div class="bar"><i style="width:${n ? d / n * 100 : 0}%"></i></div><span>${d} of ${n} guides studied</span></div></div><div class="sx-rows" style="${hue(t)}">${trackRows(tid)}</div>`);
  }

  function crumbs(tid, title) { const t = IX.tracks[tid]; return `<nav class="sx-crumbs"><a href="#study">Library</a><span>/</span><a href="#study/${tid}">${esc(t.short)}</a>${title ? `<span>/</span><em>${esc(title)}</em>` : ""}</nav>`; }
  function pager(tid, i) {
    const docs = IX.tracks[tid].docs, p = docs[i - 1], n = docs[i + 1];
    return `<nav class="pager sx-pager">${p ? `<a class="pg prev" href="#study/${p.id}"><small>Previous</small><span>${esc(p.title)}</span></a>` : "<span></span>"}${n ? `<a class="pg next" href="#study/${n.id}"><small>Next</small><span>${esc(n.title)}</span></a>` : "<span></span>"}</nav>`;
  }

  async function viewGuide(id) {
    const m = docMeta[id], tid = m.track, t = IX.tracks[tid], d = m.item;
    const blob = await loadTrack(tid), g = blob.docs[id];
    const secs = [...g.body.matchAll(/<h2 class="sec" id="([^"]+)"[^>]*>(.*?)<\/h2>/gs)].map(x => [x[1], x[2].replace(/<[^>]+>/g, "")]);
    const num = guidesOf(tid).findIndex(x => x.id === id) + 1;
    store.set(K.last, id);
    return shell(id, `<article class="sx-doc" style="${hue(t)}">${crumbs(tid, "")}
      <header class="sx-doc-head"><div class="eyebrow">${esc(t.short)} · Guide ${String(num).padStart(2, "0")} of ${guidesOf(tid).length}</div><h1>${esc(d.title)}</h1>
        <div class="doc-meta"><span>${d.mins} min read</span>${d.code ? `<span>${d.code} code samples</span>` : ""}<span class="doc-actions">
          <button type="button" class="sx-toggle" id="sxDone" aria-pressed="${studied.has(id)}">${studied.has(id) ? "Studied ✓" : "Mark as studied"}</button>
          <button type="button" class="sx-toggle icon" id="sxMark" aria-pressed="${marks.has(id)}" aria-label="Bookmark">${marks.has(id) ? "★" : "☆"}</button></span></div></header>
      ${g.tldr ? `<section class="tldr"><p class="tldr-label">Key takeaways</p><ul>${g.tldr}</ul></section>` : ""}
      <div class="sx-with-toc"><div class="prose" id="sxBody">${g.body}</div>
      ${secs.length > 1 ? `<nav class="sx-toc" aria-label="On this page"><p>On this page</p><ol>${secs.map(s => `<li><a href="#${s[0]}" data-sec="${s[0]}">${esc(s[1])}</a></li>`).join("")}</ol></nav>` : ""}</div>
      ${pager(tid, m.i)}</article>`);
  }
  function afterGuide(id) {
    const b = document.getElementById("sxBody"); if (b) enhance(b);
    const done = document.getElementById("sxDone"), mk = document.getElementById("sxMark");
    if (done) done.onclick = () => { studied.has(id) ? studied.delete(id) : studied.add(id); saveStudied(); noteDay(); done.setAttribute("aria-pressed", studied.has(id)); done.textContent = studied.has(id) ? "Studied ✓" : "Mark as studied"; refreshChrome(id); };
    if (mk) mk.onclick = () => { marks.has(id) ? marks.delete(id) : marks.add(id); saveMarks(); mk.setAttribute("aria-pressed", marks.has(id)); mk.textContent = marks.has(id) ? "★" : "☆"; };
    root.querySelectorAll(".sx-toc a").forEach(a => a.onclick = e => { e.preventDefault(); const el = document.getElementById(a.dataset.sec); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); });
  }
  function refreshChrome(id) {
    const side = root.querySelector(".sx-side"); if (side) side.outerHTML = sidebar(id);
    const p = root.querySelector(".sx-pill"); if (p) p.outerHTML = pill();
  }
  function noteDay() { days.add(new Date().toISOString().slice(0, 10)); store.set(K.days, [...days]); }

  async function viewQA(id, qid) {
    const m = docMeta[id], tid = m.track, t = IX.tracks[tid], blob = await loadTrack(tid);
    const lv = { junior: 0, mid: 0, senior: 0 }; blob.qa.forEach(q => lv[q.level]++);
    store.set(K.last, id);
    return shell(id, `<article class="sx-doc" style="${hue(t)}">${crumbs(tid, "Interview questions")}
      <header class="sx-doc-head"><div class="eyebrow">${esc(t.short)} · ${blob.qa.length} questions</div><h1>Interview questions</h1><p class="doc-sub">${lv.junior} junior · ${lv.mid} mid · ${lv.senior} senior. Open one for a model answer, or drill them as flashcards.</p>
      <div class="sx-tools"><button class="chip is-on" data-lv="all">All</button><button class="chip" data-lv="junior">Junior</button><button class="chip" data-lv="mid">Mid</button><button class="chip" data-lv="senior">Senior</button><button class="chip ghost" id="sxExp">Expand all</button><a class="chip solid" href="#study/practice?q=${tid}">Practice as flashcards</a></div></header>
      <div class="qa-list" id="sxQA" data-filter="all">${blob.qa.map((q, i) => `<details class="qa" data-level="${q.level}" id="${q.id}"><summary><span class="q-num">Q${String(i + 1).padStart(2, "0")}</span><span class="q-text">${q.q}</span><span class="lvl lvl-${q.level}">${q.level}</span></summary><div class="prose answer">${q.a}</div></details>`).join("")}</div>
      ${pager(tid, m.i)}</article>`);
  }
  function afterQA(qid) {
    const list = document.getElementById("sxQA"); if (!list) return; enhance(list);
    root.querySelectorAll(".sx-tools .chip[data-lv]").forEach(c => c.onclick = () => { root.querySelectorAll(".sx-tools .chip[data-lv]").forEach(x => x.classList.toggle("is-on", x === c)); list.dataset.filter = c.dataset.lv; });
    const ex = document.getElementById("sxExp"); ex.onclick = () => { const open = ex.textContent === "Expand all"; list.querySelectorAll("details").forEach(d => d.open = open); ex.textContent = open ? "Collapse all" : "Expand all"; };
    if (qid) { const d = document.getElementById(qid); if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ block: "center" }), 60); } }
  }

  async function viewCheat(id) {
    const m = docMeta[id], tid = m.track, t = IX.tracks[tid], blob = await loadTrack(tid);
    store.set(K.last, id);
    return shell(id, `<article class="sx-doc wide" style="${hue(t)}">${crumbs(tid, "Cheat sheet")}<header class="sx-doc-head"><div class="eyebrow">${esc(t.short)} · one-page revision</div><h1>Cheat sheet</h1><p class="doc-sub">The key takeaways from every guide on one page. Read it the night before the interview.</p></header><div class="cs-grid">${blob.cheat[id]}</div>${pager(tid, m.i)}</article>`);
  }

  function viewPath(id) {
    const p = IX.paths.find(x => x.id === id), ids = p.weeks.flatMap(w => w.steps), d = ids.filter(i => studied.has(i)).length, next = ids.find(i => !studied.has(i)) || ids[0];
    return top() + `<div class="sx-page"><nav class="sx-crumbs"><a href="#study">Library</a><span>/</span><em>Learning paths</em></nav>
      <div class="sx-doc-head"><div class="eyebrow">Learning path · ${esc(p.meta)}</div><h1>${esc(p.title)}</h1><p class="doc-sub">${esc(p.sub)}</p><div class="sx-prog"><div class="bar"><i style="width:${d / ids.length * 100}%"></i></div><span>${d} of ${ids.length} done</span></div><a class="sx-btn primary" href="#study/${next}">${d ? "Continue path" : "Start path"}</a></div>
      ${p.weeks.map(w => `<section class="sx-week"><h2>${esc(w.title)}</h2><div class="sx-rows">${w.steps.map(s => { const x = docMeta[s]; if (!x) return ""; const t = IX.tracks[x.track]; return `<a class="sx-row${studied.has(s) ? " is-done" : ""}" href="#study/${s}" style="${hue(t)}"><span class="n"><i></i></span><span class="t">${esc(x.item.title)}</span><span class="m">${esc(t.short)} · ${x.item.mins || ""} min</span><span class="ck"></span></a>`; }).join("")}</div></section>`).join("")}</div>`;
  }

  /* ---------------- practice (flashcards with spaced repetition) ---------------- */
  const INTERVALS = [0, 1, 3, 7, 16, 35];
  let QS = null, pstate = null, queue = [], qi = 0, revealed = false, sessionDone = 0;
  async function loadAllQ() {
    if (QS) return QS;
    await Promise.all(Object.keys(IX.tracks).map(loadTrack));
    QS = []; Object.keys(IX.tracks).forEach(tid => blobs[tid].qa.forEach(q => QS.push({ id: q.id, track: tid, level: q.level, q: q.q, a: q.a })));
    return QS;
  }
  const filt = () => QS.filter(x => pstate.tracks.includes(x.track) && (pstate.level === "all" || x.level === pstate.level));
  function build() {
    const t = today(), f = filt();
    const due = f.filter(x => cards[x.id] && cards[x.id].due <= t).sort((a, b) => cards[a.id].due - cards[b.id].due);
    queue = [...due, ...f.filter(x => !cards[x.id]).slice(0, 20)]; qi = 0; revealed = false; sessionDone = 0;
  }
  async function viewPractice(view) {
    await loadAllQ();
    const def = { tracks: Object.keys(IX.tracks).filter(t => IX.tracks[t].questions), level: "all" };
    pstate = Object.assign(def, store.get(K.prac, {}));
    if (view && IX.tracks[view]) { pstate.tracks = [view]; store.set(K.prac, pstate); view = "cards"; }
    const v = view === "progress" || view === "bookmarks" ? view : "cards";
    build();
    return top() + `<div class="sx-page"><nav class="sx-crumbs"><a href="#study">Library</a><span>/</span><em>Practice</em></nav><div class="phead"><div class="eyebrow">Practice</div><h2>Flashcards, progress and bookmarks</h2><p>Miss a card and it returns today. Get it right and it waits longer each time.</p></div>
      <div class="sx-seg" role="tablist"><button data-pv="cards" aria-selected="${v === "cards"}">Flashcards</button><button data-pv="progress" aria-selected="${v === "progress"}">Progress</button><button data-pv="bookmarks" aria-selected="${v === "bookmarks"}">Bookmarks</button></div><div id="sxPane"></div></div>`;
  }
  function afterPractice(view) {
    const pane = document.getElementById("sxPane");
    const draw = v => {
      root.querySelectorAll(".sx-seg button").forEach(b => b.setAttribute("aria-selected", b.dataset.pv === v));
      if (v === "cards") paneCards(pane); else if (v === "progress") paneProgress(pane); else paneMarks(pane);
    };
    root.querySelectorAll(".sx-seg button").forEach(b => b.onclick = () => draw(b.dataset.pv));
    draw(view === "progress" || view === "bookmarks" ? view : "cards");
  }
  function paneCards(pane) {
    pane.innerHTML = `<div class="sx-practice"><aside class="sx-filters"><h4>Tracks</h4><div id="fT"></div><div class="sx-links"><button id="fAll">Select all</button><button id="fNone">Clear</button></div><h4>Level</h4><div id="fL" class="sx-tools"></div></aside><div><div class="sx-deck" id="deck"></div><div class="sx-flash" id="flash"></div></div></div>`;
    const counts = {}; QS.forEach(x => counts[x.track] = (counts[x.track] || 0) + 1);
    const paintF = () => {
      pane.querySelector("#fT").innerHTML = Object.entries(IX.tracks).filter(([t]) => counts[t]).map(([t, v]) => `<label><input type="checkbox" data-t="${t}" ${pstate.tracks.includes(t) ? "checked" : ""}><span>${esc(v.short)}</span><small>${counts[t]}</small></label>`).join("");
      pane.querySelector("#fL").innerHTML = ["all", "junior", "mid", "senior"].map(l => `<button class="chip${pstate.level === l ? " is-on" : ""}" data-l="${l}">${l[0].toUpperCase() + l.slice(1)}</button>`).join("");
    };
    const save = () => store.set(K.prac, pstate);
    paintF(); build(); card(pane);
    pane.querySelector("#fT").onchange = e => { const t = e.target.dataset.t; if (!t) return; pstate.tracks = e.target.checked ? [...new Set([...pstate.tracks, t])] : pstate.tracks.filter(x => x !== t); save(); build(); card(pane); };
    pane.querySelector("#fAll").onclick = () => { pstate.tracks = Object.keys(counts); save(); paintF(); build(); card(pane); };
    pane.querySelector("#fNone").onclick = () => { pstate.tracks = []; save(); paintF(); build(); card(pane); };
    pane.querySelector("#fL").onclick = e => { const l = e.target.dataset.l; if (!l) return; pstate.level = l; save(); paintF(); build(); card(pane); };
  }
  function card(pane) {
    const f = filt(), t = today(), deck = pane.querySelector("#deck"), flash = pane.querySelector("#flash");
    const fresh = f.filter(x => !cards[x.id]).length, learning = f.filter(x => cards[x.id] && cards[x.id].box < 4).length, mastered = f.filter(x => cards[x.id] && cards[x.id].box >= 4).length, due = f.filter(x => cards[x.id] && cards[x.id].due <= t).length;
    deck.innerHTML = `<div><b>${fresh}</b><span>new</span></div><div><b>${learning}</b><span>learning</span></div><div><b>${mastered}</b><span>mastered</span></div><div><b>${due}</b><span>due today</span></div>`;
    if (!f.length) { flash.innerHTML = `<div class="sx-empty"><b>No questions match these filters</b>Pick at least one track.</div>`; return; }
    if (qi >= queue.length) {
      flash.innerHTML = `<div class="sx-empty"><b>${sessionDone ? "Session complete" : "All caught up"}</b>${sessionDone ? `You reviewed ${sessionDone} card${sessionDone > 1 ? "s" : ""}. ` : ""}Nothing else is due for these filters.<div class="sx-tools" style="justify-content:center;margin-top:14px"><button class="chip" id="moreNew">Study 20 more new cards</button><button class="chip" id="revAll">Review everything</button></div></div>`;
      flash.querySelector("#moreNew").onclick = () => { queue = filt().filter(x => !cards[x.id]).slice(0, 20); qi = 0; sessionDone = 0; card(pane); };
      flash.querySelector("#revAll").onclick = () => { queue = filt().slice().sort(() => Math.random() - .5); qi = 0; sessionDone = 0; card(pane); };
      return;
    }
    const c = queue[qi], tr = IX.tracks[c.track], bx = cards[c.id] ? "box " + cards[c.id].box : "new";
    const qdoc = tr.docs.find(d => d.kind === "qa");
    flash.innerHTML = `<div class="sx-fc"><div class="sx-fc-top"><span class="lvl lvl-${c.level}">${c.level}</span><span>${esc(tr.short)} · ${bx}</span><span>${qi + 1} of ${queue.length}</span></div><h3 class="sx-fc-q">${c.q}</h3>
      <div class="sx-fc-a prose"${revealed ? "" : " hidden"}>${c.a}</div>
      <div class="sx-fc-actions">${revealed ? `<button class="sx-btn" data-g="again">Again</button><button class="sx-btn" data-g="hard">Hard</button><button class="sx-btn primary" data-g="good">Got it</button>` : `<button class="sx-btn primary" id="rev">Show answer</button>`}<a href="#study/${qdoc.id}?q=${c.id}" class="sx-fc-link">Open in ${esc(tr.short)} questions</a></div></div>`;
    enhance(flash);
    const rv = flash.querySelector("#rev"); if (rv) rv.onclick = () => { revealed = true; card(pane); };
    flash.querySelectorAll("[data-g]").forEach(b => b.onclick = () => grade(b.dataset.g, pane));
  }
  function grade(g, pane) {
    const c = queue[qi], t = today(), cur = cards[c.id] || { box: 0, due: t };
    if (g === "again") { cur.box = 1; cur.due = t; queue.splice(Math.min(queue.length, qi + 4), 0, c); }
    else if (g === "hard") { cur.box = Math.max(1, cur.box); cur.due = t + 1; }
    else { cur.box = Math.min(5, cur.box + 1); cur.due = t + INTERVALS[cur.box]; }
    cards[c.id] = cur; store.set(K.cards, cards); noteDay(); sessionDone++; qi++; revealed = false; card(pane);
  }
  function streak() { let n = 0, d = today(); const has = x => days.has(new Date(x * 864e5).toISOString().slice(0, 10)); if (!has(d)) d--; while (has(d)) { n++; d--; } return n; }
  function paneProgress(pane) {
    const tg = allGuides(), td = totalDone(), pct = tg ? Math.round(td / tg * 100) : 0, mastered = Object.values(cards).filter(c => c.box >= 4).length;
    pane.innerHTML = `<div class="sx-tiles"><div><b>${pct}%</b><span>of guides studied</span></div><div><b>${td}/${tg}</b><span>guides</span></div><div><b>${mastered}/${QS.length}</b><span>cards mastered</span></div><div><b>${streak()}</b><span>day streak</span></div></div>
      <div class="sx-rows">${Object.entries(IX.tracks).map(([tid, t]) => { const n = guidesOf(tid).length, d = trackDone(tid); return `<a class="sx-row" href="#study/${tid}" style="${hue(t)}"><span class="n"><i></i></span><span class="t">${esc(t.title)}</span><span class="m">${d}/${n} guides</span><span class="ck"></span></a>`; }).join("")}</div>
      <div class="sx-danger"><span>Study progress is stored on this device only.</span><button class="sx-link danger" id="sxReset">Reset study progress</button></div>`;
    pane.querySelector("#sxReset").onclick = () => { if (!confirm("Reset all study progress (studied guides, flashcards, bookmarks)?")) return; studied.clear(); marks.clear(); cards = {}; days.clear(); [K.studied, K.marks, K.cards, K.days, K.last].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} }); route(); };
  }
  function paneMarks(pane) {
    const list = [...marks].filter(i => docMeta[i]);
    pane.innerHTML = list.length ? `<div class="sx-rows">${list.map(i => { const x = docMeta[i], t = IX.tracks[x.track]; return `<a class="sx-row" href="#study/${i}" style="${hue(t)}"><span class="n"><i></i></span><span class="t">${esc(x.item.title)}</span><span class="m">${esc(t.short)}</span><span class="ck"></span></a>`; }).join("")}</div>` : `<div class="sx-empty"><b>No bookmarks yet</b>Tap ☆ on any guide to save it here.</div>`;
  }

  /* ---------------- route ---------------- */
  let busy = 0;
  async function route() {
    const r = parse() || { id: "", q: null }, my = ++busy; root.dataset.ready = "1";
    root.innerHTML = `<div class="sx-loading">Loading library…</div>`;
    try {
      await loadIndex();
      let html, after = null;
      const id = r.id;
      if (!id) { html = viewHome(); after = () => { const b = document.getElementById("sxOffline"); if (b) b.onclick = saveOffline; }; }
      else if (id === "practice") { html = await viewPractice(r.q); after = () => afterPractice(r.q); }
      else if (IX.tracks[id]) html = viewTrack(id);
      else if (IX.paths.some(p => p.id === id)) html = viewPath(id);
      else if (docMeta[id]) {
        const k = docMeta[id].item.kind;
        if (k === "guide") { html = await viewGuide(id); after = () => afterGuide(id); }
        else if (k === "qa") { html = await viewQA(id, r.q); after = () => afterQA(r.q); }
        else html = await viewCheat(id);
      } else html = viewHome();
      if (my !== busy) return;
      root.innerHTML = html; wireSearch(); if (after) after();
      if (!(r.q && docMeta[id] && docMeta[id].item.kind === "qa")) scrollTop();
    } catch (e) {
      if (my !== busy) return;
      root.innerHTML = `<div class="sx-empty"><b>Couldn't load the library</b>Open this tab once while online so it can be saved for offline use.<div style="margin-top:12px"><button class="sx-btn" id="sxRetry">Try again</button></div></div>`;
      const b = document.getElementById("sxRetry"); if (b) b.onclick = () => { ixPromise = null; route(); };
    }
  }
  function scrollTop() { const el = document.getElementById("tab-study"); if (!el) return; const nav = document.querySelector("nav.tabs"), off = nav && nav.offsetHeight ? nav.offsetHeight : 0; const y = el.getBoundingClientRect().top + scrollY - off - 4; if (innerWidth <= 760 || scrollY > y) scrollTo(0, Math.max(0, y)); }

  async function saveOffline() {
    const msg = document.getElementById("sxOffMsg"), btn = document.getElementById("sxOffline"); btn.disabled = true;
    const ids = Object.keys(IX.tracks); let n = 0;
    try { for (const t of ids) { await loadTrack(t); msg.textContent = " Saved " + (++n) + " of " + ids.length + "…"; } msg.textContent = " All guides are saved on this device."; }
    catch (e) { msg.textContent = " Couldn't download everything. Check your connection."; btn.disabled = false; }
  }

  window.studyRoute = route;
  if (tabNow() === "study") route();
  window.studyStats = () => IX ? { guides: allGuides(), done: totalDone() } : null;
  window.addEventListener("storage", () => { /* backup import reloads the page */ });
})();
